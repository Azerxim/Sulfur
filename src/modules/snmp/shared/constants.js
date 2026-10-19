export const SNMP_MODULE = {
  id: 'snmp',
  name: 'SNMP',
  description: 'Agent SNMP simulé (v1 / v2c / v3, MIB simulée, traps) et manager SNMP'
}

/** Versions du protocole (libellés : snmp.versions.*). */
export const VERSIONS = ['v1', 'v2c', 'v3']

/** Types des objets (noms SMIv2 ; libellés identiques dans toutes les langues). */
export const OBJECT_TYPES = ['Integer', 'Counter32', 'Gauge32', 'TimeTicks', 'OctetString', 'IpAddress', 'OID']

/** Types numériques : simulables et publiés comme points numériques. */
export const NUMERIC_TYPES = ['Integer', 'Counter32', 'Gauge32', 'TimeTicks']

/** Générateurs de valeurs (libellés : simulations.*). */
export const SIMULATIONS = ['none', 'sine', 'ramp', 'random', 'toggle']

/** Niveaux de sécurité SNMPv3 (libellés : snmp.levels.*). */
export const SECURITY_LEVELS = ['noAuthNoPriv', 'authNoPriv', 'authPriv']

export const AUTH_PROTOCOLS = ['md5', 'sha', 'sha224', 'sha256', 'sha384', 'sha512']

/** Chiffrement : DES, AES-128, AES-256 (variantes Blumenthal et Reeder). */
export const PRIV_PROTOCOLS = ['des', 'aes', 'aes256b', 'aes256r']

/** Opérations du manager (libellés : snmp.operations.*). */
export const OPERATIONS = ['get', 'getNext', 'getBulk', 'walk', 'set']

/** Codes d'erreur proposés pour le défaut « exception forcée » (RFC 3416). */
export const FAULT_ERRORS = [
  { code: 5, name: 'genErr' },
  { code: 1, name: 'tooBig' },
  { code: 2, name: 'noSuchName' },
  { code: 3, name: 'badValue' },
  { code: 6, name: 'noAccess' },
  { code: 13, name: 'resourceUnavailable' },
  { code: 16, name: 'authorizationError' }
]

/** Groupe système (MIB-II) servi par l'agent, et préfixe d'entreprise de documentation (RFC 5612). */
export const SYSTEM_OID = '1.3.6.1.2.1.1'
export const ENTERPRISE_OID = '1.3.6.1.4.1.32473'

/** Clé SNMPv3 : 8 caractères au moins. */
export const MIN_KEY_LENGTH = 8

/** Entrées conservées dans les journaux, traps reçus, résultats d'un parcours (walk). */
export const MAX_LOG = 500
export const MAX_TRAPS = 500
export const MAX_WALK = 5000

/** Utilisateur SNMPv3 par défaut de l'agent et du manager (banc de test : clés connues). */
export const DEFAULT_USER = {
  name: 'sulfur',
  level: 'authPriv',
  authProtocol: 'sha256',
  authKey: 'sulfur-auth-key',
  privProtocol: 'aes',
  privKey: 'sulfur-priv-key'
}

export const DEFAULT_AGENT_CONFIG = {
  host: '0.0.0.0',
  // 161 est le port standard (droits administrateur requis sous Linux).
  port: 1161,
  readCommunity: 'public',
  writeCommunity: 'private',
  /** Utilisateurs SNMPv3 (accès en lecture et écriture). Les clés sont enregistrées en clair. */
  users: [DEFAULT_USER],
  /** Vide : identifiant de moteur SNMPv3 généré au démarrage. */
  engineId: '',
  updateRate: 100,
  system: {
    descr: 'Sulfur simulated SNMP agent',
    objectId: `${ENTERPRISE_OID}.1`,
    contact: 'admin@example.com',
    name: 'sulfur-agent',
    location: 'Test bench'
  },
  objects: [
    {
      id: 'temperature',
      name: 'temperature',
      oid: `${ENTERPRISE_OID}.1.1`,
      type: 'Integer',
      initialValue: 20,
      simulation: 'sine',
      period: 20000,
      min: 15,
      max: 25,
      writable: false
    },
    {
      id: 'packets',
      name: 'packets',
      oid: `${ENTERPRISE_OID}.1.2`,
      type: 'Counter32',
      initialValue: 0,
      simulation: 'ramp',
      period: 60000,
      min: 0,
      max: 6000,
      writable: false
    },
    {
      id: 'label',
      name: 'label',
      oid: `${ENTERPRISE_OID}.1.3`,
      type: 'OctetString',
      initialValue: 'Line 1',
      simulation: 'none',
      period: 1000,
      min: 0,
      max: 1,
      writable: true
    }
  ],
  traps: {
    /** OID de la notification (snmpTrapOID). */
    oid: `${ENTERPRISE_OID}.0.1`,
    /** Objets joints à la notification (identifiants). */
    objects: ['temperature'],
    targets: [{ id: 'local', host: '127.0.0.1', port: 1162, version: 'v2c', community: 'public', inform: false }]
  }
}

export const DEFAULT_MANAGER_CONFIG = {
  host: '127.0.0.1',
  port: 1161,
  version: 'v3',
  community: 'public',
  user: DEFAULT_USER,
  timeout: 2000,
  retries: 1,
  request: { operation: 'get', oid: '1.3.6.1.2.1.1.1.0', type: 'OctetString', value: '', maxRepetitions: 10 },
  /** OID surveillés (points) : lus ensemble toutes les `pollInterval` s. */
  monitors: [{ id: 'uptime', oid: '1.3.6.1.2.1.1.3.0', label: 'sysUpTime' }],
  pollInterval: 5,
  receiver: { host: '0.0.0.0', port: 1162 }
}
