import { join } from 'path'
import { ensureCertificate } from '@shared/certificate'
import { hashPassword } from '@shared/passwords'
import { MQTT_MODULE } from '../shared/constants'
import '../shared/locales'
import { MqttServer } from './server'
import { MqttClient } from './client'
import { createPointsApi } from './points'

const SERVER_COMMON_NAME = 'MQTT@Sulfur'

let server = null
let client = null

/** Partie "main" du module MQTT. Canaux : `mqtt:server:*`, `mqtt:client:*`. */
export const mqttMainModule = {
  manifest: MQTT_MODULE,

  activate(ctx) {
    server = new MqttServer(() => ensureCertificate(join(ctx.dataDir, 'pki', 'own'), SERVER_COMMON_NAME), {
      onStatus: (status) => ctx.emit('server:status', status),
      onLog: (batch) => ctx.emit('server:log', batch),
      onValues: (values) => ctx.emit('server:values', values)
    })
    client = new MqttClient({
      onStatus: (status) => ctx.emit('client:status', status),
      onMessages: (batch) => ctx.emit('client:messages', batch)
    })

    ctx.expose(createPointsApi({ server, client, savedConfig: ctx.config }))

    ctx.handle('server:status', () => server.status())
    ctx.handle('server:start', (config) => server.start(config))
    ctx.handle('server:stop', () => server.stop())
    ctx.handle('server:values', () => server.values())
    ctx.handle('server:setValue', (id, value) => server.setValue(id, value))
    ctx.handle('server:upsertTopic', (def) => server.upsertTopic(def))
    ctx.handle('server:removeTopic', (id) => server.removeTopic(id))
    ctx.handle('server:setUpdateRate', (rate) => server.setUpdateRate(rate))
    ctx.handle('server:logs', () => server.logs())
    ctx.handle('server:clearLogs', () => server.clearLogs())
    ctx.handle('server:topics', () => server.topics())
    ctx.handle('server:hashPassword', (password) => hashPassword(password))

    ctx.handle('client:status', () => client.status())
    ctx.handle('client:connect', (config) => client.connect(config))
    ctx.handle('client:disconnect', () => client.disconnect())
    ctx.handle('client:setSubscriptions', (list) => client.setSubscriptions(list))
    ctx.handle('client:publish', (message) => client.publish(message))
    ctx.handle('client:messages', () => ({ messages: client.messages(), last: client.values() }))
    ctx.handle('client:clearMessages', () => client.clearMessages())
  },

  /** Broker démarré ou client connecté. */
  busy() {
    return !!(server?.running || client?.client)
  },

  async deactivate() {
    await client?.disconnect().catch(() => {})
    await server?.stop().catch(() => {})
  }
}
