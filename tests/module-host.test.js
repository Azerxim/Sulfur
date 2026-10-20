import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { tempDir } from './helpers'

/** Canaux IPC enregistrés (ipcMain simulé) : un second enregistrement du même canal échoue, comme Electron. */
const electron = vi.hoisted(() => ({ handlers: new Map(), userData: '' }))
vi.mock('electron', () => ({
  app: { getPath: () => electron.userData },
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

const invoke = (channel, ...args) => electron.handlers.get(channel)(null, ...args)

/** Module de test : un canal `ping`, des points publiés, un état « en marche » réglable. */
function fakeModule(id) {
  return {
    manifest: { id, name: `Module ${id}` },
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
