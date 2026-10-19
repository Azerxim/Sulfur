/** Accès IPC au module Syslog du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`syslog:${action}`, ...args)
const on = (event, listener) => window.sulfur.on(`syslog:${event}`, listener)

export const syslogApi = {
  server: {
    status: () => invoke('server:status'),
    start: (config) => invoke('server:start', config),
    stop: () => invoke('server:stop'),
    messages: () => invoke('server:messages'),
    clear: () => invoke('server:clear'),
    onStatus: (fn) => on('server:status', fn),
    onMessages: (fn) => on('server:messages', fn)
  },
  client: {
    status: () => invoke('client:status'),
    send: (config) => invoke('client:send', config),
    startRepeat: (config) => invoke('client:startRepeat', config),
    stopRepeat: () => invoke('client:stopRepeat'),
    disconnect: () => invoke('client:disconnect'),
    history: () => invoke('client:history'),
    clearHistory: () => invoke('client:clearHistory'),
    onStatus: (fn) => on('client:status', fn),
    onSent: (fn) => on('client:sent', fn)
  }
}
