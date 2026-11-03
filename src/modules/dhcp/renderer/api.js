/** Accès IPC au module DHCP du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`dhcp:${action}`, ...args)
const on = (event, listener) => window.sulfur.on(`dhcp:${event}`, listener)

export const dhcpApi = {
  interfaces: () => invoke('interfaces'),
  server: (instanceId) => ({
    status: () => invoke('server:status', instanceId),
    check: (config) => invoke('server:check', instanceId, config),
    start: (config, confirmed) => invoke('server:start', instanceId, config, confirmed),
    stop: () => invoke('server:stop', instanceId),
    logs: () => invoke('server:logs', instanceId),
    clearLogs: () => invoke('server:clearLogs', instanceId),
    openLogFile: () => invoke('server:openLogFile', instanceId),
    onStatus: (fn) => on(`server:${instanceId}:status`, fn),
    onLog: (fn) => on(`server:${instanceId}:log`, fn)
  }),
  client: (instanceId) => ({
    status: () => invoke('client:status', instanceId),
    history: () => invoke('client:history', instanceId),
    clear: () => invoke('client:clear', instanceId),
    run: (config, mode) => invoke('client:run', instanceId, config, mode),
    release: (config) => invoke('client:release', instanceId, config),
    abort: () => invoke('client:abort', instanceId),
    onStatus: (fn) => on(`client:${instanceId}:status`, fn)
  })
}
