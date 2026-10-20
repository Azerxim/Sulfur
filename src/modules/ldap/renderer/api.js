/** Accès IPC au module LDAP du process principal. */
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
