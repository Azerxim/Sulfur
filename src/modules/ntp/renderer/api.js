/** Accès IPC au module NTP du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`ntp:${action}`, ...args)
const on = (event, listener) => window.sulfur.on(`ntp:${event}`, listener)

export const ntpApi = {
  server: (instanceId) => ({
    status: () => invoke('server:status', instanceId),
    start: (config) => invoke('server:start', instanceId, config),
    stop: () => invoke('server:stop', instanceId),
    logs: () => invoke('server:logs', instanceId),
    clearLogs: () => invoke('server:clearLogs', instanceId),
    setClock: (clock) => invoke('server:setClock', instanceId, clock),
    shift: (seconds) => invoke('server:shift', instanceId, seconds),
    setDrift: (ppm) => invoke('server:setDrift', instanceId, ppm),
    setSettings: (settings) => invoke('server:setSettings', instanceId, settings),
    onStatus: (fn) => on(`server:${instanceId}:status`, fn),
    onLog: (fn) => on(`server:${instanceId}:log`, fn)
  }),
  client: (instanceId) => ({
    status: () => invoke('client:status', instanceId),
    query: (options) => invoke('client:query', instanceId, options),
    startPolling: (options) => invoke('client:startPolling', instanceId, options),
    stopPolling: () => invoke('client:stopPolling', instanceId),
    history: () => invoke('client:history', instanceId),
    clearHistory: () => invoke('client:clearHistory', instanceId),
    onStatus: (fn) => on(`client:${instanceId}:status`, fn),
    onResult: (fn) => on(`client:${instanceId}:result`, fn)
  })
}
