import { DNS_MODULE } from '../shared/constants'
import '../shared/locales'
import { DnsServer } from './server'
import { DnsClient } from './client'
import { createPointsApi } from './points'

let server = null
let client = null

/** Partie "main" du module DNS. Canaux : `dns:server:*`, `dns:client:*`. */
export const dnsMainModule = {
  manifest: DNS_MODULE,

  activate(ctx) {
    server = new DnsServer({
      onStatus: (status) => ctx.emit('server:status', status),
      onQuery: (entry) => ctx.emit('server:query', entry)
    })
    client = new DnsClient()

    ctx.expose(createPointsApi({ server }))

    ctx.handle('server:status', () => server.status())
    ctx.handle('server:start', (config) => server.start(config))
    ctx.handle('server:stop', () => server.stop())
    ctx.handle('server:update', (config) => server.update(config))
    ctx.handle('server:queries', () => server.list())
    ctx.handle('server:clear', () => server.clear())

    ctx.handle('client:query', (config) => client.query(config))
    ctx.handle('client:history', () => client.history)
    ctx.handle('client:clear', () => client.clear())
  },

  /** Serveur démarré. */
  busy() {
    return !!server?.running
  },

  async deactivate() {
    await server?.stop().catch(() => {})
  }
}
