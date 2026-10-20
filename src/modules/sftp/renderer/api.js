/** Accès IPC au module SFTP du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`sftp:${action}`, ...args)
const on = (event, listener) => window.sulfur.on(`sftp:${event}`, listener)

export const sftpApi = {
  server: {
    status: () => invoke('server:status'),
    start: (config) => invoke('server:start', config),
    stop: () => invoke('server:stop'),
    updateUsers: (users) => invoke('server:updateUsers', users),
    logs: () => invoke('server:logs'),
    clearLogs: () => invoke('server:clearLogs'),
    hashPassword: (password) => invoke('server:hashPassword', password),
    defaultRoot: () => invoke('server:defaultRoot'),
    hostKey: () => invoke('server:hostKey'),
    pickRoot: () => invoke('server:pickRoot'),
    openRoot: (root) => invoke('server:openRoot', root),
    onStatus: (fn) => on('server:status', fn),
    onLog: (fn) => on('server:log', fn)
  },
  client: {
    status: () => invoke('client:status'),
    connect: (config) => invoke('client:connect', config),
    disconnect: () => invoke('client:disconnect'),
    list: (dir) => invoke('client:list', dir),
    mkdir: (name) => invoke('client:mkdir', name),
    remove: (name, type) => invoke('client:remove', name, type),
    rename: (from, to) => invoke('client:rename', from, to),
    download: (name) => invoke('client:download', name),
    upload: () => invoke('client:upload'),
    pickKey: () => invoke('client:pickKey'),
    onStatus: (fn) => on('client:status', fn)
  }
}
