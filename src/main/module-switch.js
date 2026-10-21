import { savePreferences } from './preferences'

/**
 * Activation / désactivation des modules depuis les Paramètres. Canaux : `modules:disabled` et
 * `modules:setDisabled` (liste des modules désactivés, enregistrée dans les préférences et relue au
 * démarrage), `modules:rejected` (modules refusés au chargement, voir ModuleHost). Seuls les modules
 * de `moduleIds` peuvent être désactivés (pas les modules cœur).
 */
export function registerModuleSwitch(host, moduleIds) {
  const ctx = host.createContext('modules')
  ctx.handle('disabled', () => [...host.disabled])
  ctx.handle('rejected', () => host.rejected)
  ctx.handle('setDisabled', async (ids) => {
    const disabled = await host.setDisabled(ids, moduleIds)
    savePreferences({ disabledModules: disabled })
    return disabled
  })
}
