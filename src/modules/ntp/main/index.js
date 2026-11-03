import { defineInstances } from '@azerxim/sulfur-sdk/main'
import { migrateToInstances } from '@azerxim/sulfur-sdk'
import { NTP_MODULE } from '../shared/constants'
import '../shared/locales'
import { NtpServer } from './server'
import { NtpClient } from './client'
import { createPointsApi } from './points'
import { t } from '../shared/i18n'

/** Serveur et client uniques d'une version antérieure : « Serveur 1 » et « Client 1 ». */
export const migrateNtpConfig = (config) =>
  migrateToInstances(config, {
    server: { sections: ['server'], name: `${t('ui.server')} 1` },
    client: { sections: ['client'], name: `${t('ui.client')} 1` }
  })

let instances = null

/**
 * Partie "main" du module NTP : serveurs et clients en nombre libre (aucun par défaut, voir
 * `defineInstances` du SDK). Canaux : `ntp:instances:*`, `ntp:server:*` et `ntp:client:*`
 * (identifiant de l'instance en premier argument).
 */
export const ntpMainModule = {
  manifest: NTP_MODULE,

  migrateConfig: migrateNtpConfig,

  activate(ctx) {
    instances = defineInstances(ctx, {
      server: {
        label: () => t('ui.server'),
        create: (_instance, { emit }) =>
          new NtpServer({
            onStatus: (status) => emit('status', status),
            onLog: (entry) => emit('log', entry)
          }),
        busy: (server) => server.status().running,
        dispose: (server) => server.stop()
      },
      client: {
        label: () => t('ui.client'),
        create: (_instance, { emit }) =>
          new NtpClient({
            onStatus: (status) => emit('status', status),
            onResult: (result) => emit('result', result)
          }),
        busy: (client) => client.status().polling,
        dispose: (client) => client.stopPolling()
      }
    })

    ctx.expose(createPointsApi({ instances }))

    instances.handle('server', 'start', (server, config) => server.start(config))
    instances.handle('server', 'stop', (server) => server.stop())
    instances.handle('server', 'logs', (server) => server.logs())
    instances.handle('server', 'clearLogs', (server) => server.clearLogs())
    instances.handle('server', 'setClock', (server, clock) => server.setClock(clock))
    instances.handle('server', 'shift', (server, seconds) => server.shift(seconds))
    instances.handle('server', 'setDrift', (server, ppm) => server.setDrift(ppm))
    instances.handle('server', 'setSettings', (server, settings) => server.setSettings(settings))
    instances.handle('client', 'query', (client, options) => client.queryOnce(options))
    instances.handle('client', 'startPolling', (client, options) => client.startPolling(options))
    instances.handle('client', 'stopPolling', (client) => client.stopPolling())
    instances.handle('client', 'history', (client) => client.history)
    instances.handle('client', 'clearHistory', (client) => client.clearHistory())
  },

  /** Au moins un serveur démarré ou une interrogation périodique en cours. */
  busy() {
    return !!instances?.busy()
  },

  async deactivate() {
    await instances?.dispose()
    instances = null
  }
}
