import { app, BrowserWindow, dialog } from 'electron'
import fs from 'fs/promises'
import { join } from 'path'
import { MODULE_ID_PATTERN, RESERVED_MODULE_IDS, t } from '@azerxim/sulfur-sdk'
import { createBundle, parseBundle } from './config-bundle'
import { ConfigStore } from './config-store'

/**
 * Configurations enregistrées dans `dir` (`<id>/config.json`) des modules qui ne sont pas chargés
 * (absents de `loadedIds`) : { <id>: config }. Ce sont les configurations conservées à l'import
 * pour un module non installé, ou celles d'un module désinstallé.
 */
export async function storedConfigs(dir, loadedIds) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  const configs = {}
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const id = entry.name
    if (!entry.isDirectory() || loadedIds.includes(id) || !MODULE_ID_PATTERN.test(id)) continue
    if (RESERVED_MODULE_IDS.includes(id)) continue
    const config = new ConfigStore(join(dir, id, 'config.json')).get()
    if (Object.keys(config).length) configs[id] = config
  }
  return configs
}

/** Enregistre dans `dir` les configurations `configs` de modules non chargés : { <id>: config }. */
export function keepConfigs(dir, configs) {
  for (const [id, config] of Object.entries(configs)) new ConfigStore(join(dir, id, 'config.json')).replace(config)
}

/**
 * Import / export de la configuration de tous les modules dans un fichier JSON (banc de test).
 * Canaux : `config:export` et `config:import` (retournent null si l'utilisateur annule).
 * `moduleIds()` : modules dont la configuration est exportée et importée.
 *
 * Les sections des modules absents (module externe non installé ou non chargé, module d'une autre
 * version de Sulfur) ne sont pas perdues : l'import les enregistre dans `<userData>/modules/<id>`,
 * où le module les trouvera une fois installé et chargé (avec migrateConfig), et l'export les
 * reprend. Elles sont signalées dans les deux cas (`kept`).
 */
export function registerConfigTransfer(host, moduleIds, dir = join(app.getPath('userData'), 'modules')) {
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
    const kept = await storedConfigs(dir, [...host.configs.keys()])
    const modules = Object.fromEntries(moduleIds().map((id) => [id, host.configs.get(id)?.get() ?? {}]))
    await fs.writeFile(filePath, JSON.stringify(createBundle({ ...modules, ...kept }, app.getVersion()), null, 2))
    return { filePath, kept: Object.keys(kept) }
  })

  ctx.handle('import', async () => {
    // Les serveurs et clients en marche ont leur propre configuration : on ne la remplace pas sous leurs pieds.
    if (host.activeModules().some((mod) => mod.busy?.())) throw new Error(t('errors.config.busy'))
    const { canceled, filePaths } = await dialog.showOpenDialog(window(), {
      title: t('settings.configurations.importTitle'),
      filters,
      properties: ['openFile']
    })
    if (canceled || !filePaths?.length) return null
    // Modules chargés hors de moduleIds() (modules cœur) : leur configuration ne s'importe pas.
    const blocked = [...host.configs.keys()].filter((id) => !moduleIds().includes(id))
    const { modules, kept, ignored } = parseBundle(await fs.readFile(filePaths[0], 'utf8'), moduleIds(), blocked)
    for (const [id, config] of Object.entries(modules)) {
      modules[id] = host.migrate(id, config)
      host.configs.get(id).replace(modules[id])
    }
    keepConfigs(dir, kept)
    return { filePath: filePaths[0], modules, kept: Object.keys(kept), ignored }
  })
}
