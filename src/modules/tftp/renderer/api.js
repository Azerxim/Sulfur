/** Accès IPC au module TFTP du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`tftp:${action}`, ...args)
const on = (event, listener) => window.sulfur.on(`tftp:${event}`, listener)

export const tftpApi = {
  server: (instanceId) => ({
    status: () => invoke('server:status', instanceId),
    start: (config) => invoke('server:start', instanceId, config),
    stop: () => invoke('server:stop', instanceId),
    update: (config) => invoke('server:update', instanceId, config),
    logs: () => invoke('server:logs', instanceId),
    clearLogs: () => invoke('server:clearLogs', instanceId),
    defaultRoot: () => invoke('server:defaultRoot', instanceId),
    pickRoot: () => invoke('server:pickRoot', instanceId),
    openRoot: (root) => invoke('server:openRoot', instanceId, root),
    onStatus: (fn) => on(`server:${instanceId}:status`, fn),
    onLog: (fn) => on(`server:${instanceId}:log`, fn)
  }),
  client: (instanceId) => ({
    history: () => invoke('client:history', instanceId),
    clear: () => invoke('client:clear', instanceId),
    get: (config) => invoke('client:get', instanceId, config),
    put: (config) => invoke('client:put', instanceId, config),
    abort: () => invoke('client:abort', instanceId),
    onProgress: (fn) => on(`client:${instanceId}:progress`, fn)
  })
}
