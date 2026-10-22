import fs from 'fs/promises'
import path from 'path'
import { pathToFileURL } from 'url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import * as ReactDOM from 'react-dom'
import { renderToStaticMarkup } from 'react-dom/server'
import tailwindcss from '@tailwindcss/vite'
import * as sdk from '@azerxim/sulfur-sdk'
import * as sdkUi from '@azerxim/sulfur-sdk/ui'
import { SHARED_GLOBAL, SHARED_MODULES, checkPackage, packageManifest, setLanguage } from '@azerxim/sulfur-sdk'
import { buildModule, sulfurShared } from '@azerxim/sulfur-sdk/build'
import { APP_VERSION } from '@shared/app'
import { tempDir } from './helpers'

vi.mock('electron', () => ({ protocol: {} }))
// Les composants du SDK enregistrent la configuration des modules à la fermeture de la fenêtre.
vi.hoisted(() => {
  globalThis.window ??= { addEventListener() {} }
})

const { loadModulePackages, packageFile, packageUrl, provideSharedModules } =
  await import('../src/main/module-packages')

const FIXTURE = path.resolve('tests/fixtures/external-module')
const MANIFEST = {
  id: 'demo',
  name: 'Demo',
  description: 'External test module',
  version: '1.2.0',
  edition: 'standard',
  apiVersion: sdk.MODULE_API_VERSION,
  minAppVersion: '0.4.0'
}

let tmp, packagesDir, descriptor

/** Paquet écrit à la main dans `parent` : module.json et fichiers. */
async function writePackage(parent, name, files) {
  const dir = path.join(parent, name)
  await fs.mkdir(dir, { recursive: true })
  for (const [file, content] of Object.entries(files)) {
    await fs.writeFile(path.join(dir, file), typeof content === 'string' ? content : JSON.stringify(content))
  }
}

beforeAll(async () => {
  tmp = await tempDir('packages')
  packagesDir = path.join(tmp.dir, 'module-packages')
  descriptor = await buildModule({
    manifest: MANIFEST,
    group: 'tools',
    root: FIXTURE,
    renderer: 'src/renderer.jsx',
    main: 'src/main.js',
    outDir: path.join(packagesDir, 'demo'),
    vite: { renderer: { plugins: [tailwindcss()], logLevel: 'error' }, main: { logLevel: 'error' } }
  })
})

afterAll(async () => {
  setLanguage('en')
  delete globalThis[SHARED_GLOBAL]
  await tmp.cleanup()
})

describe('Descripteur d’un paquet', () => {
  const base = { ...MANIFEST, group: 'tools', renderer: 'renderer.mjs' }

  it('vérifie le groupe et les fichiers', () => {
    expect(checkPackage(base)).toBeNull()
    expect(checkPackage({ ...base, main: 'dist/main.js', style: 'style.css' })).toBeNull()
    const field = (patch) => checkPackage({ ...base, ...patch })?.params.field
    expect(field({ group: 'games' })).toBe('group')
    expect(field({ renderer: undefined })).toBe('renderer')
    expect(field({ renderer: '../renderer.mjs' })).toBe('renderer')
    expect(field({ renderer: '/tmp/renderer.mjs' })).toBe('renderer')
    expect(field({ renderer: 'C:/renderer.mjs' })).toBe('renderer')
    expect(field({ main: 'main.cjs' })).toBe('main')
    expect(field({ main: '.hidden/main.mjs' })).toBe('main')
    expect(field({ style: 'style.js' })).toBe('style')
  })

  it('contient le manifeste', () => {
    expect(packageManifest({ ...base, extra: 1 })).toEqual(MANIFEST)
  })
})

describe('Construction d’un paquet (buildModule)', () => {
  it('écrit module.json et les fichiers du paquet', async () => {
    expect(descriptor).toEqual({
      ...MANIFEST,
      group: 'tools',
      renderer: 'renderer.mjs',
      main: 'main.mjs',
      style: 'style.css'
    })
    const written = JSON.parse(await fs.readFile(path.join(packagesDir, 'demo/module.json'), 'utf8'))
    expect(written).toEqual(descriptor)
  })

  it('n’embarque ni React ni le SDK', async () => {
    const renderer = await fs.readFile(path.join(packagesDir, 'demo/renderer.mjs'), 'utf8')
    const main = await fs.readFile(path.join(packagesDir, 'demo/main.mjs'), 'utf8')
    for (const name of SHARED_MODULES.renderer.filter((n) => n !== 'react-dom')) {
      expect(renderer).toContain(`Module partagé ${name} non fourni`)
    }
    expect(renderer).toContain(`globalThis.${SHARED_GLOBAL}`)
    expect(renderer).not.toMatch(/ReactCurrentDispatcher|__CLIENT_INTERNALS|function registerMessages/)
    expect(renderer.length).toBeLessThan(20_000)
    expect(main).toContain('Module partagé @azerxim/sulfur-sdk/main non fourni')
    expect(main).not.toMatch(/function virtualPath|function registerMessages/)
  })

  it('produit les seuls utilitaires Tailwind, sur les variables du thème de Sulfur', async () => {
    const style = await fs.readFile(path.join(packagesDir, 'demo/style.css'), 'utf8')
    expect(style).toContain('.bg-ink-850')
    expect(style).toContain('var(--color-ink-850')
    expect(style).toContain('.text-sulfur-300')
    // Ni variables du thème, ni styles de base : l'application les fournit.
    expect(style).not.toMatch(/--color-ink-850\s*:|box-sizing|@layer (base|theme)/)
  })

  it('refuse un point d’entrée du SDK absent de ce côté', async () => {
    const plugin = sulfurShared('main')
    const ctx = {
      error: (message) => {
        throw new Error(message)
      }
    }
    expect(plugin.resolveId.call(ctx, '@azerxim/sulfur-sdk/main')).toMatchObject({ syntheticNamedExports: '__shared' })
    expect(plugin.resolveId.call(ctx, 'lodash')).toBeNull()
    expect(() => plugin.resolveId.call(ctx, '@azerxim/sulfur-sdk/ui')).toThrow(/ui.*main/)
    expect(() => sulfurShared('renderer').resolveId.call(ctx, '@azerxim/sulfur-sdk/host')).toThrow(/host/)
  })
})

describe('Chargement des paquets', () => {
  it('importe le module avec le SDK de l’application', async () => {
    provideSharedModules()
    expect(Object.keys(globalThis[SHARED_GLOBAL]).sort()).toEqual([...SHARED_MODULES.main].sort())

    const { modules, packages, rejected } = await loadModulePackages(packagesDir, { appVersion: APP_VERSION })
    expect(rejected).toEqual([])
    expect(packages).toEqual([{ id: 'demo', dir: path.join(packagesDir, 'demo'), descriptor }])
    const [mod] = modules
    expect(mod.manifest).toEqual(MANIFEST)

    const handlers = new Map()
    mod.activate({ handle: (action, fn) => handlers.set(action, fn) })
    // Langue changée par l'application : le module la suit (une seule instance du SDK).
    setLanguage('fr')
    expect(handlers.get('hello')('Sulfur')).toBe('Bonjour Sulfur')
    setLanguage('en')
    expect(handlers.get('hello')('Sulfur')).toBe('Hello Sulfur')
    expect(handlers.get('path')('a/../b')).toBe('/b')
  })

  it('affiche l’interface avec le React de l’application', async () => {
    globalThis[SHARED_GLOBAL] = {
      react: React,
      'react/jsx-runtime': jsxRuntime,
      'react-dom': ReactDOM,
      '@azerxim/sulfur-sdk': sdk,
      '@azerxim/sulfur-sdk/ui': sdkUi
    }
    const file = path.join(packagesDir, 'demo/renderer.mjs')
    const mod = (await import(/* @vite-ignore */ pathToFileURL(file).href)).default
    expect(mod.manifest.id).toBe('demo')
    const html = renderToStaticMarkup(createElement(mod.Component))
    expect(html).toContain('Hello Sulfur')
    expect(html).toContain('Clicked 0 time(s)')
    expect(html).toContain('class="bg-ink-850 text-sulfur-300"')
  })

  it('fournit les modules partagés attendus par les paquets côté interface', async () => {
    const source = await fs.readFile('src/renderer/src/external-modules.js', 'utf8')
    const block = source.slice(
      source.indexOf('Object.freeze({'),
      source.indexOf('})', source.indexOf('Object.freeze({'))
    )
    const keys = [...block.matchAll(/^\s*'?([^':\s]+)'?:/gm)].map((m) => m[1])
    expect(keys.sort()).toEqual([...SHARED_MODULES.renderer].sort())
  })

  it('refuse les paquets invalides avant d’en exécuter le code', async () => {
    const dir = path.join(tmp.dir, 'rejected')
    const main = (body) => `export default ${body}`
    const pkg = (patch = {}) => ({ ...MANIFEST, group: 'it', renderer: 'renderer.mjs', main: 'main.mjs', ...patch })
    await writePackage(dir, 'a-unreadable', { 'module.json': '{ not json' })
    await writePackage(dir, 'b-group', { 'module.json': pkg({ id: 'b', group: 'games' }) })
    await writePackage(dir, 'c-api', {
      'module.json': pkg({ id: 'c', apiVersion: '2.0.0' }),
      'main.mjs': 'globalThis.sulfurPackageRan = true'
    })
    await writePackage(dir, 'd-builtin', { 'module.json': pkg({ id: 'syslog' }) })
    await writePackage(dir, 'e-throws', { 'module.json': pkg({ id: 'e' }), 'main.mjs': 'throw new Error("boom")' })
    await writePackage(dir, 'f-mismatch', {
      'module.json': pkg({ id: 'f' }),
      'main.mjs': main(`{ manifest: { id: 'other', version: '1.2.0' }, activate() {} }`)
    })
    await writePackage(dir, 'g-no-activate', { 'module.json': pkg({ id: 'g' }), 'main.mjs': main(`{ manifest: {} }`) })
    await writePackage(dir, 'h-ui-only', { 'module.json': pkg({ id: 'h', main: undefined }) })
    await writePackage(dir, 'i-duplicate', { 'module.json': pkg({ id: 'h', main: undefined }) })
    await fs.writeFile(path.join(dir, 'not-a-folder.txt'), '')

    const { modules, packages, rejected } = await loadModulePackages(dir, {
      appVersion: APP_VERSION,
      loadedIds: ['syslog']
    })
    expect(globalThis.sulfurPackageRan).toBeUndefined()
    expect(rejected.map(({ id, reason, params }) => [id, reason, params.field ?? params.id ?? params.file])).toEqual([
      ['a-unreadable', 'unreadable', 'module.json'],
      ['b', 'invalid', 'group'],
      ['c', 'apiMajor', undefined],
      ['syslog', 'duplicateId', 'syslog'],
      ['e', 'loadFailed', undefined],
      ['f', 'mismatch', 'main.mjs'],
      ['g', 'invalid', 'main'],
      ['h', 'duplicateId', 'h']
    ])
    expect(rejected[4].params.message).toBe('boom')
    // Paquet sans partie main : le module n'a que son interface (et sa configuration).
    expect(packages.map((p) => p.id)).toEqual(['h'])
    expect(modules[0].manifest).toEqual({ ...MANIFEST, id: 'h' })
    expect(() => modules[0].activate({})).not.toThrow()
    expect(await loadModulePackages(path.join(tmp.dir, 'missing'), { appVersion: APP_VERSION })).toEqual({
      modules: [],
      packages: [],
      rejected: []
    })
  })
})

describe('Fichiers servis à l’interface', () => {
  let packages

  beforeAll(async () => {
    packages = [{ id: 'demo', dir: path.join(tmp.dir, 'module-packages/demo') }]
    await fs.writeFile(path.join(tmp.dir, 'secret.txt'), 'secret')
    await fs.symlink(path.join(tmp.dir, 'secret.txt'), path.join(packages[0].dir, 'link.txt'))
  })

  it('sert les fichiers du paquet avec leur type', async () => {
    expect(packageUrl('demo', 'renderer.mjs')).toBe('sulfur-module://demo/renderer.mjs')
    expect(await packageFile(packages, 'sulfur-module://demo/renderer.mjs')).toEqual({
      file: await fs.realpath(path.join(packages[0].dir, 'renderer.mjs')),
      type: 'text/javascript'
    })
    expect((await packageFile(packages, 'sulfur-module://demo/style.css')).type).toBe('text/css')
  })

  it('ne sort pas du dossier du paquet', async () => {
    for (const url of [
      'sulfur-module://demo/../secret.txt',
      'sulfur-module://demo/%2e%2e%2fsecret.txt',
      'sulfur-module://demo/..%2f..%2fsecret.txt',
      'sulfur-module://demo/link.txt',
      'sulfur-module://demo/',
      'sulfur-module://demo/missing.mjs',
      'sulfur-module://other/renderer.mjs',
      'file:///etc/passwd',
      'sulfur-module://demo/%E0%A4%A'
    ]) {
      expect([url, await packageFile(packages, url)]).toEqual([url, null])
    }
  })
})
