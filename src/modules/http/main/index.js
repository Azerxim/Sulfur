import { join } from 'path'
import { ensureCertificate, hashPassword } from '@azerxim/sulfur-sdk/main'
import { HTTP_MODULE } from '../shared/constants'
import '../shared/locales'
import { HttpServer, SERVER_COMMON_NAME } from './server'
import { HttpClient } from './client'
import { createPointsApi } from './points'

let server = null
let client = null

/** Partie "main" du module HTTP / REST. Canaux : `http:server:*`, `http:client:*`. */
export const httpMainModule = {
  manifest: HTTP_MODULE,

  activate(ctx) {
    server = new HttpServer(() => ensureCertificate(join(ctx.dataDir, 'pki', 'own'), SERVER_COMMON_NAME), {
      onStatus: (status) => ctx.emit('server:status', status),
      onValues: (values) => ctx.emit('server:values', values),
      onLog: (entry) => ctx.emit('server:log', entry)
    })
    client = new HttpClient({
      onStatus: (status) => ctx.emit('client:status', status),
      onData: (data) => ctx.emit('client:data', data)
    })
    client.configure(ctx.config().client)

    ctx.expose(createPointsApi({ server, client, savedConfig: ctx.config }))

    ctx.handle('server:status', () => server.status())
    ctx.handle('server:start', (config) => server.start(config))
    ctx.handle('server:stop', () => server.stop())
    ctx.handle('server:values', () => server.values())
    ctx.handle('server:logs', () => server.logs())
    ctx.handle('server:clearLogs', () => server.clearLogs())
    ctx.handle('server:upsertVariable', (def) => server.upsertVariable(def))
    ctx.handle('server:removeVariable', (id) => server.removeVariable(id))
    ctx.handle('server:setValue', (id, value) => server.setValue(id, value))
    ctx.handle('server:setRoutes', (routes) => server.setRoutes(routes))
    ctx.handle('server:setWebhooks', (webhooks) => server.setWebhooks(webhooks))
    ctx.handle('server:setUpdateRate', (rate) => server.setUpdateRate(rate))
    ctx.handle('server:hashPassword', (password) => hashPassword(password))

    ctx.handle('client:status', () => client.status())
    ctx.handle('client:configure', (config) => client.configure(config))
    ctx.handle('client:send', (request) => client.send(request))
    ctx.handle('client:addWatch', (item) => client.addWatch(item))
    ctx.handle('client:removeWatch', (id) => client.removeWatch(id))
    ctx.handle('client:setPollInterval', (ms) => client.setPollInterval(ms))
  },

  /** Serveur démarré. */
  busy() {
    return !!server?.status().running
  },

  async deactivate() {
    client?.dispose()
    await server?.stop().catch(() => {})
  }
}
