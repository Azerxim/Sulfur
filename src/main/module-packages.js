import { protocol } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import { pathToFileURL } from 'url'
import * as sdk from '@azerxim/sulfur-sdk'
import * as sdkMain from '@azerxim/sulfur-sdk/main'
import { MODULE_PACKAGE_FILE, SHARED_GLOBAL, checkManifest, checkPackage, packageManifest } from '@azerxim/sulfur-sdk'

/** Schéma des fichiers des paquets servis à l'interface : `sulfur-module://<id>/<fichier>`. */
export const MODULE_SCHEME = 'sulfur-module'

/** Modules partagés côté process principal (SHARED_MODULES.main) : une seule instance du SDK. */
export function provideSharedModules() {
  globalThis[SHARED_GLOBAL] = Object.freeze({ '@azerxim/sulfur-sdk': sdk, '@azerxim/sulfur-sdk/main': sdkMain })
}

/** Import d'un fichier de paquet, relu à chaque actualisation (Node garde en cache chaque URL importée). */
const importFile = (file) => import(`${pathToFileURL(file).href}?v=${Date.now()}`)

/** Dossiers de paquets parmi les entrées d'un dossier : dossiers non cachés, par ordre alphabétique. */
export const packageDirs = (entries) =>
  entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).sort((a, b) => a.name.localeCompare(b.name))

/**
 * Paquets de modules externes installés dans `dir` (un dossier par paquet, voir `package.js` du
 * SDK ; les dossiers cachés, comme une installation en cours, sont ignorés). Le descripteur module.json de chaque paquet est vérifié avant tout code : manifeste,
 * fichiers, compatibilité et identifiant libre (`loadedIds` : modules intégrés). La partie main du
 * module est ensuite importée ; un paquet sans partie main n'a que son interface.
 * Retourne { modules, packages: [{ id, dir, descriptor }], rejected: [{ id, name, version, reason, params }] }.
 */
export async function loadModulePackages(dir, { appVersion, loadedIds = [], importModule = importFile } = {}) {
  const result = { modules: [], packages: [], rejected: [] }
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  const ids = [...loadedIds]
  for (const entry of packageDirs(entries)) {
    const packageDir = path.join(dir, entry.name)
    const reject = (descriptor, reason, params = {}) =>
      result.rejected.push({
        id: String(descriptor?.id ?? entry.name),
        name: String(descriptor?.name ?? descriptor?.id ?? entry.name),
        version: String(descriptor?.version ?? '?'),
        reason,
        params
      })

    let descriptor
    try {
      descriptor = JSON.parse(await fs.readFile(path.join(packageDir, MODULE_PACKAGE_FILE), 'utf8'))
    } catch (err) {
      reject(null, 'unreadable', { file: MODULE_PACKAGE_FILE, message: err.message })
      continue
    }
    const manifest = packageManifest(descriptor)
    const problem = checkManifest(manifest, { appVersion, loadedIds: ids }) ?? checkPackage(descriptor)
    if (problem) {
      reject(descriptor, problem.reason, problem.params)
      continue
    }

    let mod = { manifest, activate() {} }
    if (descriptor.main) {
      try {
        mod = (await importModule(path.join(packageDir, descriptor.main))).default
      } catch (err) {
        reject(descriptor, 'loadFailed', { message: err.message })
        continue
      }
      if (typeof mod?.activate !== 'function') {
        reject(descriptor, 'invalid', { field: 'main' })
        continue
      }
      if (mod.manifest?.id !== manifest.id || mod.manifest?.version !== manifest.version) {
        reject(descriptor, 'mismatch', { file: descriptor.main })
        continue
      }
    }
    ids.push(manifest.id)
    result.modules.push(mod)
    result.packages.push({ id: manifest.id, dir: packageDir, descriptor })
  }
  return result
}

const CONTENT_TYPES = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm'
}

/**
 * Fichier d'un paquet demandé par l'interface (`sulfur-module://<id>/<chemin>`) : { file, type },
 * ou null s'il n'existe pas ou sort du dossier du paquet (liens symboliques compris).
 */
export async function packageFile(packages, url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const pkg = packages.find((p) => p.id === parsed.hostname)
  if (parsed.protocol !== `${MODULE_SCHEME}:` || !pkg) return null
  let relative
  try {
    relative = decodeURIComponent(parsed.pathname)
  } catch {
    return null
  }
  try {
    const root = await fs.realpath(pkg.dir)
    const file = await fs.realpath(path.join(root, ...relative.split('/').filter(Boolean)))
    if (!file.startsWith(root + path.sep) || !(await fs.stat(file)).isFile()) return null
    return { file, type: CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream' }
  } catch {
    return null
  }
}

/** URL d'un fichier de paquet pour l'interface. */
export const packageUrl = (id, file) => `${MODULE_SCHEME}://${id}/${file.split('/').map(encodeURIComponent).join('/')}`

/** Schéma des paquets déclaré avant le démarrage d'Electron (modules ES, fetch, CORS). */
export function registerModuleScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: MODULE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
  ])
}

/** Sert à l'interface les fichiers des paquets chargés (`packages()` : voir loadModulePackages). */
export function serveModulePackages(packages) {
  protocol.handle(MODULE_SCHEME, async (request) => {
    const found = await packageFile(packages(), request.url)
    if (!found) return new Response('Not found', { status: 404 })
    return new Response(await fs.readFile(found.file), {
      headers: { 'Content-Type': found.type, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' }
    })
  })
}
