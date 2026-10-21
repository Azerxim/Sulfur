/**
 * SDK des modules Sulfur — construction d'un paquet de module externe (Node, avec Vite) :
 * `buildModule` produit le dossier du paquet (module.json, renderer.mjs, main.mjs, style.css) et
 * `sulfurShared` remplace les imports fournis par l'application (React, SDK) par une lecture de
 * `globalThis[SHARED_GLOBAL]`, pour qu'ils ne soient pas embarqués dans le paquet.
 */
import fs from 'fs/promises'
import path from 'path'
import { build } from 'vite'
import { MODULE_PACKAGE_FILE, SHARED_GLOBAL, SHARED_MODULES, checkPackage } from '../package.js'
import { checkManifest } from '../manifest.js'

const SHARED_PREFIX = '\0sulfur-shared:'
const SDK_PATTERN = /^@azerxim\/sulfur-sdk(\/.*)?$/

/** Avertissements Rollup sans objet pour un paquet (directives « use client » des bibliothèques React). */
const onwarn = (warning, warn) => warning.code !== 'MODULE_LEVEL_DIRECTIVE' && warn(warning)

/**
 * Plugin Vite / Rollup : les imports partagés de `side` ('main' ou 'renderer', voir SHARED_MODULES)
 * sont lus dans les modules publiés par l'application ; les imports nommés sont résolus à
 * l'exécution. Un point d'entrée du SDK qui n'existe pas de ce côté (`/ui` côté main, `/host`)
 * arrête la construction.
 */
export function sulfurShared(side) {
  const shared = SHARED_MODULES[side]
  if (!shared) throw new Error(`sulfurShared : côté inconnu « ${side} » (main ou renderer)`)
  return {
    name: 'sulfur-shared',
    enforce: 'pre',
    resolveId(source) {
      if (shared.includes(source)) return { id: SHARED_PREFIX + source, syntheticNamedExports: '__shared' }
      if (SDK_PATTERN.test(source)) this.error(`« ${source} » n'est pas disponible côté ${side} d'un module externe`)
      return null
    },
    load(id) {
      if (!id.startsWith(SHARED_PREFIX)) return null
      const name = JSON.stringify(id.slice(SHARED_PREFIX.length))
      return [
        `const shared = globalThis[${JSON.stringify(SHARED_GLOBAL)}]?.[${name}]`,
        `if (!shared) throw new Error('Module partagé ' + ${name} + ' non fourni par Sulfur')`,
        'export const __shared = shared',
        'export default shared.default ?? shared'
      ].join('\n')
    }
  }
}

/**
 * Construit le paquet d'un module externe dans `outDir` (vidé au préalable) :
 *  - `manifest` : manifeste du module (defineManifest), recopié dans module.json ;
 *  - `group` : groupe de la barre latérale ('tools', 'automation' ou 'it') ;
 *  - `renderer` : point d'entrée de l'interface (export par défaut { manifest, icon, Component }) ;
 *    le CSS qu'il importe devient style.css ;
 *  - `main` : point d'entrée du process principal (facultatif) ; les dépendances npm sont
 *    embarquées, les modules de Node restent des imports ;
 *  - `root` : dossier du projet (par défaut le dossier courant) ;
 *  - `vite` : { renderer, main } : options Vite ajoutées à chaque construction (plugins…).
 * Retourne le descripteur écrit dans module.json.
 */
export async function buildModule({ manifest, group, renderer, main, root = process.cwd(), outDir, vite = {} }) {
  const problem = checkManifest(manifest, { appVersion: manifest?.minAppVersion })
  if (problem) throw new Error(`Manifeste invalide : ${problem.reason} ${JSON.stringify(problem.params)}`)
  const out = path.resolve(root, outDir ?? 'dist')
  await fs.rm(out, { recursive: true, force: true })
  const common = (side, options = {}) => ({
    ...options,
    root,
    mode: 'production',
    configFile: false,
    logLevel: options.logLevel ?? 'warn',
    plugins: [sulfurShared(side), ...(options.plugins ?? [])],
    define: { 'process.env.NODE_ENV': '"production"', ...options.define },
    esbuild: { jsx: 'automatic', jsxDev: false, ...options.esbuild }
  })

  await build({
    ...common('renderer', vite.renderer),
    build: {
      outDir: out,
      emptyOutDir: false,
      target: 'chrome130',
      lib: {
        entry: path.resolve(root, renderer),
        formats: ['es'],
        fileName: () => 'renderer.mjs',
        cssFileName: 'style'
      },
      rollupOptions: { onwarn },
      ...vite.renderer?.build
    }
  })
  if (main) {
    await build({
      ...common('main', vite.main),
      ssr: { noExternal: true, target: 'node', ...vite.main?.ssr },
      build: {
        outDir: out,
        emptyOutDir: false,
        target: 'node22',
        ssr: path.resolve(root, main),
        rollupOptions: { onwarn, output: { format: 'es', entryFileNames: 'main.mjs' } },
        ...vite.main?.build
      }
    })
  }

  const hasStyle = await fs
    .access(path.join(out, 'style.css'))
    .then(() => true)
    .catch(() => false)
  const descriptor = {
    ...manifest,
    group,
    renderer: 'renderer.mjs',
    ...(main ? { main: 'main.mjs' } : {}),
    ...(hasStyle ? { style: 'style.css' } : {})
  }
  const invalid = checkPackage(descriptor)
  if (invalid) throw new Error(`Paquet invalide : champ « ${invalid.params.field} »`)
  await fs.writeFile(path.join(out, MODULE_PACKAGE_FILE), `${JSON.stringify(descriptor, null, 2)}\n`)
  return descriptor
}
