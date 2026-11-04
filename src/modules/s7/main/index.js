import { instanceSection, migrateToInstances } from '@azerxim/sulfur-sdk'
import { defineInstances } from '@azerxim/sulfur-sdk/main'
import { S7_MODULE } from '../shared/constants'
import '../shared/locales'
import { t } from '../shared/i18n'
import { S7Server } from './server'
import { S7Client } from './client'
import { createPointsApi } from './points'

/** Instances uniques d'une version antérieure, converties en instances (« Serveur 1 »…). */
const migrateConfig = (config) =>
  migrateToInstances(config, {
    server: { sections: ['server'], name: `${t('s7.tabs.server')} 1` },
    client: { sections: ['client', 'clientRequest', 'watches'], name: `${t('ui.client')} 1` }
  })

let instances = null

/**
 * Partie "main" du module Siemens S7 : automates simulés et clients en nombre libre (aucun par défaut, voir
 * `defineInstances` du SDK). Canaux : `s7:instances:*`, `s7:server:*` et `s7:client:*` (identifiant de l'instance en
 * premier argument).
 */
export const s7MainModule = {
  manifest: S7_MODULE,

  migrateConfig,

  activate(ctx) {
    instances = defineInstances(ctx, {
      server: {
        label: () => t('s7.tabs.server'),
        create: (_instance, { emit }) =>
          new S7Server({
            onStatus: (status) => emit('status', status),
            onValues: (values) => emit('values', values),
            onLog: (entry) => emit('log', entry)
          }),
        busy: (server) => server.status().running,
        dispose: (server) => server.stop()
      },
      client: {
        label: () => t('ui.client'),
        // Surveillances enregistrées par client (section `watches:<id>`), restaurées au démarrage.
        create(instance, { emit }) {
          const section = instanceSection('watches', instance.id)
          const client = new S7Client({
            onStatus: (status) => emit('status', status),
            onData: (data) => emit('data', data),
            onWatches: (watches) => ctx.setConfig(section, watches)
          })
          client.restoreWatches(ctx.config()[section])
          return client
        },
        busy: (client) => client.status().connected,
        dispose: (client) => client.disconnect()
      }
    })

    ctx.expose(createPointsApi({ instances, savedConfig: ctx.config }))
    instances.handle('server', 'start', (server, config) => server.start(config))
    instances.handle('server', 'stop', (server) => server.stop())
    instances.handle('server', 'values', (server) => server.values())
    instances.handle('server', 'logs', (server) => server.logs())
    instances.handle('server', 'clearLogs', (server) => server.clearLogs())
    instances.handle('server', 'upsertPoint', (server, def) => server.upsertPoint(def))
    instances.handle('server', 'removePoint', (server, id) => server.removePoint(id))
    instances.handle('server', 'setValue', (server, id, value) => server.setValue(id, value))
    instances.handle('server', 'setCpuState', (server, state) => server.setCpuState(state))
    instances.handle('server', 'setUpdateRate', (server, rate) => server.setUpdateRate(rate))
    instances.handle('server', 'setReadOnly', (server, readOnly) => server.setReadOnly(readOnly))
    instances.handle('server', 'memory', (server, area, db, start, count) => server.readMemory(area, db, start, count))
    instances.handle('server', 'writeMemory', (server, area, db, offset, value) =>
      server.writeMemory(area, db, offset, value)
    )
    instances.handle('client', 'connect', (client, config) => client.connect(config))
    instances.handle('client', 'disconnect', (client) => client.disconnect())
    instances.handle('client', 'readValue', (client, address, dataType, length) =>
      client.readValue(address, dataType, length)
    )
    instances.handle('client', 'writeValue', (client, address, dataType, value, length) =>
      client.writeValue(address, dataType, value, length)
    )
    instances.handle('client', 'readArea', (client, area, db, start, count) => client.readArea(area, db, start, count))
    instances.handle('client', 'writeArea', (client, area, db, start, bytes) =>
      client.writeArea(area, db, start, bytes)
    )
    instances.handle('client', 'identify', async (client) => {
      const identity = await client.readIdentity()
      await client.readCpuState().catch(() => null)
      return identity
    })
    instances.handle('client', 'cpuState', (client) => client.readCpuState())
    instances.handle('client', 'stopCpu', (client) => client.stopCpu())
    instances.handle('client', 'startCpu', (client, mode) => client.startCpu(mode))
    instances.handle('client', 'addWatch', (client, item) => client.addWatch(item))
    instances.handle('client', 'removeWatch', (client, id) => client.removeWatch(id))
    instances.handle('client', 'setPollInterval', (client, ms) => client.setPollInterval(ms))
  },

  /** Au moins un automate simulé démarré ou un client connecté. */
  busy() {
    return !!instances?.busy()
  },

  async deactivate() {
    await instances?.dispose()
    instances = null
  }
}
