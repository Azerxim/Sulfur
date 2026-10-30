import { useMemo } from 'react'
import { externalModules } from './external-modules'
import { moduleGroups, rendererModules } from './modules'
import { usePreferences } from './preferences'
import { loadModuleActivity } from './activity'

/**
 * Modules refusés par le process principal au chargement (manifeste invalide ou incompatible) et
 * modules externes dont l'interface n'a pas pu être chargée : [{ id, name, version, reason, params }].
 * Lus avant le premier rendu, après les modules externes ; ils n'existent pas pour l'interface (ni
 * barre latérale, ni accueil, ni configuration).
 */
let rejected = []
let available = { groups: moduleGroups, modules: rendererModules }

export async function loadRejectedModules() {
  try {
    const list = await window.sulfur.invoke('modules:rejected')
    rejected = Array.isArray(list) ? list : []
  } catch {
    rejected = []
  }
  rejected = [...rejected, ...externalModules().failed]
  const off = new Set(rejected.map((r) => r.id))
  available = {
    groups: moduleGroups
      .map((group) => ({ ...group, modules: group.modules.filter((m) => !off.has(m.manifest.id)) }))
      .filter((group) => group.modules.length),
    modules: rendererModules.filter((m) => !off.has(m.manifest.id))
  }
  return rejected
}

export const rejectedModules = () => rejected

/** Modules chargés par le process principal (activés ou non) : { groups, modules }. */
export const availableModules = () => available

/** Liste des modules désactivés, tenue par le process principal (lue avant le premier rendu). */
export async function loadDisabledModules() {
  try {
    const list = await window.sulfur.invoke('modules:disabled')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

/**
 * Modules activés (Paramètres → Modules) : groupes de la barre latérale sans les modules
 * désactivés ni refusés (groupes vides retirés), liste à plat et test d'un identifiant.
 */
export function useEnabledModules() {
  const { prefs } = usePreferences()
  const disabled = prefs.disabledModules
  return useMemo(() => {
    const off = new Set([...(disabled ?? []), ...rejected.map((r) => r.id)])
    return {
      groups: available.groups
        .map((group) => ({ ...group, modules: group.modules.filter((m) => !off.has(m.manifest.id)) }))
        .filter((group) => group.modules.length),
      modules: available.modules.filter((m) => !off.has(m.manifest.id)),
      isDisabled: (id) => off.has(id)
    }
  }, [disabled])
}

/** Désactive les modules de `ids` (les autres sont activés) ; le process principal peut refuser. */
export async function setDisabledModules(ids, update) {
  const disabled = await window.sulfur.invoke('modules:setDisabled', ids)
  update({ disabledModules: disabled })
  // Modules réactivés : leurs canaux d'état sont de nouveau disponibles.
  loadModuleActivity()
  return disabled
}
