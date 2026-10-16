import { NTP_MODULE } from '../shared/constants'
import '../shared/locales'
import { NtpServer } from './server'
import { NtpClient } from './client'
import { createPointsApi } from './points'

let server = null
let client = null

/** Partie "main" du module NTP. Canaux : `ntp:server:*`, `ntp:client:*`. */
export const ntpMainModule = {
  manifest: NTP_MODULE,

  activate(ctx) {
    server = new NtpServer({
      onStatus: (status) => ctx.emit('server:status', status),
      onLog: (entry) => ctx.emit('server:log', entry)
    })
    client = new NtpClient({
      onStatus: (status) => ctx.emit('client:status', status),
      onResult: (result) => ctx.emit('client:result', result)
    })

    ctx.expose(createPointsApi({ server, client }))

    ctx.handle('server:status', () => server.status())
    ctx.handle('server:start', (config) => server.start(config))
    ctx.handle('server:stop', () => server.stop())
    ctx.handle('server:logs', () => server.logs())
    ctx.handle('server:clearLogs', () => server.clearLogs())
    ctx.handle('server:setClock', (clock) => server.setClock(clock))
    ctx.handle('server:shift', (seconds) => server.shift(seconds))
    ctx.handle('server:setDrift', (ppm) => server.setDrift(ppm))
    ctx.handle('server:setSettings', (settings) => server.setSettings(settings))

    ctx.handle('client:status', () => client.status())
    ctx.handle('client:query', (options) => client.queryOnce(options))
    ctx.handle('client:startPolling', (options) => client.startPolling(options))
    ctx.handle('client:stopPolling', () => client.stopPolling())
    ctx.handle('client:history', () => client.history)
    ctx.handle('client:clearHistory', () => client.clearHistory())
  },

  /** Serveur démarré ou interrogation périodique en cours. */
  busy() {
    return !!(server?.status().running || client?.status().polling)
  },

  async deactivate() {
    client?.stopPolling()
    await server?.stop().catch(() => {})
  }
}
