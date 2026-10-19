import { SNMP_MODULE } from '../shared/constants'
import '../shared/locales'
import { SnmpAgent } from './agent'
import { SnmpManager } from './manager'
import { createPointsApi } from './points'

let agent = null
let manager = null

/** Partie "main" du module SNMP. Canaux : `snmp:agent:*`, `snmp:manager:*`. */
export const snmpMainModule = {
  manifest: SNMP_MODULE,

  activate(ctx) {
    agent = new SnmpAgent({
      onStatus: (status) => ctx.emit('agent:status', status),
      onLog: (batch) => ctx.emit('agent:log', batch),
      onValues: (values) => ctx.emit('agent:values', values)
    })
    manager = new SnmpManager({
      onStatus: (status) => ctx.emit('manager:status', status),
      onPoll: (values) => ctx.emit('manager:poll', values),
      onTraps: (batch) => ctx.emit('manager:traps', batch)
    })

    ctx.expose(createPointsApi({ agent, manager, savedConfig: ctx.config }))

    ctx.handle('agent:status', () => agent.status())
    ctx.handle('agent:start', (config) => agent.start(config))
    ctx.handle('agent:stop', () => agent.stop())
    ctx.handle('agent:values', () => agent.values())
    ctx.handle('agent:setValue', (id, value) => agent.setValue(id, value))
    ctx.handle('agent:upsertObject', (def) => agent.upsertObject(def))
    ctx.handle('agent:deleteObject', (id) => agent.deleteObject(id))
    ctx.handle('agent:setUpdateRate', (rate) => agent.setUpdateRate(rate))
    ctx.handle('agent:setTraps', (traps) => agent.setTraps(traps))
    ctx.handle('agent:sendTrap', () => agent.sendTrap())
    ctx.handle('agent:logs', () => agent.logs())
    ctx.handle('agent:clearLogs', () => agent.clearLogs())

    ctx.handle('manager:status', () => manager.status())
    ctx.handle('manager:request', (config, request) => manager.request(config, request))
    ctx.handle('manager:startPolling', (config) => manager.startPolling(config))
    ctx.handle('manager:stopPolling', () => manager.stopPolling())
    ctx.handle('manager:values', () => Object.fromEntries(manager.last))
    ctx.handle('manager:startReceiver', (config) => manager.startReceiver(config))
    ctx.handle('manager:stopReceiver', () => manager.stopReceiver())
    ctx.handle('manager:traps', () => manager.traps)
    ctx.handle('manager:clearTraps', () => manager.clearTraps())
  },

  /** Agent démarré, surveillance ou récepteur de notifications en cours. */
  busy() {
    return !!(agent?.running || manager?.pollTimer || manager?.receiver)
  },

  async deactivate() {
    await manager?.close().catch(() => {})
    await agent?.stop().catch(() => {})
  }
}
