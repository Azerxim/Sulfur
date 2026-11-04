import { join } from 'path'
import { defineInstances } from '@azerxim/sulfur-sdk/main'
import { shell } from 'electron'
import { MODBUS_MODULE } from '../shared/constants'
import '../shared/locales'
import { ModbusPki } from './pki'
import { ModbusServer } from './server'
import { ModbusClient } from './client'
import { createPointsApi } from './points'
import { listSerialPorts } from './serial'
import { migrateModbusConfig } from '../shared/units'
import { t } from '../shared/i18n'

let instances = null

/**
 * Partie "main" du module Modbus : serveurs et clients en nombre libre (aucun par défaut, voir
 * `defineInstances` du SDK). Canaux : `modbus:instances:*`, `modbus:server:*` et `modbus:client:*`
 * (identifiant de l'instance en premier argument), `modbus:certs:*`, `modbus:serial:list`.
 */
export const modbusMainModule = {
  manifest: MODBUS_MODULE,

  migrateConfig: migrateModbusConfig,

  activate(ctx) {
    const pki = {
      server: new ModbusPki(join(ctx.dataDir, 'pki', 'server')),
      client: new ModbusPki(join(ctx.dataDir, 'pki', 'client'))
    }
    const store = (which) => {
      if (!pki[which]) throw new Error(t('errors.unknownStore', { name: which }))
      return pki[which]
    }

    instances = defineInstances(ctx, {
      server: {
        label: () => t('ui.server'),
        create: (_instance, { emit }) =>
          new ModbusServer(pki.server, {
            onStatus: (status) => emit('status', status),
            onValues: (values) => emit('values', values),
            onLog: (entry) => emit('log', entry)
          }),
        busy: (server) => server.status().running,
        dispose: (server) => server.stop()
      },
      client: {
        label: () => t('ui.client'),
        create: (_instance, { emit }) =>
          new ModbusClient(pki.client, {
            onStatus: (status) => emit('status', status),
            onData: (data) => emit('data', data)
          }),
        busy: (client) => client.status().connected,
        dispose: (client) => client.disconnect()
      }
    })

    ctx.expose(createPointsApi({ instances, savedConfig: ctx.config }))

    const server = (action, fn) => instances.handle('server', action, fn)
    server('start', (s, config) => s.start(config))
    server('stop', (s) => s.stop())
    server('values', (s) => s.values())
    server('logs', (s) => s.logs())
    server('clearLogs', (s) => s.clearLogs())
    server('upsertPoint', (s, def, unitId) => s.upsertPoint(def, unitId))
    server('removePoint', (s, id) => s.removePoint(id))
    server('setValue', (s, id, value) => s.setValue(id, value))
    server('setUpdateRate', (s, rate) => s.setUpdateRate(rate))
    server('addUnit', (s, def) => s.addUnit(def))
    server('updateUnit', (s, def) => s.updateUnit(def))
    server('removeUnit', (s, id) => s.removeUnit(id))
    server('registers', (s, unitId, table, address, count) => s.registers(unitId, table, address, count))
    server('writeRegister', (s, unitId, table, address, value) => s.writeRegister(unitId, table, address, value))

    const client = (action, fn) => instances.handle('client', action, fn)
    client('connect', (c, config) => c.connect(config))
    client('disconnect', (c) => c.disconnect())
    client('read', (c, table, address, quantity) => c.read(table, address, quantity))
    client('write', (c, table, address, values) => c.write(table, address, values))
    client('readWrite', (c, readAddress, readQuantity, writeAddress, values) =>
      c.readWrite(readAddress, readQuantity, writeAddress, values)
    )
    client('identify', (c, code) => c.readDeviceIdentification(code))
    client('writeValue', (c, table, address, value, dataType, wordOrder) =>
      c.writeValue(table, address, value, dataType, wordOrder)
    )
    client('addWatch', (c, item) => c.addWatch(item))
    client('removeWatch', (c, id) => c.removeWatch(id))
    client('setPollInterval', (c, ms) => c.setPollInterval(ms))

    ctx.handle('serial:list', () => listSerialPorts())

    ctx.handle('certs:list', (which) => store(which).list())
    ctx.handle('certs:trust', (which, thumbprint) => store(which).trust(thumbprint))
    ctx.handle('certs:reject', (which, thumbprint) => store(which).reject(thumbprint))
    ctx.handle('certs:remove', (which, thumbprint) => store(which).remove(thumbprint))
    ctx.handle('certs:openFolder', async (which) => {
      const error = await shell.openPath(store(which).rootFolder)
      if (error) throw new Error(error)
    })
  },

  /** Au moins un serveur démarré ou un client connecté. */
  busy() {
    return !!instances?.busy()
  },

  async deactivate() {
    await instances?.dispose()
    instances = null
  }
}
