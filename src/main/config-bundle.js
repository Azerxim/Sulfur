import { isPlainObject, t } from '@azerxim/sulfur-sdk'
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
 * Lit un fichier d'échange. Retourne les configurations des modules connus et la liste des modules
 * ignorés (absents de cette version de Sulfur). Lève une erreur traduite si le fichier est invalide.
 */
export function parseBundle(text, knownIds) {
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
  const ignored = []
  for (const [id, config] of Object.entries(bundle.modules)) {
    if (knownIds.includes(id) && isPlainObject(config)) modules[id] = config
    else ignored.push(id)
  }
  if (!Object.keys(modules).length) throw new Error(t('errors.config.noModule'))
  return { modules, ignored }
}
