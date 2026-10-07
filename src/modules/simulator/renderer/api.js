/** Accès IPC au simulateur du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`simulator:${action}`, ...args)

export const simulatorApi = {
  targets: () => invoke('targets'),
  status: () => invoke('status'),
  activateFault: (def) => invoke('faults:activate', def),
  deactivateFault: (id) => invoke('faults:deactivate', id),
  clearFaults: () => invoke('faults:clear'),
  play: (scenario, faults) => invoke('scenario:play', scenario, faults),
  stop: () => invoke('scenario:stop'),
  startRecording: (keys) => invoke('record:start', keys),
  stopRecording: () => invoke('record:stop'),
  onStatus: (fn) => window.sulfur.on('simulator:status', fn)
}
