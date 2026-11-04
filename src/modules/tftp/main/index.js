import { migrateToInstances } from '@azerxim/sulfur-sdk'
import { defineInstances } from '@azerxim/sulfur-sdk/main'
import { app, BrowserWindow, dialog, shell } from 'electron'
import fs from 'fs/promises'
import { join } from 'path'
import { TFTP_MODULE } from '../shared/constants'
import '../shared/locales'
import { TftpServer } from './server'
import { TftpClient } from './client'
import { createPointsApi } from './points'
import { t } from '../shared/i18n'

/** Serveur et client uniques d'une version antérieure, convertis en instances (« Serveur 1 »…). */
const migrateConfig = (config) =>
  migrateToInstances(config, {
    server: { sections: ['server'], name: `${t('ui.server')} 1` },
    client: { sections: ['client'], name: `${t('ui.client')} 1` }
  })

let instances = null

const window = () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

/**
 * Partie "main" du module TFTP : serveurs et clients en nombre libre (aucun par défaut, voir
 * `defineInstances` du SDK). Canaux : `tftp:instances:*`, `tftp:server:*` et `tftp:client:*`
 * (identifiant de l'instance en premier argument).
 */
export const tftpMainModule = {
  manifest: TFTP_MODULE,

  migrateConfig,

  activate(ctx) {
    const defaultRoot = join(ctx.dataDir, 'files')
    instances = defineInstances(ctx, {
      server: {
        label: () => t('ui.server'),
        create: (_instance, { emit }) =>
          new TftpServer(defaultRoot, {
            onStatus: (status) => emit('status', status),
            onLog: (entry) => emit('log', entry)
          }),
        busy: (server) => server.running,
        dispose: (server) => server.stop()
      },
      client: {
        label: () => t('ui.client'),
        create: (_instance, { emit }) => new TftpClient({ onProgress: (entry) => emit('progress', entry) }),
        busy: (client) => !!client.current,
        dispose: (client) => client.abort()
      }
    })

    ctx.expose(createPointsApi({ instances }))
    instances.handle('server', 'start', (server, config) => server.start(config))
    instances.handle('server', 'stop', (server) => server.stop())
    instances.handle('server', 'update', (server, config) => server.update(config))
    instances.handle('server', 'logs', (server) => server.logs())
    instances.handle('server', 'clearLogs', (server) => server.clearLogs())
    instances.handle('server', 'defaultRoot', (_server) => defaultRoot)
    instances.handle('server', 'pickRoot', async (_server) => {
      const { canceled, filePaths } = await dialog.showOpenDialog(window(), {
        title: t('tftp.server.pickRoot'),
        properties: ['openDirectory', 'createDirectory']
      })
      return canceled || !filePaths?.length ? null : filePaths[0]
    })
    instances.handle('server', 'openRoot', async (server, root) => {
      const folder = root?.trim() || defaultRoot
      await fs.mkdir(folder, { recursive: true })
      const error = await shell.openPath(folder)
      if (error) throw new Error(error)
    })

    instances.handle('client', 'history', (client) => client.history)
    instances.handle('client', 'clear', (client) => client.clear())
    instances.handle('client', 'abort', (client) => client.abort())
    // Lecture : fichier local choisi après le transfert (null si annulé).
    instances.handle('client', 'get', async (client, config) => {
      const { entry, data } = await client.get(config)
      if (!data) return entry
      const { canceled, filePath } = await dialog.showSaveDialog(window(), {
        title: t('tftp.client.saveAs'),
        defaultPath: join(app.getPath('downloads'), String(config.remoteFile).split(/[\\/]/).pop())
      })
      if (!canceled && filePath) {
        await fs.writeFile(filePath, data)
        entry.local = filePath
      }
      return entry
    })
    instances.handle('client', 'put', async (client, config) => {
      const { canceled, filePaths } = await dialog.showOpenDialog(window(), {
        title: t('tftp.client.put'),
        properties: ['openFile']
      })
      if (canceled || !filePaths?.length) return null
      const entry = await client.put(config, await fs.readFile(filePaths[0]))
      entry.local = filePaths[0]
      return entry
    })
  },

  /** Au moins un serveur démarré ou un transfert en cours. */
  busy() {
    return !!instances?.busy()
  },

  async deactivate() {
    await instances?.dispose()
    instances = null
  }
}
