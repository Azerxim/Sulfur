export const SIMULATOR_MODULE = {
  id: 'simulator',
  name: 'Simulateur',
  description: 'Injection de défauts et scénarios sur les serveurs et clients des autres modules'
}

/** Étapes d'un scénario (libellés : simulator.steps.*). Durées en secondes. */
export const STEP_TYPES = ['set', 'ramp', 'wait', 'fault']

/** Pas de temps d'une rampe (ms). */
export const RAMP_INTERVAL = 100

/** Période d'échantillonnage d'un enregistrement (ms). */
export const RECORD_INTERVAL = 100

/** Portée d'une exception Modbus forcée (libellés : simulator.faults.scopes.*). */
export const FAULT_SCOPES = ['all', 'read', 'write']

/** Défauts proposés au premier lancement (durée en s, 0 = jusqu'à l'arrêt). */
export const DEFAULT_FAULTS = [
  {
    id: 'fault-1',
    name: 'OPC UA 500 ms',
    module: 'opcua',
    type: 'delay',
    params: { ms: 500 },
    points: [],
    duration: 0
  },
  { id: 'fault-2', name: 'Modbus 10 s', module: 'modbus', type: 'cut', params: {}, points: [], duration: 10 }
]

/** Scénario d'exemple : points des configurations par défaut des modules OPC UA et Modbus. */
export const DEFAULT_SCENARIOS = [
  {
    id: 'scenario-1',
    name: 'Demo',
    loop: false,
    steps: [
      { id: 'step-1', type: 'set', point: 'opcua/server:var-5', value: 'Demo' },
      { id: 'step-2', type: 'ramp', point: 'modbus/server:pt-2', from: 0, to: 100, duration: 10 },
      { id: 'step-3', type: 'fault', fault: 'fault-1', action: 'on' },
      { id: 'step-4', type: 'wait', duration: 5 },
      { id: 'step-5', type: 'fault', fault: 'fault-1', action: 'off' },
      { id: 'step-6', type: 'set', point: 'opcua/server:var-5', value: 'Sulfur' }
    ]
  }
]
