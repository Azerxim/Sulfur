import { migrateToInstances } from '@azerxim/sulfur-sdk'
import { defineInstances } from '@azerxim/sulfur-sdk/main'
import { SNMP_MODULE } from '../shared/constants'
import '../shared/locales'
import { t } from '../shared/i18n'
import { SnmpAgent } from './agent'
import { SnmpManager } from './manager'
import { createPointsApi } from './points'

/** Instances uniques d'une version antérieure, converties en instances (« Serveur 1 »…). */
const migrateConfig = (config) =>
  migrateToInstances(config, {
    agent: { id: 'server', sections: ['agent'], name: `${t('snmp.tabs.agent')} 1` },
    manager: { id: 'client', sections: ['manager'], name: `${t('snmp.tabs.manager')} 1` }
  })

let instances = null

/**
 * Partie "main" du module SNMP : agents et managers en nombre libre (aucun par défaut, voir
 * `defineInstances` du SDK). Canaux : `snmp:instances:*`, `snmp:agent:*` et `snmp:manager:*` (identifiant de l'instance en
 * premier argument).
 */
export const snmpMainModule = {
  manifest: SNMP_MODULE,

  migrateConfig,

  activate(ctx) {
    instances = defineInstances(ctx, {
      agent: {
        label: () => t('snmp.tabs.agent'),
        create: (_instance, { emit }) =>
          new SnmpAgent({
            onStatus: (status) => emit('status', status),
            onLog: (batch) => emit('log', batch),
            onValues: (values) => emit('values', values)
          }),
        busy: (agent) => agent.running,
        dispose: (agent) => agent.stop()
      },
      manager: {
        label: () => t('snmp.tabs.manager'),
        create: (_instance, { emit }) =>
          new SnmpManager({
            onStatus: (status) => emit('status', status),
            onPoll: (values) => emit('poll', values),
            onTraps: (batch) => emit('traps', batch)
          }),
        busy: (manager) => !!(manager.pollTimer || manager.receiver),
        dispose: (manager) => manager.close()
      }
    })

    ctx.expose(createPointsApi({ instances, savedConfig: ctx.config }))
    instances.handle('agent', 'start', (agent, config) => agent.start(config))
    instances.handle('agent', 'stop', (agent) => agent.stop())
    instances.handle('agent', 'values', (agent) => agent.values())
    instances.handle('agent', 'setValue', (agent, id, value) => agent.setValue(id, value))
    instances.handle('agent', 'upsertObject', (agent, def) => agent.upsertObject(def))
    instances.handle('agent', 'deleteObject', (agent, id) => agent.deleteObject(id))
    instances.handle('agent', 'setUpdateRate', (agent, rate) => agent.setUpdateRate(rate))
    instances.handle('agent', 'setTraps', (agent, traps) => agent.setTraps(traps))
    instances.handle('agent', 'sendTrap', (agent) => agent.sendTrap())
    instances.handle('agent', 'logs', (agent) => agent.logs())
    instances.handle('agent', 'clearLogs', (agent) => agent.clearLogs())
    instances.handle('manager', 'request', (manager, config, request) => manager.request(config, request))
    instances.handle('manager', 'startPolling', (manager, config) => manager.startPolling(config))
    instances.handle('manager', 'stopPolling', (manager) => manager.stopPolling())
    instances.handle('manager', 'values', (manager) => Object.fromEntries(manager.last))
    instances.handle('manager', 'startReceiver', (manager, config) => manager.startReceiver(config))
    instances.handle('manager', 'stopReceiver', (manager) => manager.stopReceiver())
    instances.handle('manager', 'traps', (manager) => manager.traps)
    instances.handle('manager', 'clearTraps', (manager) => manager.clearTraps())
  },

  /** Au moins un agent démarré, une surveillance ou un récepteur de notifications en cours. */
  busy() {
    return !!instances?.busy()
  },

  async deactivate() {
    await instances?.dispose()
    instances = null
  }
}
