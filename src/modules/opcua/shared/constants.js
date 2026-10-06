export const OPCUA_MODULE = {
  id: 'opcua',
  name: 'OPC UA',
  description: 'Serveur OPC UA simulé et client de test'
}

export const DATA_TYPES = ['Double', 'Float', 'Int32', 'UInt32', 'Int16', 'Boolean', 'String']

/** Générateurs de valeurs disponibles pour les variables simulées. */
export const SIMULATIONS = {
  none: 'Statique',
  sine: 'Sinus',
  ramp: 'Rampe',
  random: 'Aléatoire',
  toggle: 'Bascule'
}

export const DEFAULT_SERVER_CONFIG = {
  port: 4840,
  resourcePath: '/UA/Sulfur',
  rootFolder: 'Simulation',
  updateRate: 100,
  variables: [
    { name: 'Temperature', dataType: 'Double', initialValue: 20, simulation: 'sine', period: 10000, min: 15, max: 25, writable: true },
    { name: 'Pressure', dataType: 'Double', initialValue: 1, simulation: 'random', period: 1000, min: 0.9, max: 1.1, writable: true },
    { name: 'Counter', dataType: 'Int32', initialValue: 0, simulation: 'ramp', period: 10000, min: 0, max: 100, writable: true },
    { name: 'Running', dataType: 'Boolean', initialValue: true, simulation: 'toggle', period: 5000, min: 0, max: 1, writable: true },
    { name: 'Label', dataType: 'String', initialValue: 'Sulfur', simulation: 'none', period: 1000, min: 0, max: 0, writable: true }
  ]
}

export const ROOT_NODES = [
  { nodeId: 'i=85', displayName: 'Objects', nodeClass: 'Object' },
  { nodeId: 'i=86', displayName: 'Types', nodeClass: 'Object' },
  { nodeId: 'i=87', displayName: 'Views', nodeClass: 'Object' }
]
