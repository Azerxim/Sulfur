/** Accès IPC au module TFTP du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`tftp:${action}`, ...args)
const on = (event, listener) => window.sulfur.on(`tftp:${event}`, listener)

export const tftpApi = {
  server: {
    status: () => invoke('server:status'),
    start: (config) => invoke('server:start', config),
    stop: () => invoke('server:stop'),
    update: (config) => invoke('server:update', config),
    logs: () => invoke('server:logs'),
    clearLogs: () => invoke('server:clearLogs'),
    defaultRoot: () => invoke('server:defaultRoot'),
    pickRoot: () => invoke('server:pickRoot'),
    openRoot: (root) => invoke('server:openRoot', root),
    onStatus: (fn) => on('server:status', fn),
    onLog: (fn) => on('server:log', fn)
  },
  client: {
    history: () => invoke('client:history'),
    clear: () => invoke('client:clear'),
    get: (config) => invoke('client:get', config),
    put: (config) => invoke('client:put', config),
    abort: () => invoke('client:abort'),
    onProgress: (fn) => on('client:progress', fn)
  }
}
