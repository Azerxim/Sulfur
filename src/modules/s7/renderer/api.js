/** Accès IPC au module Siemens S7 du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`s7:${action}`, ...args)
const on = (event, listener) => window.sulfur.on(`s7:${event}`, listener)

export const s7Api = {
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
    setCpuState: (state) => invoke('server:setCpuState', state),
    setUpdateRate: (rate) => invoke('server:setUpdateRate', rate),
    setReadOnly: (readOnly) => invoke('server:setReadOnly', readOnly),
    memory: (area, db, start, count) => invoke('server:memory', area, db, start, count),
    writeMemory: (area, db, offset, value) => invoke('server:writeMemory', area, db, offset, value),
    onStatus: (fn) => on('server:status', fn),
    onValues: (fn) => on('server:values', fn),
    onLog: (fn) => on('server:log', fn)
  },
  client: {
    status: () => invoke('client:status'),
    connect: (config) => invoke('client:connect', config),
    disconnect: () => invoke('client:disconnect'),
    readValue: (address, dataType, length) => invoke('client:readValue', address, dataType, length),
    writeValue: (address, dataType, value, length) => invoke('client:writeValue', address, dataType, value, length),
    readArea: (area, db, start, count) => invoke('client:readArea', area, db, start, count),
    writeArea: (area, db, start, bytes) => invoke('client:writeArea', area, db, start, bytes),
    identify: () => invoke('client:identify'),
    cpuState: () => invoke('client:cpuState'),
    stopCpu: () => invoke('client:stopCpu'),
    startCpu: (mode) => invoke('client:startCpu', mode),
    addWatch: (item) => invoke('client:addWatch', item),
    removeWatch: (id) => invoke('client:removeWatch', id),
    setPollInterval: (ms) => invoke('client:setPollInterval', ms),
    onStatus: (fn) => on('client:status', fn),
    onData: (fn) => on('client:data', fn)
  }
}
