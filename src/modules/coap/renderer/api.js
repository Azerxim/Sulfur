/** Accès IPC au module CoAP / LwM2M du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`coap:${action}`, ...args)
const on = (event, listener) => window.sulfur.on(`coap:${event}`, listener)

export const coapApi = {
  server: {
    status: () => invoke('server:status'),
    start: (config) => invoke('server:start', config),
    stop: () => invoke('server:stop'),
    update: (config) => invoke('server:update', config),
    values: () => invoke('server:values'),
    setValue: (id, value) => invoke('server:setValue', id, value),
    log: () => invoke('server:log'),
    clearLog: () => invoke('server:clearLog'),
    onStatus: (fn) => on('server:status', fn),
    onValues: (fn) => on('server:values', fn),
    onLog: (fn) => on('server:log', fn)
  },
  client: {
    status: () => invoke('client:status'),
    request: (config) => invoke('client:request', config),
    discover: (config) => invoke('client:discover', config),
    observe: (config) => invoke('client:observe', config),
    cancel: (token) => invoke('client:cancel', token),
    history: () => invoke('client:history'),
    clear: () => invoke('client:clear'),
    onStatus: (fn) => on('client:status', fn),
    onEntry: (fn) => on('client:entry', fn)
  },
  lwm2mServer: {
    status: () => invoke('lwm2m:server:status'),
    start: (config) => invoke('lwm2m:server:start', config),
    stop: () => invoke('lwm2m:server:stop'),
    read: (id, path, format) => invoke('lwm2m:server:read', id, path, format),
    write: (id, path, value) => invoke('lwm2m:server:write', id, path, value),
    execute: (id, path, args) => invoke('lwm2m:server:execute', id, path, args),
    discover: (id, path) => invoke('lwm2m:server:discover', id, path),
    observe: (id, path, format) => invoke('lwm2m:server:observe', id, path, format),
    cancel: (token) => invoke('lwm2m:server:cancel', token),
    log: () => invoke('lwm2m:server:log'),
    clearLog: () => invoke('lwm2m:server:clearLog'),
    onStatus: (fn) => on('lwm2m:server:status', fn),
    onLog: (fn) => on('lwm2m:server:log', fn)
  },
  device: {
    status: () => invoke('lwm2m:client:status'),
    start: (config) => invoke('lwm2m:client:start', config),
    stop: () => invoke('lwm2m:client:stop'),
    update: () => invoke('lwm2m:client:update'),
    setValue: (path, value) => invoke('lwm2m:client:setValue', path, value),
    log: () => invoke('lwm2m:client:log'),
    clearLog: () => invoke('lwm2m:client:clearLog'),
    onStatus: (fn) => on('lwm2m:client:status', fn),
    onLog: (fn) => on('lwm2m:client:log', fn)
  }
}
