import { join } from 'path'
import { shell } from 'electron'
import { MODBUS_MODULE } from '../shared/constants'
import '../shared/locales'
import { ModbusPki } from './pki'
import { ModbusServer } from './server'
import { ModbusClient } from './client'
import { t } from '../shared/i18n'

let server = null
let client = null

/** Partie "main" du module Modbus. Canaux : `modbus:server:*`, `modbus:client:*`, `modbus:certs:*`. */
export const modbusMainModule = {
  manifest: MODBUS_MODULE,

  activate(ctx) {
    const pki = {
      server: new ModbusPki(join(ctx.dataDir, 'pki', 'server')),
      client: new ModbusPki(join(ctx.dataDir, 'pki', 'client'))
    }
    const store = (which) => {
      if (!pki[which]) throw new Error(t('errors.unknownStore', { name: which }))
      return pki[which]
    }

    server = new ModbusServer(pki.server, {
      onStatus: (status) => ctx.emit('server:status', status),
      onValues: (values) => ctx.emit('server:values', values),
      onLog: (entry) => ctx.emit('server:log', entry)
    })
    client = new ModbusClient(pki.client, {
      onStatus: (status) => ctx.emit('client:status', status),
      onData: (data) => ctx.emit('client:data', data)
    })

    ctx.handle('server:status', () => server.status())
    ctx.handle('server:start', (config) => server.start(config))
    ctx.handle('server:stop', () => server.stop())
    ctx.handle('server:values', () => server.values())
    ctx.handle('server:logs', () => server.logs())
    ctx.handle('server:clearLogs', () => server.clearLogs())
    ctx.handle('server:upsertPoint', (def) => server.upsertPoint(def))
    ctx.handle('server:removePoint', (id) => server.removePoint(id))
    ctx.handle('server:setValue', (id, value) => server.setValue(id, value))
    ctx.handle('server:setUpdateRate', (rate) => server.setUpdateRate(rate))

    ctx.handle('client:status', () => client.status())
    ctx.handle('client:connect', (config) => client.connect(config))
    ctx.handle('client:disconnect', () => client.disconnect())
    ctx.handle('client:read', (table, address, quantity) => client.read(table, address, quantity))
    ctx.handle('client:write', (table, address, values) => client.write(table, address, values))
    ctx.handle('client:writeValue', (table, address, value, dataType, wordOrder) =>
      client.writeValue(table, address, value, dataType, wordOrder)
    )
    ctx.handle('client:addWatch', (item) => client.addWatch(item))
    ctx.handle('client:removeWatch', (id) => client.removeWatch(id))
    ctx.handle('client:setPollInterval', (ms) => client.setPollInterval(ms))

    ctx.handle('certs:list', (which) => store(which).list())
    ctx.handle('certs:trust', (which, thumbprint) => store(which).trust(thumbprint))
    ctx.handle('certs:reject', (which, thumbprint) => store(which).reject(thumbprint))
    ctx.handle('certs:remove', (which, thumbprint) => store(which).remove(thumbprint))
    ctx.handle('certs:openFolder', async (which) => {
      const error = await shell.openPath(store(which).rootFolder)
      if (error) throw new Error(error)
    })
  },

  /** Serveur démarré ou client connecté. */
  busy() {
    return !!(server?.status().running || client?.status().connected)
  },

  async deactivate() {
    await client?.disconnect().catch(() => {})
    await server?.stop().catch(() => {})
  }
}
