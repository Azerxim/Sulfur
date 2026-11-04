/** Accès IPC au module DNS du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`dns:${action}`, ...args)
const on = (event, listener) => window.sulfur.on(`dns:${event}`, listener)

export const dnsApi = {
  server: (instanceId) => ({
    status: () => invoke('server:status', instanceId),
    start: (config) => invoke('server:start', instanceId, config),
    stop: () => invoke('server:stop', instanceId),
    update: (config) => invoke('server:update', instanceId, config),
    queries: () => invoke('server:queries', instanceId),
    clear: () => invoke('server:clear', instanceId),
    onStatus: (fn) => on(`server:${instanceId}:status`, fn),
    onQuery: (fn) => on(`server:${instanceId}:query`, fn)
  }),
  client: (instanceId) => ({
    query: (config) => invoke('client:query', instanceId, config),
    history: () => invoke('client:history', instanceId),
    clear: () => invoke('client:clear', instanceId)
  })
}
