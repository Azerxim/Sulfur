/** Accès IPC au module LDAP / RADIUS du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`ldap:${action}`, ...args)
const on = (event, listener) => window.sulfur.on(`ldap:${event}`, listener)

export const ldapApi = {
  server: (instanceId) => ({
    status: () => invoke('server:status', instanceId),
    start: (config) => invoke('server:start', instanceId, config),
    stop: () => invoke('server:stop', instanceId),
    update: (config) => invoke('server:update', instanceId, config),
    logs: () => invoke('server:logs', instanceId),
    clearLogs: () => invoke('server:clearLogs', instanceId),
    onStatus: (fn) => on(`server:${instanceId}:status`, fn),
    onLog: (fn) => on(`server:${instanceId}:log`, fn)
  }),
  client: (instanceId) => ({
    authenticate: (config) => invoke('client:authenticate', instanceId, config),
    search: (config) => invoke('client:search', instanceId, config),
    history: () => invoke('client:history', instanceId),
    clear: () => invoke('client:clear', instanceId)
  })
}

export const radiusApi = {
  server: (instanceId) => ({
    status: () => invoke('radiusServer:status', instanceId),
    start: (config) => invoke('radiusServer:start', instanceId, config),
    stop: () => invoke('radiusServer:stop', instanceId),
    update: (config) => invoke('radiusServer:update', instanceId, config),
    logs: () => invoke('radiusServer:logs', instanceId),
    clearLogs: () => invoke('radiusServer:clearLogs', instanceId),
    onStatus: (fn) => on(`radiusServer:${instanceId}:status`, fn),
    onLog: (fn) => on(`radiusServer:${instanceId}:log`, fn)
  }),
  client: (instanceId) => ({
    status: () => invoke('radiusClient:status', instanceId),
    authenticate: (config) => invoke('radiusClient:authenticate', instanceId, config),
    statusServer: (config) => invoke('radiusClient:statusServer', instanceId, config),
    accounting: (config, action) => invoke('radiusClient:accounting', instanceId, config, action),
    history: () => invoke('radiusClient:history', instanceId),
    clear: () => invoke('radiusClient:clear', instanceId)
  })
}
