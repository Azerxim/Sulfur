import { builtinManifest } from '@modules/builtin'
export const OPCUA_MODULE = builtinManifest({
  id: 'opcua',
  name: 'OPC UA',
  description: 'Serveur et client OPC UA (Sign / SignAndEncrypt, certificats)'
})

export const DATA_TYPES = ['Double', 'Float', 'Int32', 'UInt32', 'Int16', 'Boolean', 'String']

/** Types sur lesquels une alarme à seuils peut porter. */
export const NUMERIC_TYPES = DATA_TYPES.filter((type) => !['Boolean', 'String'].includes(type))

/** Générateurs de valeurs (libellés : simulations.*). */
export const SIMULATIONS = ['none', 'sine', 'ramp', 'random', 'toggle']

/** Comportements des méthodes simulées (libellés : opcua.methods.behaviors.*). */
export const METHOD_BEHAVIORS = ['echo', 'variables', 'fail']

/** Codes d'état renvoyés par une méthode en échec. */
export const METHOD_FAILURES = [
  'BadInvalidArgument',
  'BadOutOfRange',
  'BadInvalidState',
  'BadUserAccessDenied',
  'BadNotImplemented',
  'BadInternalError'
]

/** Seuils d'une alarme, du plus haut au plus bas (vides = absents). */
export const ALARM_LIMITS = ['highHigh', 'high', 'low', 'lowLow']

/** Nombre de valeurs conservées par variable historisée. */
export const HISTORY_MAX_VALUES = 10000

/** Durées proposées pour la lecture d'historique côté client (ms). */
export const HISTORY_RANGES = [60_000, 600_000, 3_600_000, 86_400_000]

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
  Basic256: 'Basic256',
  Basic128Rsa15: 'Basic128Rsa15'
}

/** Politiques conservées pour la compatibilité mais déconseillées. */
export const DEPRECATED_POLICIES = ['Basic256', 'Basic128Rsa15']

export const DEFAULT_SERVER_SECURITY = {
  modes: ['None', 'Sign', 'SignAndEncrypt'],
  policies: ['Basic256Sha256', 'Aes128_Sha256_RsaOaep', 'Aes256_Sha256_RsaPss'],
  allowAnonymous: true,
  // Utilisateur par défaut admin / admin (seule l'empreinte scrypt est conservée)
  users: [
    { username: 'admin', passwordHash: 'scrypt$mbUEZRBI1M8Kevl1/G39dg==$lMVG0wqpSC7IQcuJl1Kw1Xi3bKVvt7wrE59pCNfA4ww=' }
  ],
  autoAcceptCertificates: true
}

/** Client : politique de sécurité la plus récente (OPC UA 1.04), signature et chiffrement. */
export const DEFAULT_CLIENT_SECURITY = {
  mode: 'SignAndEncrypt',
  policy: 'Aes256_Sha256_RsaPss',
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
    {
      id: 'var-1',
      name: 'Temperature',
      dataType: 'Double',
      initialValue: 20,
      simulation: 'sine',
      period: 10000,
      min: 15,
      max: 25,
      writable: true,
      historizing: true
    },
    {
      id: 'var-2',
      name: 'Pressure',
      dataType: 'Double',
      initialValue: 1,
      simulation: 'random',
      period: 1000,
      min: 0.9,
      max: 1.1,
      writable: true
    },
    {
      id: 'var-3',
      name: 'Counter',
      dataType: 'Int32',
      initialValue: 0,
      simulation: 'ramp',
      period: 10000,
      min: 0,
      max: 100,
      writable: true
    },
    {
      id: 'var-4',
      name: 'Running',
      dataType: 'Boolean',
      initialValue: true,
      simulation: 'toggle',
      period: 5000,
      min: 0,
      max: 1,
      writable: true
    },
    {
      id: 'var-5',
      name: 'Label',
      dataType: 'String',
      initialValue: 'Sulfur',
      simulation: 'none',
      period: 1000,
      min: 0,
      max: 0,
      writable: true
    },
    {
      id: 'var-6',
      name: 'Levels',
      dataType: 'Double',
      arrayLength: 4,
      initialValue: '0, 0, 0, 0',
      simulation: 'sine',
      period: 8000,
      min: 0,
      max: 100,
      writable: true
    }
  ],
  structures: [],
  methods: [
    {
      id: 'method-1',
      name: 'SetLabel',
      inputs: [{ name: 'Label', dataType: 'String', array: false }],
      outputs: [{ name: 'Counter', dataType: 'Int32', array: false }],
      behavior: 'variables',
      statusCode: 'BadInvalidArgument'
    }
  ],
  alarms: [
    { id: 'alarm-1', name: 'TemperatureAlarm', variable: 'var-1', highHigh: 24.5, high: 23, low: '', lowLow: '' }
  ]
}

export const ROOT_NODES = [
  { nodeId: 'i=85', displayName: 'Objects', nodeClass: 'Object' },
  { nodeId: 'i=86', displayName: 'Types', nodeClass: 'Object' },
  { nodeId: 'i=87', displayName: 'Views', nodeClass: 'Object' }
]
