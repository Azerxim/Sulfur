/** Accès IPC au module Modbus du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`modbus:${action}`, ...args)
const on = (event, listener) => window.sulfur.on(`modbus:${event}`, listener)

/** Canaux d'une instance : identifiant en premier argument, événements `<role>:<id>:<event>`. */
const call =
  (role, id) =>
  (action, ...args) =>
    invoke(`${role}:${action}`, id, ...args)
const listen = (role, id) => (event, fn) => on(`${role}:${id}:${event}`, fn)

export const modbusApi = {
  serialPorts: () => invoke('serial:list'),
  /** Serveur `id` (voir InstancesPage du SDK). */
  server(id) {
    const run = call('server', id)
    const sub = listen('server', id)
    return {
      status: () => run('status'),
      start: (config) => run('start', config),
      stop: () => run('stop'),
      values: () => run('values'),
      logs: () => run('logs'),
      clearLogs: () => run('clearLogs'),
      upsertPoint: (def, unitId) => run('upsertPoint', def, unitId),
      removePoint: (pointId) => run('removePoint', pointId),
      setValue: (pointId, value) => run('setValue', pointId, value),
      setUpdateRate: (rate) => run('setUpdateRate', rate),
      addUnit: (def) => run('addUnit', def),
      updateUnit: (def) => run('updateUnit', def),
      removeUnit: (unitId) => run('removeUnit', unitId),
      registers: (unitId, table, address, count) => run('registers', unitId, table, address, count),
      writeRegister: (unitId, table, address, value) => run('writeRegister', unitId, table, address, value),
      onStatus: (fn) => sub('status', fn),
      onValues: (fn) => sub('values', fn),
      onLog: (fn) => sub('log', fn)
    }
  },
  /** Client `id`. */
  client(id) {
    const run = call('client', id)
    const sub = listen('client', id)
    return {
      status: () => run('status'),
      connect: (config) => run('connect', config),
      disconnect: () => run('disconnect'),
      read: (table, address, quantity) => run('read', table, address, quantity),
      write: (table, address, values) => run('write', table, address, values),
      readWrite: (readAddress, readQuantity, writeAddress, values) =>
        run('readWrite', readAddress, readQuantity, writeAddress, values),
      identify: (code) => run('identify', code),
      writeValue: (table, address, value, dataType, wordOrder) =>
        run('writeValue', table, address, value, dataType, wordOrder),
      addWatch: (item) => run('addWatch', item),
      removeWatch: (watchId) => run('removeWatch', watchId),
      setPollInterval: (ms) => run('setPollInterval', ms),
      onStatus: (fn) => sub('status', fn),
      onData: (fn) => sub('data', fn)
    }
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
