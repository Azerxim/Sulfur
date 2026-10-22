import fs from 'fs/promises'
import path from 'path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import tailwindcss from '@tailwindcss/vite'
import { SHARED_GLOBAL, checkManifest, setLanguage } from '@azerxim/sulfur-sdk'
import { readModuleArchive } from '@azerxim/sulfur-sdk/archive'
import { buildModule, packModule } from '@azerxim/sulfur-sdk/build'
import { APP_VERSION } from '@shared/app'
import { tempDir } from './helpers'

vi.mock('electron', () => ({ protocol: {} }))

const { loadModulePackages, provideSharedModules } = await import('../src/main/module-packages')
const { manifest, DEFAULTS } = await import('../examples/module-template/src/manifest.js')

const ROOT = path.resolve('examples/module-template')
// Hors du dépôt, le CSS du SDK vient du paquet installé ; ici, de ses sources.
const alias = { '@azerxim/sulfur-sdk/module.css': path.resolve('packages/sdk/src/ui/module.css') }

let tmp, packagesDir, archive

beforeAll(async () => {
  tmp = await tempDir('template')
  packagesDir = path.join(tmp.dir, 'module-packages')
  // Mêmes options que build.mjs du modèle.
  await buildModule({
    manifest,
    group: 'tools',
    root: ROOT,
    renderer: 'src/renderer/index.jsx',
    main: 'src/main/index.js',
    outDir: path.join(packagesDir, manifest.id),
    vite: {
      renderer: { plugins: [tailwindcss()], resolve: { alias }, logLevel: 'error' },
      main: { logLevel: 'error' }
    }
  })
  archive = await packModule(path.join(packagesDir, manifest.id), path.join(tmp.dir, 'my-module.sulfur-module'))
}, 60_000)

afterAll(async () => {
  setLanguage('en')
  delete globalThis[SHARED_GLOBAL]
  await tmp.cleanup()
})

describe('Modèle de module', () => {
  it('a un manifeste valide pour cette version de Sulfur', () => {
    expect(manifest).toMatchObject({ id: 'my-module', edition: 'additional', author: 'Your name' })
    expect(checkManifest(manifest, { appVersion: APP_VERSION })).toBeNull()
  })

  it('se construit en une archive installable', async () => {
    const { descriptor, files } = readModuleArchive(await fs.readFile(archive))
    expect(descriptor).toMatchObject({ ...manifest, group: 'tools', renderer: 'renderer.mjs', main: 'main.mjs' })
    expect([...files.keys()].sort()).toEqual(['main.mjs', 'module.json', 'renderer.mjs', 'style.css'])
    expect(files.get('style.css').toString()).toContain('var(--color-slate-100')
  })

  it('se charge et fait tourner son process principal', async () => {
    provideSharedModules()
    const { modules, rejected } = await loadModulePackages(packagesDir, { appVersion: APP_VERSION })
    expect(rejected).toEqual([])
    const [mod] = modules
    const handlers = new Map()
    let api
    const events = []
    mod.activate({
      config: () => ({ counter: { step: 2 } }),
      handle: (action, fn) => handlers.set(action, fn),
      emit: (event, payload) => events.push([event, payload]),
      expose: (exposed) => (api = exposed),
      log() {}
    })
    expect(api.points().map((p) => p.id)).toEqual(['value', 'step', 'running'])
    expect(handlers.get('state')()).toEqual({ value: 0, step: 2, running: false })
    expect(() => handlers.get('start')({ interval: 10 })).toThrow('between 100 and 60000')

    vi.useFakeTimers()
    try {
      expect(handlers.get('start')({ ...DEFAULTS, step: 5 })).toMatchObject({ running: true, step: 5 })
      expect(mod.busy()).toBe(true)
      vi.advanceTimersByTime(3000)
      expect(api.read(['value', 'running'])).toEqual({ value: 15, running: true })
      expect(await handlers.get('step')('3')).toBe(3)
      await expect(api.write('value', 1)).rejects.toThrow('read-only')
      handlers.get('stop')()
      expect(mod.busy()).toBe(false)
      expect(events.at(-1)).toEqual(['state', { value: 15, step: 3, running: false }])
    } finally {
      mod.deactivate()
      vi.useRealTimers()
    }
  })
})
