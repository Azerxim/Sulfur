export const SIMULATOR_MODULE = {
  id: 'simulator',
  name: 'Simulateur',
  description: 'Injection de défauts et flux de nœuds sur les serveurs et clients des autres modules'
}

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

const demoNode = (id, type, x, y, config) => ({ id, type, name: '', x, y, config })
const demoWire = (source, target) => ({ id: `${source}-${target}`, source, port: 0, target })

/**
 * Flux d'exemple (points des configurations par défaut des modules OPC UA et Modbus) : une séquence
 * lancée à la main, et la température OPC UA mise à l'échelle et affichée dans le débogage.
 */
export const DEFAULT_FLOWS = [
  {
    id: 'flow-1',
    name: 'Demo',
    disabled: false,
    nodes: [
      demoNode('n-1', 'inject', 40, 60, { payloadType: 'string', payload: '', topic: '', once: false, repeat: 0 }),
      demoNode('n-2', 'write', 240, 60, { point: 'opcua/server:var-5', source: 'fixed', value: 'Demo' }),
      demoNode('n-3', 'ramp', 440, 60, { point: 'modbus/server:pt-2', from: 0, to: 100, duration: 10 }),
      demoNode('n-4', 'fault', 640, 60, { fault: 'fault-1', action: 'on' }),
      demoNode('n-5', 'delay', 840, 60, { duration: 5 }),
      demoNode('n-6', 'fault', 1040, 60, { fault: 'fault-1', action: 'off' }),
      demoNode('n-7', 'write', 1240, 60, { point: 'opcua/server:var-5', source: 'fixed', value: 'Sulfur' }),
      demoNode('n-8', 'watch', 40, 200, { point: 'opcua/server:var-1', interval: 200, initial: true }),
      demoNode('n-9', 'scale', 240, 200, { inMin: 0, inMax: 50, outMin: 0, outMax: 1000, clamp: true, round: true }),
      demoNode('n-10', 'debug', 440, 200, { property: 'payload', active: true })
    ],
    wires: [
      demoWire('n-1', 'n-2'),
      demoWire('n-2', 'n-3'),
      demoWire('n-3', 'n-4'),
      demoWire('n-4', 'n-5'),
      demoWire('n-5', 'n-6'),
      demoWire('n-6', 'n-7'),
      demoWire('n-8', 'n-9'),
      demoWire('n-9', 'n-10')
    ]
  }
]
