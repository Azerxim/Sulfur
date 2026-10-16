/** Accès IPC au simulateur du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`simulator:${action}`, ...args)

export const simulatorApi = {
  targets: () => invoke('targets'),
  status: () => invoke('status'),
  activateFault: (def) => invoke('faults:activate', def),
  deactivateFault: (id) => invoke('faults:deactivate', id),
  clearFaults: () => invoke('faults:clear'),
  startRecording: (keys) => invoke('record:start', keys),
  stopRecording: () => invoke('record:stop'),
  onStatus: (fn) => window.sulfur.on('simulator:status', fn),

  flowState: () => invoke('flows:state'),
  deploy: (flows) => invoke('flows:deploy', flows),
  stopFlows: () => invoke('flows:stop'),
  restartFlows: () => invoke('flows:restart'),
  inject: (nodeId) => invoke('flows:inject', nodeId),
  nodeStatuses: () => invoke('flows:nodeStatus'),
  debugMessages: () => invoke('flows:debug'),
  clearDebug: () => invoke('flows:debug:clear'),
  onFlowState: (fn) => window.sulfur.on('simulator:flows:state', fn),
  /** Statuts modifiés { [id]: statut | null }, ou null : tous les statuts effacés (arrêt des flux). */
  onNodeStatus: (fn) => window.sulfur.on('simulator:flows:nodeStatus', fn),
  onDebug: (fn) => window.sulfur.on('simulator:flows:debug', fn)
}
