import fs from 'fs/promises'
import path from 'path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MODULE_API_VERSION } from '@azerxim/sulfur-sdk'
import { builtinManifest } from '@modules/builtin'
import { createArchive } from '@azerxim/sulfur-sdk/archive'
import { tempDir } from './helpers'

/** Canaux IPC enregistrés (ipcMain simulé) : un second enregistrement du même canal échoue, comme Electron. */
const electron = vi.hoisted(() => ({ handlers: new Map(), userData: '' }))
vi.mock('electron', () => ({
  app: { getPath: () => electron.userData },
  protocol: {},
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: {
    handle(channel, fn) {
      if (electron.handlers.has(channel)) throw new Error(`Attempted to register a second handler for '${channel}'`)
      electron.handlers.set(channel, fn)
    },
    removeHandler: (channel) => electron.handlers.delete(channel)
  }
}))

const { ModuleHost } = await import('../src/main/module-host')
const { ExternalModules } = await import('../src/main/external-modules')
const { savePreferences } = await import('../src/main/preferences')

const invoke = (channel, ...args) => electron.handlers.get(channel)(null, ...args)

/** Module de test : un canal `ping`, des points publiés, un état « en marche » réglable. */
function fakeModule(id) {
  return {
    manifest: builtinManifest({ id, name: `Module ${id}` }),
    activations: 0,
    deactivations: 0,
    running: false,
    activate(ctx) {
      this.activations++
      this.ctx = ctx
      ctx.handle('ping', () => `${id}:${this.activations}`)
      ctx.expose({ name: id })
    },
    deactivate() {
      this.deactivations++
    },
    busy() {
      return this.running
    }
  }
}

let tmp, host, a, b, c

beforeAll(async () => {
  tmp = await tempDir('modules')
  electron.userData = tmp.dir
})
afterAll(() => tmp.cleanup())

beforeEach(async () => {
  electron.handlers.clear()
  host = new ModuleHost()
  a = fakeModule('a')
  b = fakeModule('b')
  c = fakeModule('c')
  await host.load([a, b, c], { disabled: ['b'] })
})

describe('Modules activés et désactivés', () => {
  it('n’active pas un module désactivé, mais garde sa configuration accessible', async () => {
    expect([a.activations, b.activations, c.activations]).toEqual([1, 0, 1])
    expect(electron.handlers.has('b:ping')).toBe(false)
    expect(await invoke('b:config:save', 'client', { host: 'plc1' })).toMatchObject({ ok: true })
    expect(await invoke('b:config:load')).toEqual({ ok: true, data: { client: { host: 'plc1' } } })
    expect(a.ctx.peers().map((p) => p.id)).toEqual(['c'])
    expect(host.activeModules().map((m) => m.manifest.id)).toEqual(['a', 'c'])
  })

  it('refuse de désactiver un module en marche', async () => {
    a.running = true
    await expect(host.setDisabled(['a'], ['a', 'b', 'c'])).rejects.toThrow(
      'Stop the servers and clients of these modules before disabling them: Module a'
    )
    expect(a.deactivations).toBe(0)
    expect([...host.disabled]).toEqual(['b'])
  })

  it('arrête un module désactivé et active aussitôt un module réactivé', async () => {
    expect(await host.setDisabled(['a'], ['a', 'b', 'c'])).toEqual(['a'])
    expect(a.deactivations).toBe(1)
    expect(electron.handlers.has('a:ping')).toBe(false)
    expect(electron.handlers.has('a:config:load')).toBe(true)
    expect(c.ctx.peers().map((p) => p.id)).toEqual(['b'])
    expect(await invoke('b:ping')).toEqual({ ok: true, data: 'b:1' })

    // Réactivation dans la même session : canaux enregistrés de nouveau sans conflit.
    expect(await host.setDisabled([], ['a', 'b', 'c'])).toEqual([])
    expect(await invoke('a:ping')).toEqual({ ok: true, data: 'a:2' })
    expect(
      c.ctx
        .peers()
        .map((p) => p.id)
        .sort()
    ).toEqual(['a', 'b'])
  })

  it('ignore les modules qui ne peuvent pas être désactivés', async () => {
    expect(await host.setDisabled(['system', 'b', 42], ['a', 'b', 'c'])).toEqual(['b'])
    expect(await host.setDisabled('a', ['a', 'b', 'c'])).toEqual([])
    expect(b.activations).toBe(1)
  })

  it('n’arrête à la fermeture que les modules actifs', async () => {
    await host.dispose()
    expect([a.deactivations, b.deactivations, c.deactivations]).toEqual([1, 0, 1])
  })
})

describe('Manifestes', () => {
  /** Module de test dont le manifeste est complété ou remplacé par `patch`. */
  const withManifest = (id, patch) => {
    const mod = fakeModule(id)
    mod.manifest = { ...mod.manifest, ...patch }
    return mod
  }

  it('refuse les modules incompatibles sans enregistrer leurs canaux', async () => {
    electron.handlers.clear()
    const other = new ModuleHost()
    const ok = fakeModule('ok')
    const future = withManifest('future', { minAppVersion: '99.0.0' })
    const api2 = withManifest('api2', { apiVersion: '2.0.0' })
    const twin = fakeModule('ok')
    const bad = withManifest('Bad Id', {})
    await other.load([ok, future, api2, twin, bad])
    expect(other.modules.map((m) => m.manifest.id)).toEqual(['ok'])
    expect(electron.handlers.has('future:config:load')).toBe(false)
    expect(future.activations).toBe(0)
    expect(other.rejected.map((r) => [r.id, r.reason])).toEqual([
      ['future', 'appTooOld'],
      ['api2', 'apiMajor'],
      ['ok', 'duplicateId'],
      ['Bad Id', 'invalid']
    ])
    expect(other.rejected[0].params).toEqual({ required: '99.0.0', current: future.manifest.version })
    expect(twin.activations).toBe(0)
  })

  it('retire un module dont l’activation échoue, sans arrêter les autres', async () => {
    electron.handlers.clear()
    const other = new ModuleHost()
    const broken = fakeModule('broken')
    broken.activate = function (ctx) {
      ctx.handle('ping', () => 'never')
      throw new Error('port busy')
    }
    const after = fakeModule('after')
    await other.load([broken, after])
    expect(other.modules.map((m) => m.manifest.id)).toEqual(['after'])
    expect([...other.active]).toEqual(['after'])
    expect(other.configs.has('broken')).toBe(false)
    expect([...electron.handlers.keys()].filter((ch) => ch.startsWith('broken:'))).toEqual([])
    expect(other.rejected).toEqual([
      {
        id: 'broken',
        name: 'Module broken',
        version: broken.manifest.version,
        reason: 'activateFailed',
        params: { message: 'port busy' }
      }
    ])
  })
})

describe('Modules externes', () => {
  let dir, other, external

  /** Paquet `id` dont la partie main répond `<id>:ping` par `answer` ; `busy()` lu dans globalThis. */
  async function writePackage(id, answer, manifest = {}) {
    const pkg = path.join(dir, id)
    await fs.mkdir(pkg, { recursive: true })
    const descriptor = {
      id,
      name: `Package ${id}`,
      version: '1.0.0',
      edition: 'standard',
      apiVersion: MODULE_API_VERSION,
      minAppVersion: '0.1.0',
      group: 'tools',
      renderer: 'renderer.mjs',
      main: 'main.mjs',
      ...manifest
    }
    await fs.writeFile(path.join(pkg, 'module.json'), JSON.stringify(descriptor))
    await fs.writeFile(
      path.join(pkg, 'main.mjs'),
      `export default {
        manifest: ${JSON.stringify(descriptor)},
        activate(ctx) { ctx.handle('ping', () => '${answer}') },
        busy: () => globalThis.sulfurTestBusy === true
      }`
    )
  }

  beforeEach(async () => {
    electron.handlers.clear()
    dir = path.join(tmp.dir, `packages-${Date.now()}`)
    await writePackage('ext', 'v1')
    await writePackage('broken', 'never', { apiVersion: '99.0.0' })
    other = new ModuleHost()
    await other.load([fakeModule('a')])
    external = new ExternalModules(other, { dir })
    savePreferences({ externalModules: true, disabledModules: [] })
  })

  it('charge les paquets après les modules intégrés et signale les refus', async () => {
    await external.load(true, ['ext', 'a'])
    expect(external.ids()).toEqual(['ext'])
    expect(other.modules.map((m) => m.manifest.id)).toEqual(['a', 'ext'])
    // Module externe désactivé : configuration chargée, module non activé.
    expect([...other.active]).toEqual(['a'])
    expect([...other.disabled]).toEqual(['ext'])
    expect(other.rejected.map((r) => [r.id, r.reason, r.external])).toEqual([['broken', 'apiMajor', true]])

    const none = new ExternalModules(new ModuleHost(), { dir })
    await none.load(false)
    expect([none.enabled, none.ids()]).toEqual([false, []])
  })

  it('actualise les paquets sans redémarrer : nouvelle version importée, refus relus', async () => {
    await external.load(true)
    expect(await invoke('ext:ping')).toEqual({ ok: true, data: 'v1' })
    await writePackage('ext', 'v2')
    await fs.rm(path.join(dir, 'broken'), { recursive: true })
    await external.reload()
    expect(await invoke('ext:ping')).toEqual({ ok: true, data: 'v2' })
    expect(other.modules.map((m) => m.manifest.id)).toEqual(['a', 'ext'])
    expect(other.rejected).toEqual([])
    expect(await invoke('a:ping')).toEqual({ ok: true, data: 'a:1' })
  })

  it('retire les modules externes quand leur chargement est désactivé', async () => {
    await external.load(true)
    savePreferences({ externalModules: false })
    await external.reload()
    expect([external.enabled, external.ids()]).toEqual([false, []])
    expect([...electron.handlers.keys()].filter((ch) => ch.startsWith('ext:'))).toEqual([])
    expect(other.configs.has('ext')).toBe(false)
    expect(other.rejected).toEqual([])
  })

  it('refuse d’actualiser un module externe en marche', async () => {
    await external.load(true)
    globalThis.sulfurTestBusy = true
    try {
      await expect(external.reload()).rejects.toThrow(
        'Stop the servers and clients of these modules before refreshing the external modules: Package ext'
      )
      expect(await invoke('ext:ping')).toEqual({ ok: true, data: 'v1' })
    } finally {
      delete globalThis.sulfurTestBusy
    }
  })

  /** Archive `.sulfur-module` d'un paquet comme ceux de writePackage. */
  function archiveOf(id, answer, manifest = {}) {
    const descriptor = {
      id,
      name: `Package ${id}`,
      version: '1.0.0',
      edition: 'additional',
      apiVersion: MODULE_API_VERSION,
      minAppVersion: '0.1.0',
      group: 'tools',
      renderer: 'renderer.mjs',
      main: 'main.mjs',
      ...manifest
    }
    const main = `export default {
      manifest: ${JSON.stringify(descriptor)},
      activate(ctx) { ctx.handle('ping', () => '${answer}') },
      busy: () => globalThis.sulfurTestBusy === true
    }`
    return createArchive([
      { name: 'module.json', data: Buffer.from(JSON.stringify(descriptor)) },
      { name: 'main.mjs', data: Buffer.from(main) },
      { name: 'renderer.mjs', data: Buffer.from('export default {}') }
    ])
  }

  it('liste les paquets installés, chargés ou non', async () => {
    await fs.mkdir(path.join(dir, 'empty'))
    await fs.mkdir(path.join(dir, '.hidden'))
    await external.load(true)
    expect(await external.installed()).toEqual([
      {
        id: 'broken',
        name: 'Package broken',
        version: '1.0.0',
        author: null,
        description: null,
        folder: 'broken',
        loaded: false
      },
      { id: 'empty', name: 'empty', version: '?', author: null, description: null, folder: 'empty', loaded: false },
      { id: 'ext', name: 'Package ext', version: '1.0.0', author: null, description: null, folder: 'ext', loaded: true }
    ])
  })

  it('vérifie une archive avant de l’installer, puis l’installe après confirmation', async () => {
    const info = await external.inspect(archiveOf('new', 'n1', { author: 'Jane Doe', description: 'New module' }))
    expect(info).toMatchObject({
      id: 'new',
      name: 'Package new',
      version: '1.0.0',
      author: 'Jane Doe',
      description: 'New module',
      files: 3,
      installed: null
    })
    // Rien n'est écrit avant la confirmation.
    expect((await external.installed()).map((p) => p.id)).toEqual(['broken', 'ext'])
    await expect(external.install('other-token')).rejects.toThrow('no longer waiting')

    expect(await external.install(info.token)).toEqual({ id: 'new', reload: false })
    expect((await external.installed()).find((p) => p.id === 'new')).toMatchObject({
      folder: 'new',
      author: 'Jane Doe'
    })
    expect((await fs.readdir(dir)).filter((name) => name.startsWith('.'))).toEqual([])
    await expect(external.install(info.token)).rejects.toThrow('no longer waiting')

    await external.load(true)
    expect(await invoke('new:ping')).toEqual({ ok: true, data: 'n1' })
  })

  it('applique à un module installé la configuration conservée à l’import', async () => {
    const { keepConfigs } = await import('../src/main/config-transfer')
    keepConfigs(path.join(electron.userData, 'modules'), { kept: { generator: { period: 5 } } })
    await external.install((await external.inspect(archiveOf('kept', 'k1'))).token)
    await external.load(true)
    expect(other.configs.get('kept').get()).toEqual({ generator: { period: 5 } })
  })

  it('met à jour un paquet installé, même dans un dossier d’un autre nom', async () => {
    await fs.rename(path.join(dir, 'ext'), path.join(dir, 'ext-copy'))
    await external.load(true)
    const info = await external.inspect(archiveOf('ext', 'v2', { version: '2.0.0' }))
    expect(info.installed).toBe('1.0.0')
    expect(await external.install(info.token)).toEqual({ id: 'ext', reload: true })
    expect((await external.installed()).filter((p) => p.id === 'ext')).toMatchObject([
      { folder: 'ext', version: '2.0.0' }
    ])
    await external.reload()
    expect(await invoke('ext:ping')).toEqual({ ok: true, data: 'v2' })
  })

  it('refuse une archive invalide ou un module intégré', async () => {
    await expect(external.inspect(Buffer.from('not a zip'))).rejects.toThrow(
      'Module package refused: invalid archive: not a ZIP file'
    )
    await expect(external.inspect(archiveOf('a', 'x'))).rejects.toThrow(
      'Module package refused: another module already uses the identifier “a”'
    )
    await expect(external.inspect(archiveOf('later', 'x', { minAppVersion: '99.0.0' }))).rejects.toThrow(
      /update Sulfur/
    )
    expect(external.pending).toBeNull()
  })

  it('n’installe ni ne supprime un module externe en marche', async () => {
    await external.load(true)
    const info = await external.inspect(archiveOf('ext', 'v2', { version: '2.0.0' }))
    globalThis.sulfurTestBusy = true
    try {
      await expect(external.install(info.token)).rejects.toThrow(/Stop the servers and clients/)
      await expect(external.remove('ext')).rejects.toThrow(/Stop the servers and clients/)
    } finally {
      delete globalThis.sulfurTestBusy
    }
    expect((await external.installed()).find((p) => p.id === 'ext').version).toBe('1.0.0')
  })

  it('supprime un paquet', async () => {
    await external.load(true)
    expect(await external.remove('broken')).toEqual({ id: 'broken', reload: false })
    expect(await external.remove('ext')).toEqual({ id: 'ext', reload: true })
    expect(await external.installed()).toEqual([])
    await expect(external.remove('ext')).rejects.toThrow('No package installed for the module “ext”')
  })
})
