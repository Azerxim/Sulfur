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

export const SECURITY_MODES = {
  None: 'Aucune',
  Sign: 'Signature',
  SignAndEncrypt: 'Signature et chiffrement'
}

/** Politiques de sécurité (hors None, implicite avec le mode "None"). */
export const SECURITY_POLICIES = {
  Basic256Sha256: 'Basic256Sha256',
  Aes128_Sha256_RsaOaep: 'Aes128-Sha256-RsaOaep',
  Aes256_Sha256_RsaPss: 'Aes256-Sha256-RsaPss',
  Basic256: 'Basic256 (obsolète)',
  Basic128Rsa15: 'Basic128Rsa15 (obsolète)'
}

export const DEFAULT_SERVER_SECURITY = {
  modes: ['None', 'Sign', 'SignAndEncrypt'],
  policies: ['Basic256Sha256', 'Aes128_Sha256_RsaOaep', 'Aes256_Sha256_RsaPss'],
  allowAnonymous: true,
  users: [{ username: 'admin', password: 'admin' }],
  autoAcceptCertificates: true
}

export const DEFAULT_CLIENT_SECURITY = {
  mode: 'None',
  policy: 'None',
  auth: 'anonymous',
  username: '',
  password: '',
  autoAcceptCertificates: true
}

export const DEFAULT_SERVER_CONFIG = {
  port: 4840,
  resourcePath: '/UA/Sulfur',
  rootFolder: 'Simulation',
  updateRate: 100,
  security: DEFAULT_SERVER_SECURITY,
  variables: [
    { id: 'var-1', name: 'Temperature', dataType: 'Double', initialValue: 20, simulation: 'sine', period: 10000, min: 15, max: 25, writable: true },
    { id: 'var-2', name: 'Pressure', dataType: 'Double', initialValue: 1, simulation: 'random', period: 1000, min: 0.9, max: 1.1, writable: true },
    { id: 'var-3', name: 'Counter', dataType: 'Int32', initialValue: 0, simulation: 'ramp', period: 10000, min: 0, max: 100, writable: true },
    { id: 'var-4', name: 'Running', dataType: 'Boolean', initialValue: true, simulation: 'toggle', period: 5000, min: 0, max: 1, writable: true },
    { id: 'var-5', name: 'Label', dataType: 'String', initialValue: 'Sulfur', simulation: 'none', period: 1000, min: 0, max: 0, writable: true }
  ]
}

export const ROOT_NODES = [
  { nodeId: 'i=85', displayName: 'Objects', nodeClass: 'Object' },
  { nodeId: 'i=86', displayName: 'Types', nodeClass: 'Object' },
  { nodeId: 'i=87', displayName: 'Views', nodeClass: 'Object' }
]
