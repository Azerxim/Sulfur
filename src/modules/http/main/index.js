import { instanceSection, migrateToInstances } from '@azerxim/sulfur-sdk'
import { defineInstances, ensureCertificate, hashPassword } from '@azerxim/sulfur-sdk/main'
import { join } from 'path'
import { HTTP_MODULE } from '../shared/constants'
import '../shared/locales'
import { t } from '../shared/i18n'
import { HttpServer, SERVER_COMMON_NAME } from './server'
import { HttpClient } from './client'
import { createPointsApi } from './points'

/** Instances uniques d'une version antérieure, converties en instances (« Serveur 1 »…). */
const migrateConfig = (config) =>
  migrateToInstances(config, {
    server: { sections: ['server'], name: `${t('ui.server')} 1` },
    client: { sections: ['client', 'clientRequest'], name: `${t('ui.client')} 1` }
  })

let instances = null

/**
 * Partie "main" du module HTTP / REST : serveurs et clients en nombre libre (aucun par défaut, voir
 * `defineInstances` du SDK). Canaux : `http:instances:*`, `http:server:*` et `http:client:*` (identifiant de l'instance en
 * premier argument).
 */
export const httpMainModule = {
  manifest: HTTP_MODULE,

  migrateConfig,

  activate(ctx) {
    const certificate = () => ensureCertificate(join(ctx.dataDir, 'pki', 'own'), SERVER_COMMON_NAME)
    instances = defineInstances(ctx, {
      server: {
        label: () => t('ui.server'),
        create: (_instance, { emit }) =>
          new HttpServer(certificate, {
            onStatus: (status) => emit('status', status),
            onValues: (values) => emit('values', values),
            onLog: (entry) => emit('log', entry)
          }),
        busy: (server) => server.status().running,
        dispose: (server) => server.stop()
      },
      client: {
        label: () => t('ui.client'),
        create(instance, { emit }) {
          const client = new HttpClient({
            onStatus: (status) => emit('status', status),
            onData: (data) => emit('data', data)
          })
          client.configure(ctx.config()[instanceSection('client', instance.id)])
          return client
        },
        dispose: (client) => client.dispose()
      }
    })

    ctx.expose(createPointsApi({ instances, savedConfig: ctx.config }))
    instances.handle('server', 'start', (server, config) => server.start(config))
    instances.handle('server', 'stop', (server) => server.stop())
    instances.handle('server', 'values', (server) => server.values())
    instances.handle('server', 'logs', (server) => server.logs())
    instances.handle('server', 'clearLogs', (server) => server.clearLogs())
    instances.handle('server', 'upsertVariable', (server, def) => server.upsertVariable(def))
    instances.handle('server', 'removeVariable', (server, id) => server.removeVariable(id))
    instances.handle('server', 'setValue', (server, id, value) => server.setValue(id, value))
    instances.handle('server', 'setRoutes', (server, routes) => server.setRoutes(routes))
    instances.handle('server', 'setWebhooks', (server, webhooks) => server.setWebhooks(webhooks))
    instances.handle('server', 'setUpdateRate', (server, rate) => server.setUpdateRate(rate))
    instances.handle('server', 'hashPassword', (server, password) => hashPassword(password))
    instances.handle('client', 'configure', (client, config) => client.configure(config))
    instances.handle('client', 'send', (client, request) => client.send(request))
    instances.handle('client', 'addWatch', (client, item) => client.addWatch(item))
    instances.handle('client', 'removeWatch', (client, id) => client.removeWatch(id))
    instances.handle('client', 'setPollInterval', (client, ms) => client.setPollInterval(ms))
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
