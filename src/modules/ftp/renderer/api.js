/** Accès IPC au module FTP du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`ftp:${action}`, ...args)
const on = (event, listener) => window.sulfur.on(`ftp:${event}`, listener)

export const ftpApi = {
  server: {
    status: () => invoke('server:status'),
    start: (config) => invoke('server:start', config),
    stop: () => invoke('server:stop'),
    update: (config) => invoke('server:update', config),
    logs: () => invoke('server:logs'),
    clearLogs: () => invoke('server:clearLogs'),
    hashPassword: (password) => invoke('server:hashPassword', password),
    defaultRoot: () => invoke('server:defaultRoot'),
    pickRoot: () => invoke('server:pickRoot'),
    openRoot: (root) => invoke('server:openRoot', root),
    onStatus: (fn) => on('server:status', fn),
    onLog: (fn) => on('server:log', fn)
  },
  client: {
    status: () => invoke('client:status'),
    connect: (config) => invoke('client:connect', config),
    disconnect: () => invoke('client:disconnect'),
    dialog: () => invoke('client:dialog'),
    clearDialog: () => invoke('client:clearDialog'),
    list: (dir) => invoke('client:list', dir),
    mkdir: (name) => invoke('client:mkdir', name),
    remove: (name, type) => invoke('client:remove', name, type),
    rename: (from, to) => invoke('client:rename', from, to),
    download: (name) => invoke('client:download', name),
    upload: () => invoke('client:upload'),
    onStatus: (fn) => on('client:status', fn),
    onDialog: (fn) => on('client:dialog', fn)
  }
}
