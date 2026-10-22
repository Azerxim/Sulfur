import { flushModuleConfigs, replaceModuleConfigs } from '@azerxim/sulfur-sdk/host'

/** Exporte la configuration de tous les modules dans un fichier choisi par l'utilisateur. */
export function exportConfigurations() {
  flushModuleConfigs()
  return window.sulfur.invoke('config:export')
}

/** Importe un fichier de configuration (null si annulé) et l'applique aux modules concernés. */
export async function importConfigurations() {
  flushModuleConfigs()
  const result = await window.sulfur.invoke('config:import')
  if (result) replaceModuleConfigs(result.modules)
  return result
}

/** Rétablit la configuration par défaut d'un module. */
export async function resetModuleConfig(moduleId) {
  await window.sulfur.invoke(`${moduleId}:config:reset`)
  replaceModuleConfigs({ [moduleId]: {} })
}
