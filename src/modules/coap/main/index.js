import { migrateToInstances } from '@azerxim/sulfur-sdk'
import { defineInstances } from '@azerxim/sulfur-sdk/main'
import { COAP_MODULE } from '../shared/constants'
import '../shared/locales'
import { t } from '../shared/i18n'
import { CoapServer } from './server'
import { CoapClient } from './client'
import { Lwm2mServer } from './lwm2m-server'
import { Lwm2mDevice } from './lwm2m-client'
import { createPointsApi } from './points'

/** Instances uniques d'une version antérieure, converties en instances (« Serveur 1 »…). */
const migrateConfig = (config) =>
  migrateToInstances(config, {
    server: { sections: ['server'], name: `${t('coap.tabs.server')} 1` },
    client: { sections: ['client'], name: `${t('coap.tabs.client')} 1` },
    lwm2mServer: { id: 'lwm2m', sections: ['lwm2mServer', 'lwm2mOperation'], name: `${t('coap.tabs.lwm2mServer')} 1` },
    device: { sections: ['device'], name: `${t('coap.tabs.device')} 1` }
  })

let instances = null

/**
 * Partie "main" du module CoAP / LwM2M : serveurs et clients CoAP, serveurs LwM2M et appareils
 * LwM2M simulés en nombre libre (aucun par défaut, voir `defineInstances` du SDK). Canaux :
 * `coap:instances:*`, `coap:server:*`, `coap:client:*`, `coap:lwm2mServer:*` et `coap:device:*`
 * (identifiant de l'instance en premier argument).
 */
export const coapMainModule = {
  manifest: COAP_MODULE,

  migrateConfig,

  activate(ctx) {
    instances = defineInstances(ctx, {
      server: {
        label: () => t('coap.tabs.server'),
        create: (_instance, { emit }) =>
          new CoapServer({
            onStatus: (status) => emit('status', status),
            onLog: (batch) => emit('log', batch),
            onValues: (values) => emit('values', values)
          }),
        busy: (server) => server.running,
        dispose: (server) => server.stop()
      },
      client: {
        label: () => t('coap.tabs.client'),
        create: (_instance, { emit }) =>
          new CoapClient({
            onStatus: (status) => emit('status', status),
            onEntry: (entry) => emit('entry', entry)
          }),
        busy: (client) => client.observations.size > 0,
        dispose: (client) => client.dispose()
      },
      lwm2mServer: {
        label: () => t('coap.tabs.lwm2mServer'),
        create: (_instance, { emit }) =>
          new Lwm2mServer({
            onStatus: (status) => emit('status', status),
            onLog: (batch) => emit('log', batch)
          }),
        busy: (server) => server.running,
        dispose: (server) => server.stop()
      },
      device: {
        label: () => t('coap.tabs.device'),
        create: (_instance, { emit }) =>
          new Lwm2mDevice({
            onStatus: (status) => emit('status', status),
            onLog: (batch) => emit('log', batch)
          }),
        busy: (device) => device.running,
        dispose: (device) => device.stop()
      }
    })

    ctx.expose(createPointsApi({ instances, savedConfig: ctx.config }))
    instances.handle('server', 'start', (server, config) => server.start(config))
    instances.handle('server', 'stop', (server) => server.stop())
    instances.handle('server', 'update', (server, config) => server.update(config))
    instances.handle('server', 'values', (server) => server.currentValues())
    instances.handle('server', 'setValue', (server, id, value) => server.setValue(id, value))
    instances.handle('server', 'log', (server) => server.log)
    instances.handle('server', 'clearLog', (server) => server.clearLog())
    instances.handle('client', 'request', (client, config) => client.request(config))
    instances.handle('client', 'discover', (client, config) => client.discover(config))
    instances.handle('client', 'observe', (client, config) => client.observe(config))
    instances.handle('client', 'cancel', (client, token) => client.cancel(token))
    instances.handle('client', 'history', (client) => client.history)
    instances.handle('client', 'clear', (client) => client.clear())
    instances.handle('lwm2mServer', 'start', (lwm2mServer, config) => lwm2mServer.start(config))
    instances.handle('lwm2mServer', 'stop', (lwm2mServer) => lwm2mServer.stop())
    instances.handle('lwm2mServer', 'read', (lwm2mServer, id, path, format) => lwm2mServer.read(id, path, format))
    instances.handle('lwm2mServer', 'write', (lwm2mServer, id, path, value) => lwm2mServer.write(id, path, value))
    instances.handle('lwm2mServer', 'execute', (lwm2mServer, id, path, args) => lwm2mServer.execute(id, path, args))
    instances.handle('lwm2mServer', 'discover', (lwm2mServer, id, path) => lwm2mServer.discover(id, path))
    instances.handle('lwm2mServer', 'observe', (lwm2mServer, id, path, format) => lwm2mServer.observe(id, path, format))
    instances.handle('lwm2mServer', 'cancel', (lwm2mServer, token) => lwm2mServer.cancelObservation(token))
    instances.handle('lwm2mServer', 'log', (lwm2mServer) => lwm2mServer.log)
    instances.handle('lwm2mServer', 'clearLog', (lwm2mServer) => lwm2mServer.clearLog())
    instances.handle('device', 'start', (device, config) => device.start(config))
    instances.handle('device', 'stop', (device) => device.stop())
    instances.handle('device', 'update', (device) => device.update().then(() => device.status()))
    instances.handle('device', 'setValue', (device, path, value) => device.setValue(path, value))
    instances.handle('device', 'log', (device) => device.log)
    instances.handle('device', 'clearLog', (device) => device.clearLog())
  },

  /** Au moins un serveur CoAP ou LwM2M démarré, une observation en cours ou un appareil démarré. */
  busy() {
    return !!instances?.busy()
  },

  async deactivate() {
    await instances?.dispose()
    instances = null
  }
}
