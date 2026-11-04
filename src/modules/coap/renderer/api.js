/** Accès IPC au module CoAP / LwM2M du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`coap:${action}`, ...args)
const on = (event, listener) => window.sulfur.on(`coap:${event}`, listener)

export const coapApi = {
  server: (instanceId) => ({
    status: () => invoke('server:status', instanceId),
    start: (config) => invoke('server:start', instanceId, config),
    stop: () => invoke('server:stop', instanceId),
    update: (config) => invoke('server:update', instanceId, config),
    values: () => invoke('server:values', instanceId),
    setValue: (id, value) => invoke('server:setValue', instanceId, id, value),
    log: () => invoke('server:log', instanceId),
    clearLog: () => invoke('server:clearLog', instanceId),
    onStatus: (fn) => on(`server:${instanceId}:status`, fn),
    onValues: (fn) => on(`server:${instanceId}:values`, fn),
    onLog: (fn) => on(`server:${instanceId}:log`, fn)
  }),
  client: (instanceId) => ({
    status: () => invoke('client:status', instanceId),
    request: (config) => invoke('client:request', instanceId, config),
    discover: (config) => invoke('client:discover', instanceId, config),
    observe: (config) => invoke('client:observe', instanceId, config),
    cancel: (token) => invoke('client:cancel', instanceId, token),
    history: () => invoke('client:history', instanceId),
    clear: () => invoke('client:clear', instanceId),
    onStatus: (fn) => on(`client:${instanceId}:status`, fn),
    onEntry: (fn) => on(`client:${instanceId}:entry`, fn)
  }),
  lwm2mServer: (instanceId) => ({
    status: () => invoke('lwm2mServer:status', instanceId),
    start: (config) => invoke('lwm2mServer:start', instanceId, config),
    stop: () => invoke('lwm2mServer:stop', instanceId),
    read: (id, path, format) => invoke('lwm2mServer:read', instanceId, id, path, format),
    write: (id, path, value) => invoke('lwm2mServer:write', instanceId, id, path, value),
    execute: (id, path, args) => invoke('lwm2mServer:execute', instanceId, id, path, args),
    discover: (id, path) => invoke('lwm2mServer:discover', instanceId, id, path),
    observe: (id, path, format) => invoke('lwm2mServer:observe', instanceId, id, path, format),
    cancel: (token) => invoke('lwm2mServer:cancel', instanceId, token),
    log: () => invoke('lwm2mServer:log', instanceId),
    clearLog: () => invoke('lwm2mServer:clearLog', instanceId),
    onStatus: (fn) => on(`lwm2mServer:${instanceId}:status`, fn),
    onLog: (fn) => on(`lwm2mServer:${instanceId}:log`, fn)
  }),
  device: (instanceId) => ({
    status: () => invoke('device:status', instanceId),
    start: (config) => invoke('device:start', instanceId, config),
    stop: () => invoke('device:stop', instanceId),
    update: () => invoke('device:update', instanceId),
    setValue: (path, value) => invoke('device:setValue', instanceId, path, value),
    log: () => invoke('device:log', instanceId),
    clearLog: () => invoke('device:clearLog', instanceId),
    onStatus: (fn) => on(`device:${instanceId}:status`, fn),
    onLog: (fn) => on(`device:${instanceId}:log`, fn)
  })
}
