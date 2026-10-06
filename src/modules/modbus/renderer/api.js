/** Accès IPC au module Modbus du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`modbus:${action}`, ...args)
const on = (event, listener) => window.sulfur.on(`modbus:${event}`, listener)

export const modbusApi = {
  server: {
    status: () => invoke('server:status'),
    start: (config) => invoke('server:start', config),
    stop: () => invoke('server:stop'),
    values: () => invoke('server:values'),
    logs: () => invoke('server:logs'),
    clearLogs: () => invoke('server:clearLogs'),
    upsertPoint: (def) => invoke('server:upsertPoint', def),
    removePoint: (id) => invoke('server:removePoint', id),
    setValue: (id, value) => invoke('server:setValue', id, value),
    setUpdateRate: (rate) => invoke('server:setUpdateRate', rate),
    onStatus: (fn) => on('server:status', fn),
    onValues: (fn) => on('server:values', fn),
    onLog: (fn) => on('server:log', fn)
  },
  client: {
    status: () => invoke('client:status'),
    connect: (config) => invoke('client:connect', config),
    disconnect: () => invoke('client:disconnect'),
    read: (table, address, quantity) => invoke('client:read', table, address, quantity),
    write: (table, address, values) => invoke('client:write', table, address, values),
    writeValue: (table, address, value, dataType, wordOrder) =>
      invoke('client:writeValue', table, address, value, dataType, wordOrder),
    addWatch: (item) => invoke('client:addWatch', item),
    removeWatch: (id) => invoke('client:removeWatch', id),
    setPollInterval: (ms) => invoke('client:setPollInterval', ms),
    onStatus: (fn) => on('client:status', fn),
    onData: (fn) => on('client:data', fn)
  }
}

/** Interface attendue par le dialogue de certificats partagé, pour le magasin `which`. */
export const certStore = (which) => ({
  list: () => invoke('certs:list', which),
  trust: (thumbprint) => invoke('certs:trust', which, thumbprint),
  reject: (thumbprint) => invoke('certs:reject', which, thumbprint),
  remove: (thumbprint) => invoke('certs:remove', which, thumbprint),
  openFolder: () => invoke('certs:openFolder', which)
})
