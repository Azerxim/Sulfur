import { join } from 'path'
import { ensureCertificate } from '@azerxim/sulfur-sdk/main'
import { SYSLOG_MODULE } from '../shared/constants'
import '../shared/locales'
import { SyslogServer } from './server'
import { SyslogClient } from './client'
import { createPointsApi } from './points'

const SERVER_COMMON_NAME = 'Syslog@Sulfur'

let server = null
let client = null

/** Partie "main" du module Syslog. Canaux : `syslog:server:*`, `syslog:client:*`. */
export const syslogMainModule = {
  manifest: SYSLOG_MODULE,

  activate(ctx) {
    server = new SyslogServer(() => ensureCertificate(join(ctx.dataDir, 'pki', 'own'), SERVER_COMMON_NAME), {
      onStatus: (status) => ctx.emit('server:status', status),
      onMessages: (batch) => ctx.emit('server:messages', batch)
    })
    client = new SyslogClient({
      onStatus: (status) => ctx.emit('client:status', status),
      onSent: (entry) => ctx.emit('client:sent', entry)
    })

    ctx.expose(createPointsApi({ server, client, savedConfig: ctx.config }))

    ctx.handle('server:status', () => server.status())
    ctx.handle('server:start', (config) => server.start(config))
    ctx.handle('server:stop', () => server.stop())
    ctx.handle('server:messages', () => server.list())
    ctx.handle('server:clear', () => server.clear())

    ctx.handle('client:status', () => client.status())
    ctx.handle('client:send', (config) => client.send(config))
    ctx.handle('client:startRepeat', (config) => client.startRepeat(config))
    ctx.handle('client:stopRepeat', () => client.stopRepeat())
    ctx.handle('client:disconnect', () => {
      client.disconnect()
      return client.status()
    })
    ctx.handle('client:history', () => client.history)
    ctx.handle('client:clearHistory', () => client.clearHistory())
  },

  /** Serveur démarré ou envoi périodique en cours. */
  busy() {
    return !!(server?.running || client?.repeatTimer)
  },

  async deactivate() {
    client?.close()
    await server?.stop().catch(() => {})
  }
}
