import { MODULE_ID_PATTERN, RESERVED_MODULE_IDS, isPlainObject, t } from '@azerxim/sulfur-sdk'
/**
 * Fichier d'échange des configurations (banc de test) :
 *   { format: 'sulfur-config', version: 1, appVersion, exportedAt, modules: { <id>: { <section>: … } } }
 */
export const BUNDLE_FORMAT = 'sulfur-config'
export const BUNDLE_VERSION = 1

export function createBundle(modules, appVersion) {
  return {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    appVersion,
    exportedAt: new Date().toISOString(),
    modules
  }
}

/**
 * Lit un fichier d'échange. Retourne { modules, kept, ignored } :
 *  - `modules` : configurations des modules de `knownIds` (modules chargés) ;
 *  - `kept` : configurations des modules absents de cette installation (module externe non
 *    installé ou non chargé, module d'une autre version de Sulfur), conservées pour être appliquées
 *    quand le module sera chargé ;
 *  - `ignored` : identifiants inutilisables (identifiant invalide ou réservé, module de `blockedIds`
 *    dont la configuration ne s'importe pas, section qui n'est pas un objet).
 * Lève une erreur traduite si le fichier est invalide ou ne contient rien d'utilisable.
 */
export function parseBundle(text, knownIds, blockedIds = []) {
  let bundle
  try {
    bundle = JSON.parse(text)
  } catch {
    throw new Error(t('errors.config.notJson'))
  }
  if (!isPlainObject(bundle) || bundle.format !== BUNDLE_FORMAT || !isPlainObject(bundle.modules)) {
    throw new Error(t('errors.config.notSulfur'))
  }
  if (!Number.isInteger(bundle.version) || bundle.version > BUNDLE_VERSION) {
    throw new Error(t('errors.config.unsupportedVersion', { version: bundle.version }))
  }

  const modules = {}
  const kept = {}
  const ignored = []
  for (const [id, config] of Object.entries(bundle.modules)) {
    if (!isPlainObject(config)) ignored.push(id)
    else if (knownIds.includes(id)) modules[id] = config
    else if (MODULE_ID_PATTERN.test(id) && !RESERVED_MODULE_IDS.includes(id) && !blockedIds.includes(id))
      kept[id] = config
    else ignored.push(id)
  }
  if (!Object.keys(modules).length && !Object.keys(kept).length) throw new Error(t('errors.config.noModule'))
  return { modules, kept, ignored }
}
