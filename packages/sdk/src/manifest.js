/**
 * Contrat commun à tous les modules de simulation.
 *
 * Un module est composé de deux parties :
 *  - une partie "main" (process Electron/Node) : objet { manifest, activate(ctx), deactivate(), busy() }
 *    qui expose des handlers IPC nommés `<moduleId>:<action>` et peut émettre des événements ;
 *  - une partie "renderer" (React) : objet { manifest, icon, Component } qui fournit l'interface.
 *
 * Manifeste (le même objet pour les deux parties) :
 *   id             identifiant, préfixe des canaux IPC (`[a-z0-9-]+`)
 *   name           nom affiché (repli si le module ne le traduit pas : `<id>.name`)
 *   description    description affichée (repli : `<id>.description`)
 *   version        version du module (semver « 1.2.3 »)
 *   edition        'standard' (Apache-2.0) ou 'premium' (licence commerciale)
 *   apiVersion     version de l'API des modules pour laquelle il est écrit (semver)
 *   minAppVersion  version minimale de Sulfur (semver)
 *
 * L'API des modules suit le versionnage sémantique : un module écrit pour l'API 1.2 fonctionne avec
 * toute API 1.x à partir de 1.2, pas avec une API 2.x. Un module incompatible est refusé au
 * chargement (voir checkManifest).
 */

/**
 * Version de l'API des modules décrite par ce SDK (celle du paquet) : un module écrit avec le SDK
 * 1.x fonctionne avec toute version de Sulfur qui fournit une API 1.x au moins égale.
 */
export const MODULE_API_VERSION = '1.0.0'

export const EDITIONS = ['standard', 'premium']

/** Identifiant d'un module : préfixe des canaux IPC. */
export const MODULE_ID_PATTERN = /^[a-z0-9-]+$/

/** Identifiants pris par l'application (canaux `modules:*`, `config:*`, pages de l'interface). */
export const RESERVED_MODULE_IDS = ['modules', 'config', 'home', 'info', 'settings']

/** Format d'un canal IPC : `<moduleId>:<action>` */
export const IPC_CHANNEL_PATTERN = /^[a-z0-9-]+:[a-zA-Z0-9:._-]+$/

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/

/** Version semver lue : { major, minor, patch, prerelease: [] }, ou null si elle est invalide. */
export function parseVersion(text) {
  const m = typeof text === 'string' ? text.match(SEMVER) : null
  if (!m) return null
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), prerelease: m[4] ? m[4].split('.') : [] }
}

/**
 * Compare deux versions semver (< 0, 0, > 0). Une préversion précède la version finale
 * (1.0.0-beta.2 < 1.0.0) ; les métadonnées de build (+…) sont ignorées.
 */
export function compareVersions(a, b) {
  const x = typeof a === 'string' ? parseVersion(a) : a
  const y = typeof b === 'string' ? parseVersion(b) : b
  for (const key of ['major', 'minor', 'patch']) if (x[key] !== y[key]) return x[key] - y[key]
  if (!x.prerelease.length || !y.prerelease.length) return y.prerelease.length - x.prerelease.length
  for (let i = 0; i < Math.max(x.prerelease.length, y.prerelease.length); i++) {
    const p = x.prerelease[i]
    const q = y.prerelease[i]
    if (p === undefined || q === undefined) return p === undefined ? -1 : 1
    if (p === q) continue
    const numeric = /^\d+$/.test(p) && /^\d+$/.test(q)
    if (numeric) return Number(p) - Number(q)
    // Identifiant numérique avant identifiant alphanumérique (semver § 11).
    if (/^\d+$/.test(p) || /^\d+$/.test(q)) return /^\d+$/.test(p) ? -1 : 1
    return p < q ? -1 : 1
  }
  return 0
}

/**
 * Manifeste d'un module, complété : édition standard et API de ce SDK par défaut. `version` et
 * `minAppVersion` sont à fournir (voir checkManifest).
 */
export const defineManifest = (manifest) => ({ edition: 'standard', apiVersion: MODULE_API_VERSION, ...manifest })

/**
 * Manifeste vérifié avant le chargement d'un module. Retourne le premier problème
 * { reason, params } (libellés : modules.problems.<reason>), ou null si le module peut être chargé.
 *  - `appVersion` : version de Sulfur qui charge le module (obligatoire) ;
 *  - `apiVersion` : version de l'API des modules qu'elle fournit (par défaut celle de ce SDK) ;
 *  - `loadedIds` : identifiants des modules déjà chargés (un identifiant ne sert qu'une fois).
 */
export function checkManifest(manifest, { appVersion, apiVersion = MODULE_API_VERSION, loadedIds = [] } = {}) {
  const m = manifest ?? {}
  const invalid = (field) => ({ reason: 'invalid', params: { field } })
  if (typeof m.id !== 'string' || !MODULE_ID_PATTERN.test(m.id)) return invalid('id')
  if (typeof m.name !== 'string' || !m.name.trim()) return invalid('name')
  if (!parseVersion(m.version)) return invalid('version')
  if (!EDITIONS.includes(m.edition)) return invalid('edition')
  if (!parseVersion(m.apiVersion)) return invalid('apiVersion')
  if (!parseVersion(m.minAppVersion)) return invalid('minAppVersion')
  if (RESERVED_MODULE_IDS.includes(m.id)) return { reason: 'reservedId', params: { id: m.id } }
  if (loadedIds.includes(m.id)) return { reason: 'duplicateId', params: { id: m.id } }

  const required = parseVersion(m.apiVersion)
  const current = parseVersion(apiVersion)
  const params = { required: m.apiVersion, current: apiVersion }
  if (required.major !== current.major) return { reason: 'apiMajor', params }
  if (compareVersions(required, current) > 0) return { reason: 'apiTooNew', params }
  if (compareVersions(m.minAppVersion, appVersion) > 0) {
    return { reason: 'appTooOld', params: { required: m.minAppVersion, current: appVersion } }
  }
  return null
}
