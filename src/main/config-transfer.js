import { app, BrowserWindow, dialog } from 'electron'
import fs from 'fs/promises'
import { join } from 'path'
import { t } from '@shared/i18n'
import { createBundle, parseBundle } from './config-bundle'

/**
 * Import / export de la configuration de tous les modules dans un fichier JSON (banc de test).
 * Canaux : `config:export` et `config:import` (retournent null si l'utilisateur annule).
 */
export function registerConfigTransfer(host, moduleIds) {
  const ctx = host.createContext('config')
  const window = () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const filters = [{ name: 'JSON', extensions: ['json'] }]

  ctx.handle('export', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog(window(), {
      title: t('settings.configurations.exportTitle'),
      defaultPath: join(app.getPath('documents'), 'sulfur-config.json'),
      filters
    })
    if (canceled || !filePath) return null
    const modules = Object.fromEntries(moduleIds.map((id) => [id, host.configs.get(id)?.get() ?? {}]))
    await fs.writeFile(filePath, JSON.stringify(createBundle(modules, app.getVersion()), null, 2))
    return { filePath }
  })

  ctx.handle('import', async () => {
    // Les serveurs et clients en marche ont leur propre configuration : on ne la remplace pas sous leurs pieds.
    if (host.modules.some((mod) => mod.busy?.())) throw new Error(t('errors.config.busy'))
    const { canceled, filePaths } = await dialog.showOpenDialog(window(), {
      title: t('settings.configurations.importTitle'),
      filters,
      properties: ['openFile']
    })
    if (canceled || !filePaths?.length) return null
    const { modules, ignored } = parseBundle(await fs.readFile(filePaths[0], 'utf8'), moduleIds)
    for (const [id, config] of Object.entries(modules)) host.configs.get(id).replace(config)
    return { filePath: filePaths[0], modules, ignored }
  })
}
