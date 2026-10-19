/** Accès IPC au module SNMP du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`snmp:${action}`, ...args)
const on = (event, listener) => window.sulfur.on(`snmp:${event}`, listener)

export const snmpApi = {
  agent: {
    status: () => invoke('agent:status'),
    start: (config) => invoke('agent:start', config),
    stop: () => invoke('agent:stop'),
    values: () => invoke('agent:values'),
    setValue: (id, value) => invoke('agent:setValue', id, value),
    upsertObject: (def) => invoke('agent:upsertObject', def),
    deleteObject: (id) => invoke('agent:deleteObject', id),
    setUpdateRate: (rate) => invoke('agent:setUpdateRate', rate),
    setTraps: (traps) => invoke('agent:setTraps', traps),
    sendTrap: () => invoke('agent:sendTrap'),
    logs: () => invoke('agent:logs'),
    clearLogs: () => invoke('agent:clearLogs'),
    onStatus: (fn) => on('agent:status', fn),
    onLog: (fn) => on('agent:log', fn),
    onValues: (fn) => on('agent:values', fn)
  },
  manager: {
    status: () => invoke('manager:status'),
    request: (config, request) => invoke('manager:request', config, request),
    startPolling: (config) => invoke('manager:startPolling', config),
    stopPolling: () => invoke('manager:stopPolling'),
    values: () => invoke('manager:values'),
    startReceiver: (config) => invoke('manager:startReceiver', config),
    stopReceiver: () => invoke('manager:stopReceiver'),
    traps: () => invoke('manager:traps'),
    clearTraps: () => invoke('manager:clearTraps'),
    onStatus: (fn) => on('manager:status', fn),
    onPoll: (fn) => on('manager:poll', fn),
    onTraps: (fn) => on('manager:traps', fn)
  }
}
