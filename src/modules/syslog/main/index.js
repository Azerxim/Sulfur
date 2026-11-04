import { migrateToInstances } from '@azerxim/sulfur-sdk'
import { defineInstances, ensureCertificate } from '@azerxim/sulfur-sdk/main'
import { join } from 'path'
import { SYSLOG_MODULE } from '../shared/constants'
import '../shared/locales'
import { t } from '../shared/i18n'
import { SyslogServer } from './server'
import { SyslogClient } from './client'
import { createPointsApi } from './points'

const SERVER_COMMON_NAME = 'Syslog@Sulfur'

/** Serveur et client uniques d'une version antérieure, convertis en instances (« Serveur 1 »…). */
const migrateConfig = (config) =>
  migrateToInstances(config, {
    server: { sections: ['server'], name: `${t('ui.server')} 1` },
    client: { sections: ['client'], name: `${t('ui.client')} 1` }
  })

let instances = null

/**
 * Partie "main" du module Syslog : serveurs et clients en nombre libre (aucun par défaut, voir
 * `defineInstances` du SDK). Canaux : `syslog:instances:*`, `syslog:server:*` et `syslog:client:*`
 * (identifiant de l'instance en premier argument).
 */
export const syslogMainModule = {
  manifest: SYSLOG_MODULE,

  migrateConfig,

  activate(ctx) {
    const certificate = () => ensureCertificate(join(ctx.dataDir, 'pki', 'own'), SERVER_COMMON_NAME)
    instances = defineInstances(ctx, {
      server: {
        label: () => t('ui.server'),
        create: (_instance, { emit }) =>
          new SyslogServer(certificate, {
            onStatus: (status) => emit('status', status),
            onMessages: (batch) => emit('messages', batch)
          }),
        busy: (server) => server.running,
        dispose: (server) => server.stop()
      },
      client: {
        label: () => t('ui.client'),
        create: (_instance, { emit }) =>
          new SyslogClient({
            onStatus: (status) => emit('status', status),
            onSent: (entry) => emit('sent', entry)
          }),
        busy: (client) => !!client.repeatTimer,
        dispose: (client) => client.close()
      }
    })

    ctx.expose(createPointsApi({ instances, savedConfig: ctx.config }))
    instances.handle('server', 'start', (server, config) => server.start(config))
    instances.handle('server', 'stop', (server) => server.stop())
    instances.handle('server', 'messages', (server) => server.list())
    instances.handle('server', 'clear', (server) => server.clear())
    instances.handle('client', 'send', (client, config) => client.send(config))
    instances.handle('client', 'startRepeat', (client, config) => client.startRepeat(config))
    instances.handle('client', 'stopRepeat', (client) => client.stopRepeat())
    instances.handle('client', 'disconnect', (client) => {
      client.disconnect()
      return client.status()
    })
    instances.handle('client', 'history', (client) => client.history)
    instances.handle('client', 'clearHistory', (client) => client.clearHistory())
  },

  /** Au moins un serveur démarré ou un envoi périodique en cours. */
  busy() {
    return !!instances?.busy()
  },

  async deactivate() {
    await instances?.dispose()
    instances = null
  }
}
