import { BrowserWindow, dialog, shell } from 'electron'
import fs from 'fs/promises'
import { t } from '@azerxim/sulfur-sdk'
import { MODULE_ARCHIVE_EXTENSION } from '@azerxim/sulfur-sdk/archive'
import { packageUrl } from './module-packages'
import { loadPreferences, savePreferences } from './preferences'

/**
 * Activation / désactivation des modules depuis les Paramètres. Canaux : `modules:disabled` et
 * `modules:setDisabled` (liste des modules désactivés, enregistrée dans les préférences et relue au
 * démarrage), `modules:rejected` (modules refusés au chargement, voir ModuleHost). Seuls les modules
 * de `moduleIds()` peuvent être désactivés (pas les modules cœur). `modules:statusChannels` liste
 * les canaux d'état des modules actifs (activité affichée dans la barre latérale et l'accueil).
 *
 * Modules externes (`external` : ExternalModules) : `modules:packages` (chargement en cours et
 * choix enregistré, paquets chargés et URL de leur interface), `modules:setExternal` (chargement
 * des paquets, qui ne sont pas signés), `modules:reload` (actualisation des modules externes selon ce choix ;
 * l'interface se recharge ensuite) et `modules:openPackagesDir`. Paquets : `modules:installed`
 * (paquets présents, chargés ou non), `modules:choosePackage` (choix et vérification d'une archive
 * `.sulfur-module`, null si l'utilisateur annule), `modules:installPackage` (installation confirmée)
 * et `modules:removePackage`.
 */
export function registerModuleSwitch(host, moduleIds, external) {
  const ctx = host.createContext('modules')
  ctx.handle('disabled', () => [...host.disabled])
  ctx.handle('rejected', () => host.rejected)
  ctx.handle('statusChannels', () => host.statusChannels())
  ctx.handle('setDisabled', async (ids) => {
    const disabled = await host.setDisabled(ids, moduleIds())
    savePreferences({ disabledModules: disabled })
    return disabled
  })

  ctx.handle('packages', () => ({
    enabled: external.enabled,
    next: loadPreferences().externalModules === true,
    dir: external.dir,
    packages: external.packages.map(({ id, descriptor }) => ({
      id,
      name: descriptor.name,
      version: descriptor.version,
      group: descriptor.group,
      renderer: packageUrl(id, descriptor.renderer),
      style: descriptor.style ? packageUrl(id, descriptor.style) : null
    }))
  }))
  ctx.handle('setExternal', (enabled) => savePreferences({ externalModules: enabled === true }).externalModules)
  ctx.handle('reload', async () => {
    await external.reload()
    return external.ids()
  })
  ctx.handle('installed', () => external.installed())
  ctx.handle('choosePackage', async () => {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const { canceled, filePaths } = await dialog.showOpenDialog(window, {
      title: t('settings.externalModules.installTitle'),
      filters: [
        { name: t('settings.externalModules.packageFiles'), extensions: [MODULE_ARCHIVE_EXTENSION.slice(1), 'zip'] }
      ],
      properties: ['openFile']
    })
    if (canceled || !filePaths?.length) return null
    return external.inspect(await fs.readFile(filePaths[0]))
  })
  ctx.handle('installPackage', (token) => external.install(token))
  ctx.handle('removePackage', (id) => external.remove(id))
  ctx.handle('openPackagesDir', async () => {
    await fs.mkdir(external.dir, { recursive: true })
    const error = await shell.openPath(external.dir)
    if (error) throw new Error(error)
  })
}
