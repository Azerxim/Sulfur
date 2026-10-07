/** Accès IPC au module OPC UA du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`opcua:${action}`, ...args)
const on = (event, listener) => window.sulfur.on(`opcua:${event}`, listener)

export const opcuaApi = {
  server: {
    status: () => invoke('server:status'),
    start: (config) => invoke('server:start', config),
    stop: () => invoke('server:stop'),
    values: () => invoke('server:values'),
    upsertVariable: (def) => invoke('server:upsertVariable', def),
    removeVariable: (id) => invoke('server:removeVariable', id),
    setValue: (id, value) => invoke('server:setValue', id, value),
    setUpdateRate: (rate) => invoke('server:setUpdateRate', rate),
    upsertMethod: (def) => invoke('server:upsertMethod', def),
    removeMethod: (id) => invoke('server:removeMethod', id),
    upsertAlarm: (def) => invoke('server:upsertAlarm', def),
    removeAlarm: (id) => invoke('server:removeAlarm', id),
    raiseEvent: (event) => invoke('server:raiseEvent', event),
    /** Choix de fichiers NodeSet2 à importer (null si annulé). */
    pickNodesets: () => invoke('nodesets:pick'),
    onStatus: (fn) => on('server:status', fn),
    onValues: (fn) => on('server:values', fn)
  },
  client: {
    status: () => invoke('client:status'),
    connect: (url, security) => invoke('client:connect', url, security),
    discover: (url) => invoke('client:discover', url),
    disconnect: () => invoke('client:disconnect'),
    browse: (nodeId) => invoke('client:browse', nodeId),
    read: (nodeId) => invoke('client:read', nodeId),
    write: (nodeId, value) => invoke('client:write', nodeId, value),
    subscribe: (nodeId) => invoke('client:subscribe', nodeId),
    unsubscribe: (nodeId) => invoke('client:unsubscribe', nodeId),
    history: (nodeId, start, end) => invoke('client:history', nodeId, start, end),
    methodInfo: (nodeId) => invoke('client:methodInfo', nodeId),
    call: (nodeId, inputs) => invoke('client:call', nodeId, inputs),
    subscribeEvents: () => invoke('client:subscribeEvents'),
    unsubscribeEvents: () => invoke('client:unsubscribeEvents'),
    acknowledge: (conditionId, eventId, comment) => invoke('client:acknowledge', conditionId, eventId, comment),
    onStatus: (fn) => on('client:status', fn),
    onData: (fn) => on('client:data', fn),
    onEvent: (fn) => on('client:event', fn)
  },
  security: {
    hashPassword: (password) => invoke('security:hashPassword', password)
  },
  /** Magasins de certificats : which = 'server' | 'client' */
  certs: {
    list: (which) => invoke('certs:list', which),
    trust: (which, thumbprint) => invoke('certs:trust', which, thumbprint),
    reject: (which, thumbprint) => invoke('certs:reject', which, thumbprint),
    remove: (which, thumbprint) => invoke('certs:remove', which, thumbprint),
    openFolder: (which) => invoke('certs:openFolder', which)
  }
}

/** Interface attendue par le dialogue de certificats partagé, pour le magasin `which`. */
export const certStore = (which) => ({
  list: () => opcuaApi.certs.list(which),
  trust: (thumbprint) => opcuaApi.certs.trust(which, thumbprint),
  reject: (thumbprint) => opcuaApi.certs.reject(which, thumbprint),
  remove: (thumbprint) => opcuaApi.certs.remove(which, thumbprint),
  openFolder: () => opcuaApi.certs.openFolder(which)
})
