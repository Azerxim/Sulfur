/** Accès IPC au module FTP / SFTP du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`ftp:${action}`, ...args)
const on = (event, listener) => window.sulfur.on(`ftp:${event}`, listener)

/** Canaux d'une instance : identifiant en premier argument, événements `<role>:<id>:<event>`. */
const call =
  (role, instanceId) =>
  (action, ...args) =>
    invoke(`${role}:${action}`, instanceId, ...args)
const listen = (role, instanceId) => (event, fn) => on(`${role}:${instanceId}:${event}`, fn)

/** Commun aux serveurs FTP et SFTP : mots de passe, dossier servi. */
const files = {
  hashPassword: (password) => invoke('files:hashPassword', password),
  defaultRoot: () => invoke('files:defaultRoot'),
  pickRoot: () => invoke('files:pickRoot'),
  openRoot: (root) => invoke('files:openRoot', root)
}

/** Navigation et transferts : mêmes opérations pour les clients FTP et SFTP. */
function clientApi(role, instanceId) {
  const run = call(role, instanceId)
  return {
    status: () => run('status'),
    connect: (config) => run('connect', config),
    disconnect: () => run('disconnect'),
    list: (dir) => run('list', dir),
    mkdir: (name) => run('mkdir', name),
    remove: (name, type) => run('remove', name, type),
    rename: (from, to) => run('rename', from, to),
    download: (name) => run('download', name),
    upload: () => run('upload'),
    onStatus: (fn) => listen(role, instanceId)('status', fn)
  }
}

/** Serveur et client FTP `instanceId` (voir InstancesPage du SDK). */
export const ftpApi = {
  server(instanceId) {
    const run = call('server', instanceId)
    const sub = listen('server', instanceId)
    return {
      ...files,
      status: () => run('status'),
      start: (config) => run('start', config),
      stop: () => run('stop'),
      update: (config) => run('update', config),
      logs: () => run('logs'),
      clearLogs: () => run('clearLogs'),
      onStatus: (fn) => sub('status', fn),
      onLog: (fn) => sub('log', fn)
    }
  },
  client(instanceId) {
    const run = call('client', instanceId)
    return {
      ...clientApi('client', instanceId),
      dialog: () => run('dialog'),
      clearDialog: () => run('clearDialog'),
      onDialog: (fn) => listen('client', instanceId)('dialog', fn)
    }
  }
}

/** Serveur et client SFTP `instanceId` ; mots de passe et dossier servi communs avec FTP. */
export const sftpApi = {
  server(instanceId) {
    const run = call('sftpServer', instanceId)
    const sub = listen('sftpServer', instanceId)
    return {
      ...files,
      status: () => run('status'),
      start: (config) => run('start', config),
      stop: () => run('stop'),
      updateUsers: (users) => run('updateUsers', users),
      logs: () => run('logs'),
      clearLogs: () => run('clearLogs'),
      hostKey: () => invoke('sftp:hostKey'),
      onStatus: (fn) => sub('status', fn),
      onLog: (fn) => sub('log', fn)
    }
  },
  client: (instanceId) => ({ ...clientApi('sftpClient', instanceId), pickKey: () => invoke('sftp:pickKey') })
}
