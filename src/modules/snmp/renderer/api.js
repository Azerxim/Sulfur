/** Accès IPC au module SNMP du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`snmp:${action}`, ...args)
const on = (event, listener) => window.sulfur.on(`snmp:${event}`, listener)

export const snmpApi = {
  agent: (instanceId) => ({
    status: () => invoke('agent:status', instanceId),
    start: (config) => invoke('agent:start', instanceId, config),
    stop: () => invoke('agent:stop', instanceId),
    values: () => invoke('agent:values', instanceId),
    setValue: (id, value) => invoke('agent:setValue', instanceId, id, value),
    upsertObject: (def) => invoke('agent:upsertObject', instanceId, def),
    deleteObject: (id) => invoke('agent:deleteObject', instanceId, id),
    setUpdateRate: (rate) => invoke('agent:setUpdateRate', instanceId, rate),
    setTraps: (traps) => invoke('agent:setTraps', instanceId, traps),
    sendTrap: () => invoke('agent:sendTrap', instanceId),
    logs: () => invoke('agent:logs', instanceId),
    clearLogs: () => invoke('agent:clearLogs', instanceId),
    onStatus: (fn) => on(`agent:${instanceId}:status`, fn),
    onLog: (fn) => on(`agent:${instanceId}:log`, fn),
    onValues: (fn) => on(`agent:${instanceId}:values`, fn)
  }),
  manager: (instanceId) => ({
    status: () => invoke('manager:status', instanceId),
    request: (config, request) => invoke('manager:request', instanceId, config, request),
    startPolling: (config) => invoke('manager:startPolling', instanceId, config),
    stopPolling: () => invoke('manager:stopPolling', instanceId),
    values: () => invoke('manager:values', instanceId),
    startReceiver: (config) => invoke('manager:startReceiver', instanceId, config),
    stopReceiver: () => invoke('manager:stopReceiver', instanceId),
    traps: () => invoke('manager:traps', instanceId),
    clearTraps: () => invoke('manager:clearTraps', instanceId),
    onStatus: (fn) => on(`manager:${instanceId}:status`, fn),
    onPoll: (fn) => on(`manager:${instanceId}:poll`, fn),
    onTraps: (fn) => on(`manager:${instanceId}:traps`, fn)
  })
}
