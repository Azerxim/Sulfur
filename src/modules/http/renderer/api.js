/** Accès IPC au module HTTP / REST du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`http:${action}`, ...args)
const on = (event, listener) => window.sulfur.on(`http:${event}`, listener)

export const httpApi = {
  server: {
    status: () => invoke('server:status'),
    start: (config) => invoke('server:start', config),
    stop: () => invoke('server:stop'),
    values: () => invoke('server:values'),
    logs: () => invoke('server:logs'),
    clearLogs: () => invoke('server:clearLogs'),
    upsertVariable: (def) => invoke('server:upsertVariable', def),
    removeVariable: (id) => invoke('server:removeVariable', id),
    setValue: (id, value) => invoke('server:setValue', id, value),
    setRoutes: (routes) => invoke('server:setRoutes', routes),
    setWebhooks: (webhooks) => invoke('server:setWebhooks', webhooks),
    setUpdateRate: (rate) => invoke('server:setUpdateRate', rate),
    hashPassword: (password) => invoke('server:hashPassword', password),
    onStatus: (fn) => on('server:status', fn),
    onValues: (fn) => on('server:values', fn),
    onLog: (fn) => on('server:log', fn)
  },
  client: {
    status: () => invoke('client:status'),
    configure: (config) => invoke('client:configure', config),
    send: (request) => invoke('client:send', request),
    addWatch: (item) => invoke('client:addWatch', item),
    removeWatch: (id) => invoke('client:removeWatch', id),
    setPollInterval: (ms) => invoke('client:setPollInterval', ms),
    onStatus: (fn) => on('client:status', fn),
    onData: (fn) => on('client:data', fn)
  }
}
