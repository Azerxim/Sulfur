import { migrateToInstances } from '@azerxim/sulfur-sdk'
import { defineInstances, ensureCertificate, hashPassword } from '@azerxim/sulfur-sdk/main'
import { join } from 'path'
import { MQTT_MODULE } from '../shared/constants'
import '../shared/locales'
import { t } from '../shared/i18n'
import { MqttServer } from './server'
import { MqttClient } from './client'
import { createPointsApi } from './points'

const SERVER_COMMON_NAME = 'MQTT@Sulfur'

/** Serveur et client uniques d'une version antérieure, convertis en instances (« Serveur 1 »…). */
const migrateConfig = (config) =>
  migrateToInstances(config, {
    server: { sections: ['server'], name: `${t('ui.server')} 1` },
    client: { sections: ['client'], name: `${t('ui.client')} 1` }
  })

let instances = null

/**
 * Partie "main" du module MQTT : serveurs et clients en nombre libre (aucun par défaut, voir
 * `defineInstances` du SDK). Canaux : `mqtt:instances:*`, `mqtt:server:*` et `mqtt:client:*`
 * (identifiant de l'instance en premier argument).
 */
export const mqttMainModule = {
  manifest: MQTT_MODULE,

  migrateConfig,

  activate(ctx) {
    const certificate = () => ensureCertificate(join(ctx.dataDir, 'pki', 'own'), SERVER_COMMON_NAME)
    instances = defineInstances(ctx, {
      server: {
        label: () => t('ui.server'),
        create: (_instance, { emit }) =>
          new MqttServer(certificate, {
            onStatus: (status) => emit('status', status),
            onLog: (batch) => emit('log', batch),
            onValues: (values) => emit('values', values)
          }),
        busy: (server) => server.running,
        dispose: (server) => server.stop()
      },
      client: {
        label: () => t('ui.client'),
        create: (_instance, { emit }) =>
          new MqttClient({
            onStatus: (status) => emit('status', status),
            onMessages: (batch) => emit('messages', batch)
          }),
        busy: (client) => !!client.client,
        dispose: (client) => client.disconnect()
      }
    })

    ctx.expose(createPointsApi({ instances, savedConfig: ctx.config }))
    instances.handle('server', 'start', (server, config) => server.start(config))
    instances.handle('server', 'stop', (server) => server.stop())
    instances.handle('server', 'values', (server) => server.values())
    instances.handle('server', 'setValue', (server, id, value) => server.setValue(id, value))
    instances.handle('server', 'upsertTopic', (server, def) => server.upsertTopic(def))
    instances.handle('server', 'removeTopic', (server, id) => server.removeTopic(id))
    instances.handle('server', 'setUpdateRate', (server, rate) => server.setUpdateRate(rate))
    instances.handle('server', 'logs', (server) => server.logs())
    instances.handle('server', 'clearLogs', (server) => server.clearLogs())
    instances.handle('server', 'topics', (server) => server.topics())
    instances.handle('server', 'hashPassword', (server, password) => hashPassword(password))
    instances.handle('client', 'connect', (client, config) => client.connect(config))
    instances.handle('client', 'disconnect', (client) => client.disconnect())
    instances.handle('client', 'setSubscriptions', (client, list) => client.setSubscriptions(list))
    instances.handle('client', 'publish', (client, message) => client.publish(message))
    instances.handle('client', 'messages', (client) => ({ messages: client.messages(), last: client.values() }))
    instances.handle('client', 'clearMessages', (client) => client.clearMessages())
  },

  /** Au moins un broker démarré ou un client connecté. */
  busy() {
    return !!instances?.busy()
  },

  async deactivate() {
    await instances?.dispose()
    instances = null
  }
}
