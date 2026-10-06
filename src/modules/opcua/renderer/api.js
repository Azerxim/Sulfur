/** Accès IPC au module OPC UA du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`opcua:${action}`, ...args)
const on = (event, listener) => window.sulfur.on(`opcua:${event}`, listener)

export const opcuaApi = {
  server: {
    status: () => invoke('server:status'),
    start: (config) => invoke('server:start', config),
    stop: () => invoke('server:stop'),
    onStatus: (fn) => on('server:status', fn)
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
