/** Accès IPC au module MQTT du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`mqtt:${action}`, ...args)
const on = (event, listener) => window.sulfur.on(`mqtt:${event}`, listener)

export const mqttApi = {
  server: {
    status: () => invoke('server:status'),
    start: (config) => invoke('server:start', config),
    stop: () => invoke('server:stop'),
    values: () => invoke('server:values'),
    setValue: (id, value) => invoke('server:setValue', id, value),
    upsertTopic: (def) => invoke('server:upsertTopic', def),
    removeTopic: (id) => invoke('server:removeTopic', id),
    setUpdateRate: (rate) => invoke('server:setUpdateRate', rate),
    logs: () => invoke('server:logs'),
    clearLogs: () => invoke('server:clearLogs'),
    topics: () => invoke('server:topics'),
    hashPassword: (password) => invoke('server:hashPassword', password),
    onStatus: (fn) => on('server:status', fn),
    onLog: (fn) => on('server:log', fn),
    onValues: (fn) => on('server:values', fn)
  },
  client: {
    status: () => invoke('client:status'),
    connect: (config) => invoke('client:connect', config),
    disconnect: () => invoke('client:disconnect'),
    setSubscriptions: (list) => invoke('client:setSubscriptions', list),
    publish: (message) => invoke('client:publish', message),
    messages: () => invoke('client:messages'),
    clearMessages: () => invoke('client:clearMessages'),
    onStatus: (fn) => on('client:status', fn),
    onMessages: (fn) => on('client:messages', fn)
  }
}
