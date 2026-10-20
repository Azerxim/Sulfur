import { app, BrowserWindow, dialog, shell } from 'electron'
import fs from 'fs/promises'
import { join } from 'path'
import { hashPassword } from '@shared/passwords'
import { SFTP_MODULE } from '../shared/constants'
import '../shared/locales'
import { SftpServer, ensureHostKey } from './server'
import { SftpClient } from './client'
import { createPointsApi } from './points'
import { t } from '../shared/i18n'

let server = null
let client = null

const window = () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

/** Partie "main" du module SFTP. Canaux : `sftp:server:*`, `sftp:client:*`. */
export const sftpMainModule = {
  manifest: SFTP_MODULE,

  activate(ctx) {
    const defaultRoot = join(ctx.dataDir, 'files')
    server = new SftpServer(() => ensureHostKey(join(ctx.dataDir, 'hostkey')), defaultRoot, {
      onStatus: (status) => ctx.emit('server:status', status),
      onLog: (entry) => ctx.emit('server:log', entry)
    })
    client = new SftpClient({ onStatus: (status) => ctx.emit('client:status', status) })

    ctx.expose(createPointsApi({ server }))

    ctx.handle('server:status', () => server.status())
    ctx.handle('server:start', (config) => server.start(config))
    ctx.handle('server:stop', () => server.stop())
    ctx.handle('server:updateUsers', (users) => server.updateUsers(users))
    ctx.handle('server:logs', () => server.logs())
    ctx.handle('server:clearLogs', () => server.clearLogs())
    ctx.handle('server:hashPassword', (password) => hashPassword(password))
    ctx.handle('server:defaultRoot', () => defaultRoot)
    ctx.handle('server:hostKey', () =>
      ensureHostKey(join(ctx.dataDir, 'hostkey')).then(({ publicKey, fingerprint }) => ({ publicKey, fingerprint }))
    )
    ctx.handle('server:pickRoot', async () => {
      const { canceled, filePaths } = await dialog.showOpenDialog(window(), {
        title: t('sftp.server.pickRoot'),
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
    ctx.handle('client:list', (dir) => client.list(dir))
    ctx.handle('client:mkdir', (name) => client.mkdir(name))
    ctx.handle('client:remove', (name, type) => client.remove(name, type))
    ctx.handle('client:rename', (from, to) => client.rename(from, to))
    // Transferts avec choix du fichier local (null si annulé).
    ctx.handle('client:download', async (name) => {
      const { canceled, filePath } = await dialog.showSaveDialog(window(), {
        title: t('sftp.client.download'),
        defaultPath: join(app.getPath('downloads'), name.split('/').pop())
      })
      return canceled || !filePath ? null : client.download(name, filePath)
    })
    ctx.handle('client:upload', async () => {
      const { canceled, filePaths } = await dialog.showOpenDialog(window(), {
        title: t('sftp.client.upload'),
        properties: ['openFile', 'multiSelections']
      })
      if (canceled || !filePaths?.length) return null
      const results = []
      for (const file of filePaths) results.push(await client.upload(file))
      return results
    })
    ctx.handle('client:pickKey', async () => {
      const { canceled, filePaths } = await dialog.showOpenDialog(window(), {
        title: t('sftp.client.pickKey'),
        properties: ['openFile', 'showHiddenFiles']
      })
      return canceled || !filePaths?.length ? null : fs.readFile(filePaths[0], 'utf8')
    })
  },

  /** Serveur démarré ou client connecté. */
  busy() {
    return !!(server?.running || client?.status().connected)
  },

  async deactivate() {
    await client?.disconnect().catch(() => {})
    await server?.stop().catch(() => {})
  }
}
