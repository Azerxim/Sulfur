import { S7_MODULE } from '../shared/constants'
import '../shared/locales'
import { S7Server } from './server'
import { S7Client } from './client'
import { createPointsApi } from './points'

let server = null
let client = null

/** Partie "main" du module Siemens S7. Canaux : `s7:server:*`, `s7:client:*`. */
export const s7MainModule = {
  manifest: S7_MODULE,

  activate(ctx) {
    server = new S7Server({
      onStatus: (status) => ctx.emit('server:status', status),
      onValues: (values) => ctx.emit('server:values', values),
      onLog: (entry) => ctx.emit('server:log', entry)
    })
    client = new S7Client({
      onStatus: (status) => ctx.emit('client:status', status),
      onData: (data) => ctx.emit('client:data', data),
      onWatches: (watches) => ctx.setConfig('watches', watches)
    })
    client.restoreWatches(ctx.config().watches)

    ctx.expose(createPointsApi({ server, client, savedConfig: ctx.config }))

    ctx.handle('server:status', () => server.status())
    ctx.handle('server:start', (config) => server.start(config))
    ctx.handle('server:stop', () => server.stop())
    ctx.handle('server:values', () => server.values())
    ctx.handle('server:logs', () => server.logs())
    ctx.handle('server:clearLogs', () => server.clearLogs())
    ctx.handle('server:upsertPoint', (def) => server.upsertPoint(def))
    ctx.handle('server:removePoint', (id) => server.removePoint(id))
    ctx.handle('server:setValue', (id, value) => server.setValue(id, value))
    ctx.handle('server:setCpuState', (state) => server.setCpuState(state))
    ctx.handle('server:setUpdateRate', (rate) => server.setUpdateRate(rate))
    ctx.handle('server:setReadOnly', (readOnly) => server.setReadOnly(readOnly))
    ctx.handle('server:memory', (area, db, start, count) => server.readMemory(area, db, start, count))
    ctx.handle('server:writeMemory', (area, db, offset, value) => server.writeMemory(area, db, offset, value))

    ctx.handle('client:status', () => client.status())
    ctx.handle('client:connect', (config) => client.connect(config))
    ctx.handle('client:disconnect', () => client.disconnect())
    ctx.handle('client:readValue', (address, dataType, length) => client.readValue(address, dataType, length))
    ctx.handle('client:writeValue', (address, dataType, value, length) =>
      client.writeValue(address, dataType, value, length)
    )
    ctx.handle('client:readArea', (area, db, start, count) => client.readArea(area, db, start, count))
    ctx.handle('client:writeArea', (area, db, start, bytes) => client.writeArea(area, db, start, bytes))
    ctx.handle('client:identify', async () => {
      const identity = await client.readIdentity()
      await client.readCpuState().catch(() => null)
      return identity
    })
    ctx.handle('client:cpuState', () => client.readCpuState())
    ctx.handle('client:stopCpu', () => client.stopCpu())
    ctx.handle('client:startCpu', (mode) => client.startCpu(mode))
    ctx.handle('client:addWatch', (item) => client.addWatch(item))
    ctx.handle('client:removeWatch', (id) => client.removeWatch(id))
    ctx.handle('client:setPollInterval', (ms) => client.setPollInterval(ms))
  },

  /** Automate simulé démarré ou client connecté. */
  busy() {
    return !!(server?.status().running || client?.status().connected)
  },

  async deactivate() {
    await client?.disconnect().catch(() => {})
    await server?.stop().catch(() => {})
  }
}
