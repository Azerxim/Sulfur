/** Accès IPC au module MQTT du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`mqtt:${action}`, ...args)
const on = (event, listener) => window.sulfur.on(`mqtt:${event}`, listener)

export const mqttApi = {
  server: (instanceId) => ({
    status: () => invoke('server:status', instanceId),
    start: (config) => invoke('server:start', instanceId, config),
    stop: () => invoke('server:stop', instanceId),
    values: () => invoke('server:values', instanceId),
    setValue: (id, value) => invoke('server:setValue', instanceId, id, value),
    upsertTopic: (def) => invoke('server:upsertTopic', instanceId, def),
    removeTopic: (id) => invoke('server:removeTopic', instanceId, id),
    setUpdateRate: (rate) => invoke('server:setUpdateRate', instanceId, rate),
    logs: () => invoke('server:logs', instanceId),
    clearLogs: () => invoke('server:clearLogs', instanceId),
    topics: () => invoke('server:topics', instanceId),
    hashPassword: (password) => invoke('server:hashPassword', instanceId, password),
    onStatus: (fn) => on(`server:${instanceId}:status`, fn),
    onLog: (fn) => on(`server:${instanceId}:log`, fn),
    onValues: (fn) => on(`server:${instanceId}:values`, fn)
  }),
  client: (instanceId) => ({
    status: () => invoke('client:status', instanceId),
    connect: (config) => invoke('client:connect', instanceId, config),
    disconnect: () => invoke('client:disconnect', instanceId),
    setSubscriptions: (list) => invoke('client:setSubscriptions', instanceId, list),
    publish: (message) => invoke('client:publish', instanceId, message),
    messages: () => invoke('client:messages', instanceId),
    clearMessages: () => invoke('client:clearMessages', instanceId),
    onStatus: (fn) => on(`client:${instanceId}:status`, fn),
    onMessages: (fn) => on(`client:${instanceId}:messages`, fn)
  })
}
