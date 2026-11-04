import { migrateToInstances, PRIVATE_NETWORKS } from '@azerxim/sulfur-sdk'
import { defineInstances } from '@azerxim/sulfur-sdk/main'
import { shell } from 'electron'
import fs from 'fs/promises'
import { join } from 'path'
import { DHCP_MODULE } from '../shared/constants'
import '../shared/locales'
import { t } from '../shared/i18n'
import { listInterfaces } from './config'
import { DhcpServer } from './server'
import { DhcpClient } from './client'

/** Serveur et client uniques d'une version antérieure, convertis en instances (« Serveur 1 »…). */
const migrateConfig = (config) =>
  migrateToInstances(config, {
    server: { sections: ['server'], name: `${t('ui.server')} 1` },
    client: { sections: ['client'], name: `${t('ui.client')} 1` }
  })

let instances = null

/**
 * Partie "main" du module DHCP : serveurs et clients en nombre libre (aucun par défaut, voir
 * `defineInstances` du SDK). Canaux : `dhcp:interfaces`, `dhcp:instances:*`, `dhcp:server:*` et
 * `dhcp:client:*` (identifiant de l'instance en premier argument). Un serveur n'est jamais démarré
 * automatiquement : seul `dhcp:server:start`, appelé après confirmation de l'avertissement
 * (`confirmed` à true), le démarre.
 */
export const dhcpMainModule = {
  manifest: DHCP_MODULE,

  migrateConfig,

  activate(ctx) {
    instances = defineInstances(ctx, {
      server: {
        label: () => t('ui.server'),
        // Un journal par serveur (`logs/server.log` pour celui d'une version antérieure).
        create: (instance, { emit }) =>
          new DhcpServer(join(ctx.dataDir, 'logs', `${instance.id}.log`), {
            onStatus: (status) => emit('status', status),
            onLog: (entry) => emit('log', entry)
          }),
        busy: (server) => server.running,
        dispose: (server) => server.stop()
      },
      client: {
        label: () => t('ui.client'),
        create: (_instance, { emit }) => new DhcpClient({ onStatus: (status) => emit('status', status) }),
        busy: (client) => !!client.current,
        dispose: (client) => client.abort()
      }
    })

    ctx.handle('interfaces', () => ({ interfaces: listInterfaces(), networks: PRIVATE_NETWORKS.map((n) => n.cidr) }))
    instances.handle('server', 'check', (server, config) => server.check(config))
    instances.handle('server', 'start', (server, config, confirmed) => server.start(config, confirmed))
    instances.handle('server', 'stop', (server) => server.stop())
    instances.handle('server', 'logs', (server) => server.logs())
    instances.handle('server', 'clearLogs', (server) => server.clearLogs())
    instances.handle('server', 'openLogFile', async (server) => {
      await fs.mkdir(join(ctx.dataDir, 'logs'), { recursive: true })
      await fs.appendFile(server.logFile, '')
      const error = await shell.openPath(server.logFile)
      if (error) throw new Error(error)
    })
    instances.handle('client', 'history', (client) => client.history)
    instances.handle('client', 'clear', (client) => client.clear())
    instances.handle('client', 'run', (client, config, mode) => client.run(config, mode))
    instances.handle('client', 'release', (client, config) => client.release(config))
    instances.handle('client', 'abort', (client) => client.abort())
  },

  /** Au moins un serveur démarré ou un échange de client en cours. */
  busy() {
    return !!instances?.busy()
  },

  async deactivate() {
    await instances?.dispose()
    instances = null
  }
}
