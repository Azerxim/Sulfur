import { join } from 'path'
import { ensureCertificate } from '@shared/certificate'
import { LDAP_MODULE } from '../shared/constants'
import '../shared/locales'
import { LdapServer } from './server'
import { LdapClient } from './client'
import { createPointsApi } from './points'

const SERVER_COMMON_NAME = 'LDAP@Sulfur'

let server = null
let client = null

/** Partie "main" du module LDAP. Canaux : `ldap:server:*`, `ldap:client:*`. */
export const ldapMainModule = {
  manifest: LDAP_MODULE,

  activate(ctx) {
    server = new LdapServer(() => ensureCertificate(join(ctx.dataDir, 'pki', 'own'), SERVER_COMMON_NAME), {
      onStatus: (status) => ctx.emit('server:status', status),
      onLog: (entry) => ctx.emit('server:log', entry)
    })
    client = new LdapClient()

    ctx.expose(createPointsApi({ server }))

    ctx.handle('server:status', () => server.status())
    ctx.handle('server:start', (config) => server.start(config))
    ctx.handle('server:stop', () => server.stop())
    ctx.handle('server:update', (config) => server.update(config))
    ctx.handle('server:logs', () => server.logs())
    ctx.handle('server:clearLogs', () => server.clearLogs())

    ctx.handle('client:authenticate', (config) => client.authenticate(config))
    ctx.handle('client:search', (config) => client.search(config))
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
