/** Accès IPC au module FTP / SFTP du process principal. */
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

/** Partie SFTP : canaux `ftp:sftp:*` ; mots de passe et dossier servi communs avec FTP. */
const sftpInvoke = (action, ...args) => invoke(`sftp:${action}`, ...args)
const sftpOn = (event, listener) => on(`sftp:${event}`, listener)

export const sftpApi = {
  server: {
    status: () => sftpInvoke('server:status'),
    start: (config) => sftpInvoke('server:start', config),
    stop: () => sftpInvoke('server:stop'),
    updateUsers: (users) => sftpInvoke('server:updateUsers', users),
    logs: () => sftpInvoke('server:logs'),
    clearLogs: () => sftpInvoke('server:clearLogs'),
    hostKey: () => sftpInvoke('server:hostKey'),
    hashPassword: ftpApi.server.hashPassword,
    defaultRoot: ftpApi.server.defaultRoot,
    pickRoot: ftpApi.server.pickRoot,
    openRoot: ftpApi.server.openRoot,
    onStatus: (fn) => sftpOn('server:status', fn),
    onLog: (fn) => sftpOn('server:log', fn)
  },
  client: {
    status: () => sftpInvoke('client:status'),
    connect: (config) => sftpInvoke('client:connect', config),
    disconnect: () => sftpInvoke('client:disconnect'),
    list: (dir) => sftpInvoke('client:list', dir),
    mkdir: (name) => sftpInvoke('client:mkdir', name),
    remove: (name, type) => sftpInvoke('client:remove', name, type),
    rename: (from, to) => sftpInvoke('client:rename', from, to),
    download: (name) => sftpInvoke('client:download', name),
    upload: () => sftpInvoke('client:upload'),
    pickKey: () => sftpInvoke('client:pickKey'),
    onStatus: (fn) => sftpOn('client:status', fn)
  }
}
