/** Accès IPC au module DHCP du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`dhcp:${action}`, ...args)
const on = (event, listener) => window.sulfur.on(`dhcp:${event}`, listener)

export const dhcpApi = {
  interfaces: () => invoke('interfaces'),
  server: {
    status: () => invoke('server:status'),
    check: (config) => invoke('server:check', config),
    start: (config, confirmed) => invoke('server:start', config, confirmed),
    stop: () => invoke('server:stop'),
    logs: () => invoke('server:logs'),
    clearLogs: () => invoke('server:clearLogs'),
    openLogFile: () => invoke('server:openLogFile'),
    onStatus: (fn) => on('server:status', fn),
    onLog: (fn) => on('server:log', fn)
  },
  client: {
    status: () => invoke('client:status'),
    history: () => invoke('client:history'),
    clear: () => invoke('client:clear'),
    run: (config, mode) => invoke('client:run', config, mode),
    release: (config) => invoke('client:release', config),
    abort: () => invoke('client:abort'),
    onStatus: (fn) => on('client:status', fn)
  }
}
