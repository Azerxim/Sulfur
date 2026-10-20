/** Accès IPC au module DNS du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`dns:${action}`, ...args)
const on = (event, listener) => window.sulfur.on(`dns:${event}`, listener)

export const dnsApi = {
  server: {
    status: () => invoke('server:status'),
    start: (config) => invoke('server:start', config),
    stop: () => invoke('server:stop'),
    update: (config) => invoke('server:update', config),
    queries: () => invoke('server:queries'),
    clear: () => invoke('server:clear'),
    onStatus: (fn) => on('server:status', fn),
    onQuery: (fn) => on('server:query', fn)
  },
  client: {
    query: (config) => invoke('client:query', config),
    history: () => invoke('client:history'),
    clear: () => invoke('client:clear')
  }
}
