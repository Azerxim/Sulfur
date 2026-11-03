/** Accès IPC au module OPC UA du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`opcua:${action}`, ...args)
const on = (event, listener) => window.sulfur.on(`opcua:${event}`, listener)

export const opcuaApi = {
  server: (instanceId) => ({
    status: () => invoke('server:status', instanceId),
    start: (config) => invoke('server:start', instanceId, config),
    stop: () => invoke('server:stop', instanceId),
    values: () => invoke('server:values', instanceId),
    upsertVariable: (def) => invoke('server:upsertVariable', instanceId, def),
    removeVariable: (id) => invoke('server:removeVariable', instanceId, id),
    setValue: (id, value) => invoke('server:setValue', instanceId, id, value),
    setUpdateRate: (rate) => invoke('server:setUpdateRate', instanceId, rate),
    upsertMethod: (def) => invoke('server:upsertMethod', instanceId, def),
    removeMethod: (id) => invoke('server:removeMethod', instanceId, id),
    upsertAlarm: (def) => invoke('server:upsertAlarm', instanceId, def),
    removeAlarm: (id) => invoke('server:removeAlarm', instanceId, id),
    raiseEvent: (event) => invoke('server:raiseEvent', instanceId, event),
    /** Choix de fichiers NodeSet2 à importer (null si annulé). */
    pickNodesets: () => invoke('nodesets:pick'),
    onStatus: (fn) => on(`server:${instanceId}:status`, fn),
    onValues: (fn) => on(`server:${instanceId}:values`, fn)
  }),
  client: (instanceId) => ({
    status: () => invoke('client:status', instanceId),
    connect: (url, security) => invoke('client:connect', instanceId, url, security),
    discover: (url) => invoke('client:discover', instanceId, url),
    disconnect: () => invoke('client:disconnect', instanceId),
    browse: (nodeId) => invoke('client:browse', instanceId, nodeId),
    read: (nodeId) => invoke('client:read', instanceId, nodeId),
    write: (nodeId, value) => invoke('client:write', instanceId, nodeId, value),
    subscribe: (nodeId) => invoke('client:subscribe', instanceId, nodeId),
    unsubscribe: (nodeId) => invoke('client:unsubscribe', instanceId, nodeId),
    history: (nodeId, start, end) => invoke('client:history', instanceId, nodeId, start, end),
    methodInfo: (nodeId) => invoke('client:methodInfo', instanceId, nodeId),
    call: (nodeId, inputs) => invoke('client:call', instanceId, nodeId, inputs),
    subscribeEvents: () => invoke('client:subscribeEvents', instanceId),
    unsubscribeEvents: () => invoke('client:unsubscribeEvents', instanceId),
    acknowledge: (conditionId, eventId, comment) =>
      invoke('client:acknowledge', instanceId, conditionId, eventId, comment),
    onStatus: (fn) => on(`client:${instanceId}:status`, fn),
    onData: (fn) => on(`client:${instanceId}:data`, fn),
    onEvent: (fn) => on(`client:${instanceId}:event`, fn)
  }),
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
