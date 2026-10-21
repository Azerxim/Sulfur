import { join } from 'path'
import { ensureCertificate } from '@azerxim/sulfur-sdk/main'
import { DEFAULT_LDIF, LDAP_MODULE } from '../shared/constants'
import '../shared/locales'
import { LdapServer, buildDirectory } from './server'
import { LdapClient } from './client'
import { RadiusServer } from './radius/server'
import { RadiusClient } from './radius/client'
import { createPointsApi } from './points'

const SERVER_COMMON_NAME = 'LDAP@Sulfur'

let server = null
let client = null
let radiusServer = null
let radiusClient = null

/**
 * Partie "main" du module LDAP / RADIUS. Canaux : `ldap:server:*`, `ldap:client:*` (LDAP),
 * `ldap:radius:server:*`, `ldap:radius:client:*` (RADIUS). Le serveur RADIUS authentifie aussi les
 * comptes de l'annuaire du serveur LDAP.
 */
export const ldapMainModule = {
  manifest: LDAP_MODULE,

  activate(ctx) {
    server = new LdapServer(() => ensureCertificate(join(ctx.dataDir, 'pki', 'own'), SERVER_COMMON_NAME), {
      onStatus: (status) => ctx.emit('server:status', status),
      onLog: (entry) => ctx.emit('server:log', entry)
    })
    client = new LdapClient()

    // Annuaire vu par RADIUS : celui du serveur LDAP en marche, sinon l'annuaire enregistré.
    let saved = { ldif: null, directory: null }
    const directory = () => {
      if (server.running) return server.directory
      const ldif = ctx.config().server?.ldif ?? DEFAULT_LDIF
      if (saved.ldif !== ldif) {
        try {
          saved = { ldif, directory: buildDirectory(ldif) }
        } catch {
          saved = { ldif, directory: null }
        }
      }
      return saved.directory
    }
    radiusServer = new RadiusServer(directory, {
      onStatus: (status) => ctx.emit('radius:server:status', status),
      onLog: (entry) => ctx.emit('radius:server:log', entry)
    })
    radiusClient = new RadiusClient()

    ctx.expose(createPointsApi({ server, radiusServer }))

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

    ctx.handle('radius:server:status', () => radiusServer.status())
    ctx.handle('radius:server:start', (config) => radiusServer.start(config))
    ctx.handle('radius:server:stop', () => radiusServer.stop())
    ctx.handle('radius:server:update', (config) => radiusServer.update(config))
    ctx.handle('radius:server:logs', () => radiusServer.logs())
    ctx.handle('radius:server:clearLogs', () => radiusServer.clearLogs())

    ctx.handle('radius:client:status', () => radiusClient.status())
    ctx.handle('radius:client:authenticate', (config) => radiusClient.authenticate(config))
    ctx.handle('radius:client:statusServer', (config) => radiusClient.statusServer(config))
    ctx.handle('radius:client:accounting', (config, action) => radiusClient.accounting(config, action))
    ctx.handle('radius:client:history', () => radiusClient.history)
    ctx.handle('radius:client:clear', () => radiusClient.clear())
  },

  /** Un serveur démarré. */
  busy() {
    return !!(server?.running || radiusServer?.running)
  },

  async deactivate() {
    await Promise.all([server?.stop().catch(() => {}), radiusServer?.stop().catch(() => {})])
  }
}
