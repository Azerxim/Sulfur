import { app, BrowserWindow, dialog, shell } from 'electron'
import fs from 'fs/promises'
import { join } from 'path'
import { migrateToInstances } from '@azerxim/sulfur-sdk'
import { defineInstances, ensureCertificate, hashPassword } from '@azerxim/sulfur-sdk/main'
import { FTP_MODULE } from '../shared/constants'
import '../shared/locales'
import { FtpServer } from './ftp/server'
import { FtpClient } from './ftp/client'
import { SftpServer, ensureHostKey } from './sftp/server'
import { SftpClient } from './sftp/client'
import { createPointsApi } from './points'
import { t } from '../shared/i18n'

const SERVER_COMMON_NAME = 'FTP@Sulfur'

/**
 * Serveurs et clients uniques d'une version antérieure, convertis en instances. Les serveurs
 * gardent les identifiants `ftp` et `sftp`, préfixes de leurs points d'avant les instances.
 */
const migrateConfig = (config) =>
  migrateToInstances(config, {
    server: { id: 'ftp', sections: ['server'], name: `${t('ftp.tabs.ftpServer')} 1` },
    client: { sections: ['client'], name: `${t('ftp.tabs.ftpClient')} 1` },
    sftpServer: { id: 'sftp', sections: ['sftpServer'], name: `${t('ftp.tabs.sftpServer')} 1` },
    sftpClient: { sections: ['sftpClient'], name: `${t('ftp.tabs.sftpClient')} 1` }
  })

let instances = null

const window = () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

/**
 * Partie "main" du module FTP / SFTP : serveurs et clients FTP et SFTP en nombre libre (aucun par
 * défaut, voir `defineInstances` du SDK). Canaux : `ftp:instances:*`, `ftp:server:*`,
 * `ftp:client:*`, `ftp:sftpServer:*` et `ftp:sftpClient:*` (identifiant de l'instance en premier
 * argument) ; communs : `ftp:files:*` (mots de passe, dossier servi), `ftp:sftp:hostKey`,
 * `ftp:sftp:pickKey`. Les serveurs servent par défaut le même dossier.
 */
export const ftpMainModule = {
  manifest: FTP_MODULE,

  migrateConfig,

  activate(ctx) {
    const defaultRoot = join(ctx.dataDir, 'files')
    const hostKey = () => ensureHostKey(join(ctx.dataDir, 'hostkey'))
    const certificate = () => ensureCertificate(join(ctx.dataDir, 'pki', 'own'), SERVER_COMMON_NAME)

    instances = defineInstances(ctx, {
      server: {
        label: () => t('ftp.tabs.ftpServer'),
        create: (_instance, { emit }) =>
          new FtpServer(certificate, defaultRoot, {
            onStatus: (status) => emit('status', status),
            onLog: (entry) => emit('log', entry)
          }),
        busy: (server) => server.running,
        dispose: (server) => server.stop()
      },
      client: {
        label: () => t('ftp.tabs.ftpClient'),
        create: (_instance, { emit }) =>
          new FtpClient({
            onStatus: (status) => emit('status', status),
            onDialog: (entry) => emit('dialog', entry)
          }),
        busy: (client) => client.status().connected,
        dispose: (client) => client.disconnect()
      },
      sftpServer: {
        label: () => t('ftp.tabs.sftpServer'),
        create: (_instance, { emit }) =>
          new SftpServer(hostKey, defaultRoot, {
            onStatus: (status) => emit('status', status),
            onLog: (entry) => emit('log', entry)
          }),
        busy: (server) => server.running,
        dispose: (server) => server.stop()
      },
      sftpClient: {
        label: () => t('ftp.tabs.sftpClient'),
        create: (_instance, { emit }) => new SftpClient({ onStatus: (status) => emit('status', status) }),
        busy: (client) => client.status().connected,
        dispose: (client) => client.disconnect()
      }
    })

    ctx.expose(createPointsApi({ instances }))

    // Commun aux serveurs FTP et SFTP : mots de passe, dossier servi, clé d'hôte SFTP.
    ctx.handle('files:hashPassword', (password) => hashPassword(password))
    ctx.handle('files:defaultRoot', () => defaultRoot)
    ctx.handle('files:pickRoot', async () => {
      const { canceled, filePaths } = await dialog.showOpenDialog(window(), {
        title: t('ftp.server.pickRoot'),
        properties: ['openDirectory', 'createDirectory']
      })
      return canceled || !filePaths?.length ? null : filePaths[0]
    })
    ctx.handle('files:openRoot', async (root) => {
      const folder = root?.trim() || defaultRoot
      await fs.mkdir(folder, { recursive: true })
      const error = await shell.openPath(folder)
      if (error) throw new Error(error)
    })
    ctx.handle('sftp:hostKey', () => hostKey().then(({ publicKey, fingerprint }) => ({ publicKey, fingerprint })))
    ctx.handle('sftp:pickKey', async () => {
      const { canceled, filePaths } = await dialog.showOpenDialog(window(), {
        title: t('sftp.client.pickKey'),
        properties: ['openFile', 'showHiddenFiles']
      })
      return canceled || !filePaths?.length ? null : fs.readFile(filePaths[0], 'utf8')
    })

    instances.handle('server', 'start', (server, config) => server.start(config))
    instances.handle('server', 'stop', (server) => server.stop())
    instances.handle('server', 'update', (server, config) => server.update(config))
    instances.handle('server', 'logs', (server) => server.logs())
    instances.handle('server', 'clearLogs', (server) => server.clearLogs())

    instances.handle('sftpServer', 'start', (server, config) => server.start(config))
    instances.handle('sftpServer', 'stop', (server) => server.stop())
    instances.handle('sftpServer', 'updateUsers', (server, users) => server.updateUsers(users))
    instances.handle('sftpServer', 'logs', (server) => server.logs())
    instances.handle('sftpServer', 'clearLogs', (server) => server.clearLogs())

    instances.handle('client', 'dialog', (client) => client.dialog)
    instances.handle('client', 'clearDialog', (client) => client.clearDialog())

    // Navigation et transferts : mêmes opérations pour les clients FTP et SFTP.
    for (const role of ['client', 'sftpClient']) {
      instances.handle(role, 'connect', (client, config) => client.connect(config))
      instances.handle(role, 'disconnect', (client) => client.disconnect())
      instances.handle(role, 'list', (client, dir) => client.list(dir))
      instances.handle(role, 'mkdir', (client, name) => client.mkdir(name))
      instances.handle(role, 'remove', (client, name, type) => client.remove(name, type))
      instances.handle(role, 'rename', (client, from, to) => client.rename(from, to))
      // Transferts avec choix du fichier local (null si annulé).
      instances.handle(role, 'download', async (client, name) => {
        const { canceled, filePath } = await dialog.showSaveDialog(window(), {
          title: t('ftp.client.download'),
          defaultPath: join(app.getPath('downloads'), name.split('/').pop())
        })
        return canceled || !filePath ? null : client.download(name, filePath)
      })
      instances.handle(role, 'upload', async (client) => {
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

  /** Au moins un serveur démarré ou un client connecté. */
  busy() {
    return !!instances?.busy()
  },

  async deactivate() {
    await instances?.dispose()
    instances = null
  }
}
