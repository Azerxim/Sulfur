/** Accès IPC au module Syslog du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`syslog:${action}`, ...args)
const on = (event, listener) => window.sulfur.on(`syslog:${event}`, listener)

export const syslogApi = {
  server: (instanceId) => ({
    status: () => invoke('server:status', instanceId),
    start: (config) => invoke('server:start', instanceId, config),
    stop: () => invoke('server:stop', instanceId),
    messages: () => invoke('server:messages', instanceId),
    clear: () => invoke('server:clear', instanceId),
    onStatus: (fn) => on(`server:${instanceId}:status`, fn),
    onMessages: (fn) => on(`server:${instanceId}:messages`, fn)
  }),
  client: (instanceId) => ({
    status: () => invoke('client:status', instanceId),
    send: (config) => invoke('client:send', instanceId, config),
    startRepeat: (config) => invoke('client:startRepeat', instanceId, config),
    stopRepeat: () => invoke('client:stopRepeat', instanceId),
    disconnect: () => invoke('client:disconnect', instanceId),
    history: () => invoke('client:history', instanceId),
    clearHistory: () => invoke('client:clearHistory', instanceId),
    onStatus: (fn) => on(`client:${instanceId}:status`, fn),
    onSent: (fn) => on(`client:${instanceId}:sent`, fn)
  })
}
