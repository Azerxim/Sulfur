/** Accès IPC au module NTP du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`ntp:${action}`, ...args)
const on = (event, listener) => window.sulfur.on(`ntp:${event}`, listener)

export const ntpApi = {
  server: {
    status: () => invoke('server:status'),
    start: (config) => invoke('server:start', config),
    stop: () => invoke('server:stop'),
    logs: () => invoke('server:logs'),
    clearLogs: () => invoke('server:clearLogs'),
    setClock: (clock) => invoke('server:setClock', clock),
    shift: (seconds) => invoke('server:shift', seconds),
    setDrift: (ppm) => invoke('server:setDrift', ppm),
    setSettings: (settings) => invoke('server:setSettings', settings),
    onStatus: (fn) => on('server:status', fn),
    onLog: (fn) => on('server:log', fn)
  },
  client: {
    status: () => invoke('client:status'),
    query: (options) => invoke('client:query', options),
    startPolling: (options) => invoke('client:startPolling', options),
    stopPolling: () => invoke('client:stopPolling'),
    history: () => invoke('client:history'),
    clearHistory: () => invoke('client:clearHistory'),
    onStatus: (fn) => on('client:status', fn),
    onResult: (fn) => on('client:result', fn)
  }
}
