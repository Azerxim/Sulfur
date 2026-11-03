import { migrateToInstances } from '@azerxim/sulfur-sdk'
import { defineInstances } from '@azerxim/sulfur-sdk/main'
import { DNS_MODULE } from '../shared/constants'
import '../shared/locales'
import { t } from '../shared/i18n'
import { DnsServer } from './server'
import { DnsClient } from './client'
import { createPointsApi } from './points'

/** Serveur et client uniques d'une version antérieure, convertis en instances (« Serveur 1 »…). */
const migrateConfig = (config) =>
  migrateToInstances(config, {
    server: { sections: ['server'], name: `${t('ui.server')} 1` },
    client: { sections: ['client'], name: `${t('ui.client')} 1` }
  })

let instances = null

/**
 * Partie "main" du module DNS : serveurs et clients en nombre libre (aucun par défaut, voir
 * `defineInstances` du SDK). Canaux : `dns:instances:*`, `dns:server:*` et `dns:client:*`
 * (identifiant de l'instance en premier argument).
 */
export const dnsMainModule = {
  manifest: DNS_MODULE,

  migrateConfig,

  activate(ctx) {
    instances = defineInstances(ctx, {
      server: {
        label: () => t('ui.server'),
        create: (_instance, { emit }) =>
          new DnsServer({
            onStatus: (status) => emit('status', status),
            onQuery: (entry) => emit('query', entry)
          }),
        busy: (server) => server.running,
        dispose: (server) => server.stop()
      },
      client: { label: () => t('ui.client'), create: () => new DnsClient() }
    })

    ctx.expose(createPointsApi({ instances }))
    instances.handle('server', 'start', (server, config) => server.start(config))
    instances.handle('server', 'stop', (server) => server.stop())
    instances.handle('server', 'update', (server, config) => server.update(config))
    instances.handle('server', 'queries', (server) => server.list())
    instances.handle('server', 'clear', (server) => server.clear())

    instances.handle('client', 'query', (client, config) => client.query(config))
    instances.handle('client', 'history', (client) => client.history)
    instances.handle('client', 'clear', (client) => client.clear())
  },

  /** Au moins un serveur démarré. */
  busy() {
    return !!instances?.busy()
  },

  async deactivate() {
    await instances?.dispose()
    instances = null
  }
}
