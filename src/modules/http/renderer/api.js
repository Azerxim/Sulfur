/** Accès IPC au module HTTP / REST du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`http:${action}`, ...args)
const on = (event, listener) => window.sulfur.on(`http:${event}`, listener)

export const httpApi = {
  server: (instanceId) => ({
    status: () => invoke('server:status', instanceId),
    start: (config) => invoke('server:start', instanceId, config),
    stop: () => invoke('server:stop', instanceId),
    values: () => invoke('server:values', instanceId),
    logs: () => invoke('server:logs', instanceId),
    clearLogs: () => invoke('server:clearLogs', instanceId),
    upsertVariable: (def) => invoke('server:upsertVariable', instanceId, def),
    removeVariable: (id) => invoke('server:removeVariable', instanceId, id),
    setValue: (id, value) => invoke('server:setValue', instanceId, id, value),
    setRoutes: (routes) => invoke('server:setRoutes', instanceId, routes),
    setWebhooks: (webhooks) => invoke('server:setWebhooks', instanceId, webhooks),
    setUpdateRate: (rate) => invoke('server:setUpdateRate', instanceId, rate),
    hashPassword: (password) => invoke('server:hashPassword', instanceId, password),
    onStatus: (fn) => on(`server:${instanceId}:status`, fn),
    onValues: (fn) => on(`server:${instanceId}:values`, fn),
    onLog: (fn) => on(`server:${instanceId}:log`, fn)
  }),
  client: (instanceId) => ({
    status: () => invoke('client:status', instanceId),
    configure: (config) => invoke('client:configure', instanceId, config),
    send: (request) => invoke('client:send', instanceId, request),
    addWatch: (item) => invoke('client:addWatch', instanceId, item),
    removeWatch: (id) => invoke('client:removeWatch', instanceId, id),
    setPollInterval: (ms) => invoke('client:setPollInterval', instanceId, ms),
    onStatus: (fn) => on(`client:${instanceId}:status`, fn),
    onData: (fn) => on(`client:${instanceId}:data`, fn)
  })
}
