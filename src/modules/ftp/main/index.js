import { app, BrowserWindow, dialog, shell } from 'electron'
import fs from 'fs/promises'
import { join } from 'path'
import { ensureCertificate } from '@shared/certificate'
import { hashPassword } from '@shared/passwords'
import { FTP_MODULE } from '../shared/constants'
import '../shared/locales'
import { FtpServer } from './server'
import { FtpClient } from './client'
import { createPointsApi } from './points'
import { t } from '../shared/i18n'

const SERVER_COMMON_NAME = 'FTP@Sulfur'

let server = null
let client = null

const window = () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

/** Partie "main" du module FTP. Canaux : `ftp:server:*`, `ftp:client:*`. */
export const ftpMainModule = {
  manifest: FTP_MODULE,

  activate(ctx) {
    const defaultRoot = join(ctx.dataDir, 'files')
    server = new FtpServer(() => ensureCertificate(join(ctx.dataDir, 'pki', 'own'), SERVER_COMMON_NAME), defaultRoot, {
      onStatus: (status) => ctx.emit('server:status', status),
      onLog: (entry) => ctx.emit('server:log', entry)
    })
    client = new FtpClient({
      onStatus: (status) => ctx.emit('client:status', status),
      onDialog: (entry) => ctx.emit('client:dialog', entry)
    })

    ctx.expose(createPointsApi({ server }))

    ctx.handle('server:status', () => server.status())
    ctx.handle('server:start', (config) => server.start(config))
    ctx.handle('server:stop', () => server.stop())
    ctx.handle('server:update', (config) => server.update(config))
    ctx.handle('server:logs', () => server.logs())
    ctx.handle('server:clearLogs', () => server.clearLogs())
    ctx.handle('server:hashPassword', (password) => hashPassword(password))
    ctx.handle('server:defaultRoot', () => defaultRoot)
    ctx.handle('server:pickRoot', async () => {
      const { canceled, filePaths } = await dialog.showOpenDialog(window(), {
        title: t('ftp.server.pickRoot'),
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

    ctx.handle('client:status', () => client.status())
    ctx.handle('client:connect', (config) => client.connect(config))
    ctx.handle('client:disconnect', () => client.disconnect())
    ctx.handle('client:dialog', () => client.dialog)
    ctx.handle('client:clearDialog', () => client.clearDialog())
    ctx.handle('client:list', (dir) => client.list(dir))
    ctx.handle('client:mkdir', (name) => client.mkdir(name))
    ctx.handle('client:remove', (name, type) => client.remove(name, type))
    ctx.handle('client:rename', (from, to) => client.rename(from, to))
    // Transferts avec choix du fichier local (null si annulé).
    ctx.handle('client:download', async (name) => {
      const { canceled, filePath } = await dialog.showSaveDialog(window(), {
        title: t('ftp.client.download'),
        defaultPath: join(app.getPath('downloads'), name.split('/').pop())
      })
      return canceled || !filePath ? null : client.download(name, filePath)
    })
    ctx.handle('client:upload', async () => {
      const { canceled, filePaths } = await dialog.showOpenDialog(window(), {
        title: t('ftp.client.upload'),
        properties: ['openFile', 'multiSelections']
      })
      if (canceled || !filePaths?.length) return null
      const results = []
      for (const file of filePaths) results.push(await client.upload(file))
      return results
    })
  },

  /** Serveur démarré ou client connecté. */
  busy() {
    return !!(server?.running || client?.status().connected)
  },

  async deactivate() {
    client?.disconnect()
    await server?.stop().catch(() => {})
  }
}
