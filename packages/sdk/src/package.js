/**
 * Paquets de modules externes : un module développé hors du dépôt de Sulfur est livré dans un
 * dossier qui contient son descripteur `module.json` et ses fichiers construits (voir `buildModule`
 * de `@azerxim/sulfur-sdk/build`) :
 *
 *   module.json    manifeste du module (champs de `defineManifest`) et fichiers du paquet :
 *                    group     groupe de la barre latérale ('tools', 'automation' ou 'it')
 *                    renderer  interface : module ES dont l'export par défaut est { manifest, icon, Component }
 *                    main      process principal (facultatif) : module ES dont l'export par défaut est
 *                              { manifest, activate(ctx), deactivate(), busy(), migrateConfig() }
 *                    style     feuille de style de l'interface (facultative)
 *   renderer.mjs, main.mjs, style.css…
 *
 * Le descripteur est vérifié (checkPackage, puis checkManifest) avant qu'aucun code du paquet ne
 * soit exécuté.
 *
 * Les modules partagés (React, SDK) ne sont pas embarqués dans les fichiers du paquet : l'application
 * les publie dans `globalThis[SHARED_GLOBAL]` et le code construit les y lit (plugin `sulfurShared`).
 * Les modules partagés ont ainsi une seule instance (traductions, langue, état de React).
 */

export const MODULE_PACKAGE_FILE = 'module.json'

/** Groupes de la barre latérale (libellés : app.groups.*). */
export const MODULE_GROUPS = ['tools', 'automation', 'it']

/** Propriété de `globalThis` où l'application publie les modules partagés : { [import]: module }. */
export const SHARED_GLOBAL = '__sulfurShared'

/** Imports fournis par l'application, par côté : ils ne sont pas embarqués dans un paquet. */
export const SHARED_MODULES = {
  main: ['@azerxim/sulfur-sdk', '@azerxim/sulfur-sdk/main'],
  renderer: ['react', 'react/jsx-runtime', 'react-dom', '@azerxim/sulfur-sdk', '@azerxim/sulfur-sdk/ui']
}

const MANIFEST_FIELDS = ['id', 'name', 'description', 'version', 'author', 'edition', 'apiVersion', 'minAppVersion']

/** Fichier d'un paquet : chemin relatif sans « .. » ni dossier caché, avec l'extension attendue. */
const isPackageFile = (file, extensions) =>
  typeof file === 'string' &&
  extensions.some((ext) => file.endsWith(ext)) &&
  !file.startsWith('/') &&
  !file.includes('\\') &&
  !/^[a-zA-Z]:/.test(file) &&
  file.split('/').every((part) => part && !part.startsWith('.'))

/**
 * Fichiers d'un descripteur `module.json` vérifiés. Retourne le premier problème
 * { reason: 'invalid', params: { field } }, ou null. Le manifeste se vérifie avec checkManifest.
 */
export function checkPackage(descriptor) {
  const d = descriptor ?? {}
  const invalid = (field) => ({ reason: 'invalid', params: { field } })
  if (!MODULE_GROUPS.includes(d.group)) return invalid('group')
  if (!isPackageFile(d.renderer, ['.js', '.mjs'])) return invalid('renderer')
  if (d.main !== undefined && !isPackageFile(d.main, ['.js', '.mjs'])) return invalid('main')
  if (d.style !== undefined && !isPackageFile(d.style, ['.css'])) return invalid('style')
  return null
}

/** Manifeste contenu dans un descripteur `module.json`. */
export const packageManifest = (descriptor) =>
  Object.fromEntries(MANIFEST_FIELDS.filter((key) => descriptor?.[key] !== undefined).map((k) => [k, descriptor[k]]))
