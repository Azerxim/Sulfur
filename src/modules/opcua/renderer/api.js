/** Accès IPC au module OPC UA du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`opcua:${action}`, ...args)
const on = (event, listener) => window.sulfur.on(`opcua:${event}`, listener)

export const opcuaApi = {
  server: {
    status: () => invoke('server:status'),
    start: (config) => invoke('server:start', config),
    stop: () => invoke('server:stop'),
    values: () => invoke('server:values'),
    upsertVariable: (def) => invoke('server:upsertVariable', def),
    removeVariable: (id) => invoke('server:removeVariable', id),
    setValue: (id, value) => invoke('server:setValue', id, value),
    setUpdateRate: (rate) => invoke('server:setUpdateRate', rate),
    onStatus: (fn) => on('server:status', fn),
    onValues: (fn) => on('server:values', fn)
  },
  client: {
    status: () => invoke('client:status'),
    connect: (url) => invoke('client:connect', url),
    disconnect: () => invoke('client:disconnect'),
    browse: (nodeId) => invoke('client:browse', nodeId),
    read: (nodeId) => invoke('client:read', nodeId),
    write: (nodeId, value) => invoke('client:write', nodeId, value),
    subscribe: (nodeId) => invoke('client:subscribe', nodeId),
    unsubscribe: (nodeId) => invoke('client:unsubscribe', nodeId),
    onStatus: (fn) => on('client:status', fn),
    onData: (fn) => on('client:data', fn)
  }
}
