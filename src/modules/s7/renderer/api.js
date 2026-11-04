/** Accès IPC au module Siemens S7 du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`s7:${action}`, ...args)
const on = (event, listener) => window.sulfur.on(`s7:${event}`, listener)

export const s7Api = {
  server: (instanceId) => ({
    status: () => invoke('server:status', instanceId),
    start: (config) => invoke('server:start', instanceId, config),
    stop: () => invoke('server:stop', instanceId),
    values: () => invoke('server:values', instanceId),
    logs: () => invoke('server:logs', instanceId),
    clearLogs: () => invoke('server:clearLogs', instanceId),
    upsertPoint: (def) => invoke('server:upsertPoint', instanceId, def),
    removePoint: (id) => invoke('server:removePoint', instanceId, id),
    setValue: (id, value) => invoke('server:setValue', instanceId, id, value),
    setCpuState: (state) => invoke('server:setCpuState', instanceId, state),
    setUpdateRate: (rate) => invoke('server:setUpdateRate', instanceId, rate),
    setReadOnly: (readOnly) => invoke('server:setReadOnly', instanceId, readOnly),
    memory: (area, db, start, count) => invoke('server:memory', instanceId, area, db, start, count),
    writeMemory: (area, db, offset, value) => invoke('server:writeMemory', instanceId, area, db, offset, value),
    onStatus: (fn) => on(`server:${instanceId}:status`, fn),
    onValues: (fn) => on(`server:${instanceId}:values`, fn),
    onLog: (fn) => on(`server:${instanceId}:log`, fn)
  }),
  client: (instanceId) => ({
    status: () => invoke('client:status', instanceId),
    connect: (config) => invoke('client:connect', instanceId, config),
    disconnect: () => invoke('client:disconnect', instanceId),
    readValue: (address, dataType, length) => invoke('client:readValue', instanceId, address, dataType, length),
    writeValue: (address, dataType, value, length) =>
      invoke('client:writeValue', instanceId, address, dataType, value, length),
    readArea: (area, db, start, count) => invoke('client:readArea', instanceId, area, db, start, count),
    writeArea: (area, db, start, bytes) => invoke('client:writeArea', instanceId, area, db, start, bytes),
    identify: () => invoke('client:identify', instanceId),
    cpuState: () => invoke('client:cpuState', instanceId),
    stopCpu: () => invoke('client:stopCpu', instanceId),
    startCpu: (mode) => invoke('client:startCpu', instanceId, mode),
    addWatch: (item) => invoke('client:addWatch', instanceId, item),
    removeWatch: (id) => invoke('client:removeWatch', instanceId, id),
    setPollInterval: (ms) => invoke('client:setPollInterval', instanceId, ms),
    onStatus: (fn) => on(`client:${instanceId}:status`, fn),
    onData: (fn) => on(`client:${instanceId}:data`, fn)
  })
}
