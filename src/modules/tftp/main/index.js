import { app, BrowserWindow, dialog, shell } from 'electron'
import fs from 'fs/promises'
import { join } from 'path'
import { TFTP_MODULE } from '../shared/constants'
import '../shared/locales'
import { TftpServer } from './server'
import { TftpClient } from './client'
import { createPointsApi } from './points'
import { t } from '../shared/i18n'

let server = null
let client = null

const window = () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

/** Partie "main" du module TFTP. Canaux : `tftp:server:*`, `tftp:client:*`. */
export const tftpMainModule = {
  manifest: TFTP_MODULE,

  activate(ctx) {
    const defaultRoot = join(ctx.dataDir, 'files')
    server = new TftpServer(defaultRoot, {
      onStatus: (status) => ctx.emit('server:status', status),
      onLog: (entry) => ctx.emit('server:log', entry)
    })
    client = new TftpClient({ onProgress: (entry) => ctx.emit('client:progress', entry) })

    ctx.expose(createPointsApi({ server }))

    ctx.handle('server:status', () => server.status())
    ctx.handle('server:start', (config) => server.start(config))
    ctx.handle('server:stop', () => server.stop())
    ctx.handle('server:update', (config) => server.update(config))
    ctx.handle('server:logs', () => server.logs())
    ctx.handle('server:clearLogs', () => server.clearLogs())
    ctx.handle('server:defaultRoot', () => defaultRoot)
    ctx.handle('server:pickRoot', async () => {
      const { canceled, filePaths } = await dialog.showOpenDialog(window(), {
        title: t('tftp.server.pickRoot'),
        properties: ['openDirectory', 'createDirectory']
      })
      return canceled || !filePaths?.length ? null : filePaths[0]
    })
    ctx.handle('server:openRoot', async (root) => {
      const folder = root?.trim() || defaultRoot
      await fs.mkdir(folder, { recursive: true })
      const error = await shell.openPath(folder)
      if (error) throw new Error(error)
    })

    ctx.handle('client:history', () => client.history)
    ctx.handle('client:clear', () => client.clear())
    ctx.handle('client:abort', () => client.abort())
    // Lecture : fichier local choisi après le transfert (null si annulé).
    ctx.handle('client:get', async (config) => {
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
    ctx.handle('client:put', async (config) => {
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

  /** Serveur démarré ou transfert en cours. */
  busy() {
    return !!(server?.running || client?.current)
  },

  async deactivate() {
    client?.abort()
    await server?.stop().catch(() => {})
  }
}
