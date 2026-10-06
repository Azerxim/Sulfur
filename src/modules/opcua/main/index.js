import { OPCUA_MODULE } from '../shared/constants'
import { SimulationServer } from './server'
import { SimulationClient } from './client'

let server = null
let client = null

/** Partie "main" du module OPC UA. Canaux exposés : `opcua:server:*` et `opcua:client:*`. */
export const opcuaMainModule = {
  manifest: OPCUA_MODULE,

  activate(ctx) {
    server = new SimulationServer(
      (status) => ctx.emit('server:status', status),
      (values) => ctx.emit('server:values', values)
    )
    client = new SimulationClient(
      (status) => ctx.emit('client:status', status),
      (change) => ctx.emit('client:data', change)
    )

    ctx.handle('server:status', () => server.status())
    ctx.handle('server:start', (config) => server.start(config))
    ctx.handle('server:stop', () => server.stop())
    ctx.handle('server:values', () => server.values())
    ctx.handle('server:upsertVariable', (def) => server.upsertVariable(def))
    ctx.handle('server:removeVariable', (id) => server.removeVariable(id))
    ctx.handle('server:setValue', (id, value) => server.setValue(id, value))
    ctx.handle('server:setUpdateRate', (rate) => server.setUpdateRate(rate))

    ctx.handle('client:status', () => client.status())
    ctx.handle('client:connect', (url) => client.connect(url))
    ctx.handle('client:disconnect', () => client.disconnect())
    ctx.handle('client:browse', (nodeId) => client.browse(nodeId))
    ctx.handle('client:read', (nodeId) => client.read(nodeId))
    ctx.handle('client:write', (nodeId, value) => client.write(nodeId, value))
    ctx.handle('client:subscribe', (nodeId) => client.subscribe(nodeId))
    ctx.handle('client:unsubscribe', (nodeId) => client.unsubscribe(nodeId))
  },

  async deactivate() {
    await client?.disconnect().catch(() => {})
    await server?.stop().catch(() => {})
  }
}
