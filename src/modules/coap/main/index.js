import { COAP_MODULE } from '../shared/constants'
import '../shared/locales'
import { CoapServer } from './server'
import { CoapClient } from './client'
import { Lwm2mServer } from './lwm2m-server'
import { Lwm2mDevice } from './lwm2m-client'
import { createPointsApi } from './points'

let server = null
let client = null
let lwm2mServer = null
let device = null

/**
 * Partie "main" du module CoAP / LwM2M. Canaux : `coap:server:*` (serveur CoAP simulé),
 * `coap:client:*` (client CoAP), `coap:lwm2m:server:*` (serveur LwM2M) et `coap:lwm2m:client:*`
 * (appareil LwM2M simulé).
 */
export const coapMainModule = {
  manifest: COAP_MODULE,

  activate(ctx) {
    server = new CoapServer({
      onStatus: (status) => ctx.emit('server:status', status),
      onLog: (batch) => ctx.emit('server:log', batch),
      onValues: (values) => ctx.emit('server:values', values)
    })
    client = new CoapClient({
      onStatus: (status) => ctx.emit('client:status', status),
      onEntry: (entry) => ctx.emit('client:entry', entry)
    })
    lwm2mServer = new Lwm2mServer({
      onStatus: (status) => ctx.emit('lwm2m:server:status', status),
      onLog: (batch) => ctx.emit('lwm2m:server:log', batch)
    })
    device = new Lwm2mDevice({
      onStatus: (status) => ctx.emit('lwm2m:client:status', status),
      onLog: (batch) => ctx.emit('lwm2m:client:log', batch)
    })

    ctx.expose(createPointsApi({ server, lwm2mServer, device, savedConfig: ctx.config }))

    ctx.handle('server:status', () => server.status())
    ctx.handle('server:start', (config) => server.start(config))
    ctx.handle('server:stop', () => server.stop())
    ctx.handle('server:update', (config) => server.update(config))
    ctx.handle('server:values', () => server.currentValues())
    ctx.handle('server:setValue', (id, value) => server.setValue(id, value))
    ctx.handle('server:log', () => server.log)
    ctx.handle('server:clearLog', () => server.clearLog())

    ctx.handle('client:status', () => client.status())
    ctx.handle('client:request', (config) => client.request(config))
    ctx.handle('client:discover', (config) => client.discover(config))
    ctx.handle('client:observe', (config) => client.observe(config))
    ctx.handle('client:cancel', (token) => client.cancel(token))
    ctx.handle('client:history', () => client.history)
    ctx.handle('client:clear', () => client.clear())

    ctx.handle('lwm2m:server:status', () => lwm2mServer.status())
    ctx.handle('lwm2m:server:start', (config) => lwm2mServer.start(config))
    ctx.handle('lwm2m:server:stop', () => lwm2mServer.stop())
    ctx.handle('lwm2m:server:read', (id, path, format) => lwm2mServer.read(id, path, format))
    ctx.handle('lwm2m:server:write', (id, path, value) => lwm2mServer.write(id, path, value))
    ctx.handle('lwm2m:server:execute', (id, path, args) => lwm2mServer.execute(id, path, args))
    ctx.handle('lwm2m:server:discover', (id, path) => lwm2mServer.discover(id, path))
    ctx.handle('lwm2m:server:observe', (id, path, format) => lwm2mServer.observe(id, path, format))
    ctx.handle('lwm2m:server:cancel', (token) => lwm2mServer.cancelObservation(token))
    ctx.handle('lwm2m:server:log', () => lwm2mServer.log)
    ctx.handle('lwm2m:server:clearLog', () => lwm2mServer.clearLog())

    ctx.handle('lwm2m:client:status', () => device.status())
    ctx.handle('lwm2m:client:start', (config) => device.start(config))
    ctx.handle('lwm2m:client:stop', () => device.stop())
    ctx.handle('lwm2m:client:update', () => device.update().then(() => device.status()))
    ctx.handle('lwm2m:client:setValue', (path, value) => device.setValue(path, value))
    ctx.handle('lwm2m:client:log', () => device.log)
    ctx.handle('lwm2m:client:clearLog', () => device.clearLog())
  },

  /** Serveur CoAP ou LwM2M démarré, observation en cours ou appareil LwM2M démarré. */
  busy() {
    return !!(server?.running || lwm2mServer?.running || device?.running || client?.observations.size)
  },

  async deactivate() {
    await device?.stop().catch(() => {})
    await lwm2mServer?.stop().catch(() => {})
    await server?.stop().catch(() => {})
    await client?.dispose().catch(() => {})
  }
}
