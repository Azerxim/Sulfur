export const MODBUS_MODULE = {
  id: 'modbus',
  name: 'Modbus TCP',
  description: 'Serveur et client Modbus TCP / Modbus/TCP Security (TLS)'
}

/** Les quatre tables Modbus. `prefix` = notation historique (0x, 1x, 3x, 4x). */
export const TABLES = {
  coils: { label: 'Coils', prefix: '0x', bit: true, writable: true, max: 2000 },
  discreteInputs: { label: 'Discrete inputs', prefix: '1x', bit: true, writable: false, max: 2000 },
  inputRegisters: { label: 'Input registers', prefix: '3x', bit: false, writable: false, max: 125 },
  holdingRegisters: { label: 'Holding registers', prefix: '4x', bit: false, writable: true, max: 125 }
}

/** Types de données et nombre de registres 16 bits occupés. */
export const DATA_TYPES = {
  Boolean: 0,
  UInt16: 1,
  Int16: 1,
  UInt32: 2,
  Int32: 2,
  Float32: 2,
  Float64: 4
}

export const REGISTER_TYPES = Object.keys(DATA_TYPES).filter((t) => DATA_TYPES[t] > 0)

/** Ordre des mots / octets pour les valeurs sur plusieurs registres (libellés : modbus.wordOrders.*). */
export const WORD_ORDERS = ['ABCD', 'CDAB', 'BADC', 'DCBA']

/** Générateurs de valeurs (libellés : simulations.*). */
export const SIMULATIONS = ['none', 'sine', 'ramp', 'random', 'toggle']


/** OID de l'extension « rôle » des certificats Modbus/TCP Security. */
export const MODBUS_ROLE_OID = '1.3.6.1.4.1.50316.802.1'

export const DEFAULT_SERVER_SECURITY = {
  mode: 'tcp', // 'tcp' | 'tls' (Modbus/TCP Security)
  minTlsVersion: 'TLSv1.2',
  requireClientCertificate: true,
  autoAcceptCertificates: true,
  roles: [
    { name: 'Operator', read: true, write: true },
    { name: 'Viewer', read: true, write: false }
  ],
  /** Rôle appliqué aux certificats sans rôle ou avec un rôle inconnu ('' = connexion refusée). */
  defaultRole: '',
  /** Adresses ou sous-réseaux autorisés (vide = tous). Ex : 192.168.1.0/24, 10.0.0.5, ::1 */
  allowedIps: [],
  maxConnections: 10,
  /** Requêtes par seconde et par connexion (0 = illimité). */
  maxRequestsPerSecond: 0,
  readOnly: false
}

export const DEFAULT_SERVER_CONFIG = {
  host: '0.0.0.0',
  port: 5020,
  unitId: 1,
  anyUnitId: false,
  updateRate: 100,
  wordOrder: 'ABCD',
  size: 10000,
  security: DEFAULT_SERVER_SECURITY,
  points: [
    { id: 'pt-1', name: 'Temperature', table: 'holdingRegisters', address: 0, dataType: 'Float32', initialValue: 20, simulation: 'sine', period: 10000, min: 15, max: 25, writable: true },
    { id: 'pt-2', name: 'Setpoint', table: 'holdingRegisters', address: 10, dataType: 'Int16', initialValue: 50, simulation: 'none', period: 1000, min: 0, max: 100, writable: true },
    { id: 'pt-3', name: 'Counter', table: 'inputRegisters', address: 0, dataType: 'UInt16', initialValue: 0, simulation: 'ramp', period: 10000, min: 0, max: 1000, writable: false },
    { id: 'pt-4', name: 'Pressure', table: 'inputRegisters', address: 10, dataType: 'Float32', initialValue: 1, simulation: 'random', period: 1000, min: 0.9, max: 1.1, writable: false },
    { id: 'pt-5', name: 'Running', table: 'coils', address: 0, dataType: 'Boolean', initialValue: true, simulation: 'toggle', period: 5000, min: 0, max: 1, writable: true },
    { id: 'pt-6', name: 'Alarm', table: 'discreteInputs', address: 0, dataType: 'Boolean', initialValue: false, simulation: 'none', period: 1000, min: 0, max: 1, writable: false }
  ]
}

export const DEFAULT_CLIENT_CONFIG = {
  host: '127.0.0.1',
  port: 5020,
  unitId: 1,
  timeout: 2000,
  pollInterval: 500,
  security: {
    mode: 'tcp',
    role: 'Operator',
    autoAcceptCertificates: true
  }
}
