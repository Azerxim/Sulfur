import { instanceSection, migrateToInstances } from '@azerxim/sulfur-sdk'
import { defineInstances, ensureCertificate } from '@azerxim/sulfur-sdk/main'
import { join } from 'path'
import { DEFAULT_LDIF, LDAP_MODULE } from '../shared/constants'
import '../shared/locales'
import { t } from '../shared/i18n'
import { LdapServer, buildDirectory } from './server'
import { LdapClient } from './client'
import { RadiusServer } from './radius/server'
import { RadiusClient } from './radius/client'
import { createPointsApi } from './points'

const SERVER_COMMON_NAME = 'LDAP@Sulfur'

/** Instances uniques d'une version antérieure, converties en instances (« Serveur 1 »…). */
const migrateConfig = (config) =>
  migrateToInstances(config, {
    server: { sections: ['server'], name: `${t('ldap.tabs.server')} 1` },
    client: { sections: ['client'], name: `${t('ldap.tabs.client')} 1` },
    radiusServer: { id: 'radius', sections: ['radiusServer'], name: `${t('ldap.tabs.radiusServer')} 1` },
    radiusClient: { sections: ['radiusClient'], name: `${t('ldap.tabs.radiusClient')} 1` }
  })

let instances = null

/**
 * Partie "main" du module LDAP / RADIUS : serveurs et clients LDAP et RADIUS en nombre libre (aucun
 * par défaut, voir `defineInstances` du SDK). Canaux : `ldap:instances:*`, `ldap:server:*`,
 * `ldap:client:*`, `ldap:radiusServer:*` et `ldap:radiusClient:*` (identifiant de l'instance en
 * premier argument). Un serveur RADIUS authentifie aussi les comptes de l'annuaire LDAP.
 */
export const ldapMainModule = {
  manifest: LDAP_MODULE,

  migrateConfig,

  activate(ctx) {
    const certificate = () => ensureCertificate(join(ctx.dataDir, 'pki', 'own'), SERVER_COMMON_NAME)

    // Annuaire vu par RADIUS : celui du premier serveur LDAP en marche, sinon l'annuaire enregistré
    // du premier serveur LDAP (l'annuaire par défaut s'il n'y en a aucun).
    let saved = { ldif: null, directory: null }
    const directory = () => {
      const servers = instances.all('server')
      const running = servers.find(({ object }) => object.running)
      if (running) return running.object.directory
      const first = servers[0]?.instance
      const ldif = (first && ctx.config()[instanceSection('server', first.id)]?.ldif) ?? DEFAULT_LDIF
      if (saved.ldif !== ldif) {
        try {
          saved = { ldif, directory: buildDirectory(ldif) }
        } catch {
          saved = { ldif, directory: null }
        }
      }
      return saved.directory
    }

    instances = defineInstances(ctx, {
      server: {
        label: () => t('ldap.tabs.server'),
        create: (_instance, { emit }) =>
          new LdapServer(certificate, {
            onStatus: (status) => emit('status', status),
            onLog: (entry) => emit('log', entry)
          }),
        busy: (server) => server.running,
        dispose: (server) => server.stop()
      },
      client: { label: () => t('ldap.tabs.client'), create: () => new LdapClient() },
      radiusServer: {
        label: () => t('ldap.tabs.radiusServer'),
        create: (_instance, { emit }) =>
          new RadiusServer(directory, {
            onStatus: (status) => emit('status', status),
            onLog: (entry) => emit('log', entry)
          }),
        busy: (server) => server.running,
        dispose: (server) => server.stop()
      },
      radiusClient: { label: () => t('ldap.tabs.radiusClient'), create: () => new RadiusClient() }
    })

    ctx.expose(createPointsApi({ instances }))
    instances.handle('server', 'start', (server, config) => server.start(config))
    instances.handle('server', 'stop', (server) => server.stop())
    instances.handle('server', 'update', (server, config) => server.update(config))
    instances.handle('server', 'logs', (server) => server.logs())
    instances.handle('server', 'clearLogs', (server) => server.clearLogs())

    instances.handle('client', 'authenticate', (client, config) => client.authenticate(config))
    instances.handle('client', 'search', (client, config) => client.search(config))
    instances.handle('client', 'history', (client) => client.history)
    instances.handle('client', 'clear', (client) => client.clear())
    instances.handle('radiusServer', 'start', (radiusServer, config) => radiusServer.start(config))
    instances.handle('radiusServer', 'stop', (radiusServer) => radiusServer.stop())
    instances.handle('radiusServer', 'update', (radiusServer, config) => radiusServer.update(config))
    instances.handle('radiusServer', 'logs', (radiusServer) => radiusServer.logs())
    instances.handle('radiusServer', 'clearLogs', (radiusServer) => radiusServer.clearLogs())
    instances.handle('radiusClient', 'authenticate', (radiusClient, config) => radiusClient.authenticate(config))
    instances.handle('radiusClient', 'statusServer', (radiusClient, config) => radiusClient.statusServer(config))
    instances.handle('radiusClient', 'accounting', (radiusClient, config, action) =>
      radiusClient.accounting(config, action)
    )
    instances.handle('radiusClient', 'history', (radiusClient) => radiusClient.history)
    instances.handle('radiusClient', 'clear', (radiusClient) => radiusClient.clear())
  },

  /** Au moins un serveur LDAP ou RADIUS démarré. */
  busy() {
    return !!instances?.busy()
  },

  async deactivate() {
    await instances?.dispose()
    instances = null
  }
}
