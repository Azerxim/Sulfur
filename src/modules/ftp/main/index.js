import { app, BrowserWindow, dialog, shell } from 'electron'
import fs from 'fs/promises'
import { join } from 'path'
import { ensureCertificate, hashPassword } from '@azerxim/sulfur-sdk/main'
import { FTP_MODULE } from '../shared/constants'
import '../shared/locales'
import { FtpServer } from './ftp/server'
import { FtpClient } from './ftp/client'
import { SftpServer, ensureHostKey } from './sftp/server'
import { SftpClient } from './sftp/client'
import { createPointsApi } from './points'
import { t } from '../shared/i18n'

const SERVER_COMMON_NAME = 'FTP@Sulfur'

let ftpServer = null
let ftpClient = null
let sftpServer = null
let sftpClient = null

const window = () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

/**
 * Partie "main" du module FTP / SFTP. Canaux : `ftp:server:*`, `ftp:client:*` (FTP),
 * `ftp:sftp:server:*`, `ftp:sftp:client:*` (SFTP). Les deux serveurs servent par défaut le même
 * dossier.
 */
export const ftpMainModule = {
  manifest: FTP_MODULE,

  activate(ctx) {
    const defaultRoot = join(ctx.dataDir, 'files')
    const hostKey = () => ensureHostKey(join(ctx.dataDir, 'hostkey'))
    ftpServer = new FtpServer(
      () => ensureCertificate(join(ctx.dataDir, 'pki', 'own'), SERVER_COMMON_NAME),
      defaultRoot,
      {
        onStatus: (status) => ctx.emit('server:status', status),
        onLog: (entry) => ctx.emit('server:log', entry)
      }
    )
    ftpClient = new FtpClient({
      onStatus: (status) => ctx.emit('client:status', status),
      onDialog: (entry) => ctx.emit('client:dialog', entry)
    })
    sftpServer = new SftpServer(hostKey, defaultRoot, {
      onStatus: (status) => ctx.emit('sftp:server:status', status),
      onLog: (entry) => ctx.emit('sftp:server:log', entry)
    })
    sftpClient = new SftpClient({ onStatus: (status) => ctx.emit('sftp:client:status', status) })

    ctx.expose(createPointsApi({ ftpServer, sftpServer }))

    // Commun aux deux serveurs : mots de passe, dossier servi.
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

    ctx.handle('server:status', () => ftpServer.status())
    ctx.handle('server:start', (config) => ftpServer.start(config))
    ctx.handle('server:stop', () => ftpServer.stop())
    ctx.handle('server:update', (config) => ftpServer.update(config))
    ctx.handle('server:logs', () => ftpServer.logs())
    ctx.handle('server:clearLogs', () => ftpServer.clearLogs())

    ctx.handle('sftp:server:status', () => sftpServer.status())
    ctx.handle('sftp:server:start', (config) => sftpServer.start(config))
    ctx.handle('sftp:server:stop', () => sftpServer.stop())
    ctx.handle('sftp:server:updateUsers', (users) => sftpServer.updateUsers(users))
    ctx.handle('sftp:server:logs', () => sftpServer.logs())
    ctx.handle('sftp:server:clearLogs', () => sftpServer.clearLogs())
    ctx.handle('sftp:server:hostKey', () =>
      hostKey().then(({ publicKey, fingerprint }) => ({ publicKey, fingerprint }))
    )

    ctx.handle('client:dialog', () => ftpClient.dialog)
    ctx.handle('client:clearDialog', () => ftpClient.clearDialog())
    ctx.handle('sftp:client:pickKey', async () => {
      const { canceled, filePaths } = await dialog.showOpenDialog(window(), {
        title: t('sftp.client.pickKey'),
        properties: ['openFile', 'showHiddenFiles']
      })
      return canceled || !filePaths?.length ? null : fs.readFile(filePaths[0], 'utf8')
    })

    // Navigation et transferts : mêmes opérations pour les deux clients.
    for (const [prefix, client] of [
      ['client', ftpClient],
      ['sftp:client', sftpClient]
    ]) {
      ctx.handle(`${prefix}:status`, () => client.status())
      ctx.handle(`${prefix}:connect`, (config) => client.connect(config))
      ctx.handle(`${prefix}:disconnect`, () => client.disconnect())
      ctx.handle(`${prefix}:list`, (dir) => client.list(dir))
      ctx.handle(`${prefix}:mkdir`, (name) => client.mkdir(name))
      ctx.handle(`${prefix}:remove`, (name, type) => client.remove(name, type))
      ctx.handle(`${prefix}:rename`, (from, to) => client.rename(from, to))
      // Transferts avec choix du fichier local (null si annulé).
      ctx.handle(`${prefix}:download`, async (name) => {
        const { canceled, filePath } = await dialog.showSaveDialog(window(), {
          title: t('ftp.client.download'),
          defaultPath: join(app.getPath('downloads'), name.split('/').pop())
        })
        return canceled || !filePath ? null : client.download(name, filePath)
      })
      ctx.handle(`${prefix}:upload`, async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(window(), {
          title: t('ftp.client.upload'),
          properties: ['openFile', 'multiSelections']
        })
        if (canceled || !filePaths?.length) return null
        const results = []
        for (const file of filePaths) results.push(await client.upload(file))
        return results
      })
    }
  },

  /** Un serveur démarré ou un client connecté. */
  busy() {
    return !!(
      ftpServer?.running ||
      sftpServer?.running ||
      ftpClient?.status().connected ||
      sftpClient?.status().connected
    )
  },

  async deactivate() {
    ftpClient?.disconnect()
    await sftpClient?.disconnect().catch(() => {})
    await Promise.all([ftpServer?.stop().catch(() => {}), sftpServer?.stop().catch(() => {})])
  }
}
