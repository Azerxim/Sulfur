import { shell } from 'electron'
import fs from 'fs/promises'
import { join } from 'path'
import { PRIVATE_NETWORKS } from '@azerxim/sulfur-sdk'
import { DHCP_MODULE } from '../shared/constants'
import '../shared/locales'
import { listInterfaces } from './config'
import { DhcpServer } from './server'
import { DhcpClient } from './client'

let server = null
let client = null

/**
 * Partie "main" du module DHCP. Canaux : `dhcp:interfaces`, `dhcp:server:*`, `dhcp:client:*`.
 * Le serveur n'est jamais démarré automatiquement : seul `dhcp:server:start`, appelé après
 * confirmation de l'avertissement (`confirmed` à true), le démarre.
 */
export const dhcpMainModule = {
  manifest: DHCP_MODULE,

  activate(ctx) {
    const logFile = join(ctx.dataDir, 'logs', 'server.log')
    server = new DhcpServer(logFile, {
      onStatus: (status) => ctx.emit('server:status', status),
      onLog: (entry) => ctx.emit('server:log', entry)
    })
    client = new DhcpClient({ onStatus: (status) => ctx.emit('client:status', status) })

    ctx.handle('interfaces', () => ({ interfaces: listInterfaces(), networks: PRIVATE_NETWORKS.map((n) => n.cidr) }))

    ctx.handle('server:status', () => server.status())
    ctx.handle('server:check', (config) => server.check(config))
    ctx.handle('server:start', (config, confirmed) => server.start(config, confirmed))
    ctx.handle('server:stop', () => server.stop())
    ctx.handle('server:logs', () => server.logs())
    ctx.handle('server:clearLogs', () => server.clearLogs())
    ctx.handle('server:openLogFile', async () => {
      await fs.mkdir(join(ctx.dataDir, 'logs'), { recursive: true })
      await fs.appendFile(logFile, '')
      const error = await shell.openPath(logFile)
      if (error) throw new Error(error)
    })

    ctx.handle('client:status', () => client.status())
    ctx.handle('client:history', () => client.history)
    ctx.handle('client:clear', () => client.clear())
    ctx.handle('client:run', (config, mode) => client.run(config, mode))
    ctx.handle('client:release', (config) => client.release(config))
    ctx.handle('client:abort', () => client.abort())
  },

  /** Serveur démarré ou échange du client en cours. */
  busy() {
    return !!(server?.running || client?.current)
  },

  async deactivate() {
    client?.abort()
    await server?.stop().catch(() => {})
  }
}
