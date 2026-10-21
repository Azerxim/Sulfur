/** Accès IPC au module LDAP / RADIUS du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`ldap:${action}`, ...args)
const on = (event, listener) => window.sulfur.on(`ldap:${event}`, listener)

export const ldapApi = {
  server: {
    status: () => invoke('server:status'),
    start: (config) => invoke('server:start', config),
    stop: () => invoke('server:stop'),
    update: (config) => invoke('server:update', config),
    logs: () => invoke('server:logs'),
    clearLogs: () => invoke('server:clearLogs'),
    onStatus: (fn) => on('server:status', fn),
    onLog: (fn) => on('server:log', fn)
  },
  client: {
    authenticate: (config) => invoke('client:authenticate', config),
    search: (config) => invoke('client:search', config),
    history: () => invoke('client:history'),
    clear: () => invoke('client:clear')
  }
}

export const radiusApi = {
  server: {
    status: () => invoke('radius:server:status'),
    start: (config) => invoke('radius:server:start', config),
    stop: () => invoke('radius:server:stop'),
    update: (config) => invoke('radius:server:update', config),
    logs: () => invoke('radius:server:logs'),
    clearLogs: () => invoke('radius:server:clearLogs'),
    onStatus: (fn) => on('radius:server:status', fn),
    onLog: (fn) => on('radius:server:log', fn)
  },
  client: {
    status: () => invoke('radius:client:status'),
    authenticate: (config) => invoke('radius:client:authenticate', config),
    statusServer: (config) => invoke('radius:client:statusServer', config),
    accounting: (config, action) => invoke('radius:client:accounting', config, action),
    history: () => invoke('radius:client:history'),
    clear: () => invoke('radius:client:clear')
  }
}
