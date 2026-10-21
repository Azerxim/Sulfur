import { t } from './i18n'

/** Codes des paquets RADIUS (RFC 2865, 2866, 5997). */
export const CODES = {
  1: 'Access-Request',
  2: 'Access-Accept',
  3: 'Access-Reject',
  4: 'Accounting-Request',
  5: 'Accounting-Response',
  11: 'Access-Challenge',
  12: 'Status-Server'
}

/** Valeurs nommées des attributs entiers. */
const SERVICE_TYPES = {
  1: 'Login-User',
  2: 'Framed-User',
  3: 'Callback-Login-User',
  4: 'Callback-Framed-User',
  5: 'Outbound-User',
  6: 'Administrative-User',
  7: 'NAS-Prompt-User',
  8: 'Authenticate-Only',
  10: 'Call-Check'
}
const ACCT_STATUS_TYPES = { 1: 'Start', 2: 'Stop', 3: 'Interim-Update', 7: 'Accounting-On', 8: 'Accounting-Off' }
const TERMINATE_CAUSES = {
  1: 'User-Request',
  2: 'Lost-Carrier',
  3: 'Lost-Service',
  4: 'Idle-Timeout',
  5: 'Session-Timeout',
  6: 'Admin-Reset',
  7: 'Admin-Reboot',
  8: 'Port-Error',
  9: 'NAS-Error',
  10: 'NAS-Request',
  11: 'NAS-Reboot'
}
const NAS_PORT_TYPES = { 0: 'Async', 2: 'ISDN', 5: 'Virtual', 15: 'Ethernet', 19: 'Wireless-802.11' }

/**
 * Dictionnaire des attributs pris en charge (RFC 2865, 2866, 2869, 3579) : type → { name, kind,
 * values? }. `kind` : text, string (octets), integer, ipaddr, password (User-Password masqué).
 */
export const ATTRIBUTES = {
  1: { name: 'User-Name', kind: 'text' },
  2: { name: 'User-Password', kind: 'password' },
  3: { name: 'CHAP-Password', kind: 'string' },
  4: { name: 'NAS-IP-Address', kind: 'ipaddr' },
  5: { name: 'NAS-Port', kind: 'integer' },
  6: { name: 'Service-Type', kind: 'integer', values: SERVICE_TYPES },
  7: { name: 'Framed-Protocol', kind: 'integer', values: { 1: 'PPP', 2: 'SLIP' } },
  8: { name: 'Framed-IP-Address', kind: 'ipaddr' },
  9: { name: 'Framed-IP-Netmask', kind: 'ipaddr' },
  11: { name: 'Filter-Id', kind: 'text' },
  12: { name: 'Framed-MTU', kind: 'integer' },
  18: { name: 'Reply-Message', kind: 'text' },
  24: { name: 'State', kind: 'string' },
  25: { name: 'Class', kind: 'string' },
  26: { name: 'Vendor-Specific', kind: 'vsa' },
  27: { name: 'Session-Timeout', kind: 'integer' },
  28: { name: 'Idle-Timeout', kind: 'integer' },
  30: { name: 'Called-Station-Id', kind: 'text' },
  31: { name: 'Calling-Station-Id', kind: 'text' },
  32: { name: 'NAS-Identifier', kind: 'text' },
  33: { name: 'Proxy-State', kind: 'string' },
  40: { name: 'Acct-Status-Type', kind: 'integer', values: ACCT_STATUS_TYPES },
  41: { name: 'Acct-Delay-Time', kind: 'integer' },
  42: { name: 'Acct-Input-Octets', kind: 'integer' },
  43: { name: 'Acct-Output-Octets', kind: 'integer' },
  44: { name: 'Acct-Session-Id', kind: 'text' },
  45: { name: 'Acct-Authentic', kind: 'integer', values: { 1: 'RADIUS', 2: 'Local', 3: 'Remote' } },
  46: { name: 'Acct-Session-Time', kind: 'integer' },
  47: { name: 'Acct-Input-Packets', kind: 'integer' },
  48: { name: 'Acct-Output-Packets', kind: 'integer' },
  49: { name: 'Acct-Terminate-Cause', kind: 'integer', values: TERMINATE_CAUSES },
  60: { name: 'CHAP-Challenge', kind: 'string' },
  61: { name: 'NAS-Port-Type', kind: 'integer', values: NAS_PORT_TYPES },
  79: { name: 'EAP-Message', kind: 'string' },
  80: { name: 'Message-Authenticator', kind: 'string' },
  87: { name: 'NAS-Port-Id', kind: 'text' }
}

/** Attributs propres à un constructeur, écrits par leur nom : nom → { vendor, type }. */
export const VENDOR_ATTRIBUTES = {
  'Cisco-AVPair': { vendor: 9, type: 1 }
}

export const ATTRIBUTE_TYPES = Object.fromEntries(
  Object.entries(ATTRIBUTES).map(([type, def]) => [def.name.toLowerCase(), Number(type)])
)

/** Attributs gérés par le serveur ou le client : refusés dans les attributs saisis. */
const RESERVED = new Set([2, 3, 60, 79, 80])

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

/**
 * Valeur d'un attribut saisie en texte, validée : { type, name, value } avec value = texte (text),
 * nombre (integer), adresse (ipaddr), hexadécimal « 0x… » ou texte (string), ou { vendor, vendorType,
 * value } (attribut constructeur).
 */
export function parseAttribute(name, raw) {
  const text = String(raw ?? '')
    .trim()
    .replace(/^"(.*)"$/s, '$1')
  const vendorAlias = Object.entries(VENDOR_ATTRIBUTES).find(([n]) => n.toLowerCase() === name.toLowerCase())
  if (vendorAlias) {
    const [alias, { vendor, type }] = vendorAlias
    return { type: 26, name: alias, value: { vendor, vendorType: type, value: text } }
  }
  const type = /^\d+$/.test(name) ? Number(name) : ATTRIBUTE_TYPES[name.toLowerCase()]
  if (!type || type > 255) throw new Error(t('radius.errors.unknownAttribute', { name }))
  const def = ATTRIBUTES[type] ?? { name: String(type), kind: 'string' }
  if (RESERVED.has(type)) throw new Error(t('radius.errors.reservedAttribute', { name: def.name }))
  const invalid = () => new Error(t('radius.errors.invalidValue', { name: def.name, value: text }))
  switch (def.kind) {
    case 'integer': {
      const named = Object.entries(def.values ?? {}).find(([, label]) => label.toLowerCase() === text.toLowerCase())
      const value = named ? Number(named[0]) : Number(text)
      if (text === '' || !Number.isInteger(value) || value < 0 || value > 0xffffffff) throw invalid()
      return { type, name: def.name, value }
    }
    case 'ipaddr': {
      const m = text.match(IPV4)
      if (!m || m.slice(1).some((p) => Number(p) > 255)) throw invalid()
      return { type, name: def.name, value: text }
    }
    case 'vsa': {
      // Vendor-Specific = <numéro du constructeur>:<type>:<valeur texte ou 0x…>
      const m = text.match(/^(\d+):(\d+):(.*)$/s)
      if (!m || Number(m[1]) > 0xffffffff || Number(m[2]) > 255) throw invalid()
      return { type, name: def.name, value: { vendor: Number(m[1]), vendorType: Number(m[2]), value: m[3] } }
    }
    default:
      if (!text) throw invalid()
      return { type, name: def.name, value: text }
  }
}

/**
 * Attributs saisis une ligne par attribut : « Nom = valeur » (« # » : commentaire). Retourne
 * { attributes, errors: [{ line, message }] }.
 */
export function parseAttributes(text) {
  const attributes = []
  const errors = []
  String(text ?? '')
    .split(/\r?\n/)
    .forEach((source, index) => {
      const line = source.trim()
      if (!line || line.startsWith('#')) return
      const m = line.match(/^([\w-]+)\s*[:=]\s*(.*)$/)
      try {
        if (!m) throw new Error(t('radius.errors.attributeSyntax'))
        attributes.push(parseAttribute(m[1], m[2]))
      } catch (err) {
        errors.push({ line: index + 1, message: err.message })
      }
    })
  return { attributes, errors }
}

/** Attributs saisis, ou erreur traduite (première ligne fautive). */
export function requireAttributes(text) {
  const { attributes, errors } = parseAttributes(text)
  if (errors.length) throw new Error(t('radius.errors.attributeLine', errors[0]))
  return attributes
}

/** Valeur affichable d'un attribut décodé (nom de valeur si connu). */
export function formatAttribute({ type, value }) {
  const def = ATTRIBUTES[type]
  if (value && typeof value === 'object') {
    const alias = Object.entries(VENDOR_ATTRIBUTES).find(
      ([, v]) => v.vendor === value.vendor && v.type === value.vendorType
    )
    return alias ? value.value : `${value.vendor}:${value.vendorType}:${value.value}`
  }
  if (def?.values && def.values[value]) return `${def.values[value]} (${value})`
  return String(value)
}

/** Nom affichable d'un attribut décodé. */
export function attributeName({ type, value }) {
  if (type === 26 && value && typeof value === 'object') {
    const alias = Object.entries(VENDOR_ATTRIBUTES).find(
      ([, v]) => v.vendor === value.vendor && v.type === value.vendorType
    )
    if (alias) return alias[0]
  }
  return ATTRIBUTES[type]?.name ?? `Attr-${type}`
}

/** Méthodes d'authentification du client (libellés : radius.methods.*). */
export const METHODS = ['pap', 'chap']

/** Types d'envoi d'accounting du client (libellés : radius.client.acct.*). */
export const ACCT_ACTIONS = { start: 1, interim: 3, stop: 2 }

/** Événements conservés dans le journal du serveur RADIUS. */
export const MAX_RADIUS_LOG = 500

export const DEFAULT_RADIUS_SERVER_CONFIG = {
  host: '0.0.0.0',
  /** Ports standards (au-dessus de 1024 : pas de droits administrateur). */
  authPort: 1812,
  acctPort: 1813,
  accounting: true,
  /** Refuser les Access-Request sans Message-Authenticator (protection Blast-RADIUS). */
  requireMessageAuthenticator: false,
  /** Équipements autorisés (NAS) : adresse ou réseau CIDR et secret partagé. */
  clients: [{ id: 'nas-1', name: 'any', address: '0.0.0.0/0', secret: 'testing123' }],
  /** Comptes locaux : mot de passe en clair (nécessaire à CHAP), attributs de la réponse. */
  users: [
    { id: 'user-1', username: 'operator', password: 'operator', attributes: 'Service-Type = NAS-Prompt-User' },
    {
      id: 'user-2',
      username: 'admin',
      password: 'admin',
      attributes: 'Service-Type = Administrative-User\nCisco-AVPair = shell:priv-lvl=15'
    }
  ],
  /** Comptes de l'annuaire de l'onglet Serveur LDAP, retrouvés par l'attribut `attribute`. */
  directory: { enabled: true, attribute: 'uid', attributes: 'Service-Type = Login-User' }
}

export const DEFAULT_RADIUS_CLIENT_CONFIG = {
  host: '127.0.0.1',
  authPort: 1812,
  acctPort: 1813,
  secret: 'testing123',
  timeout: 3000,
  /** Renvois après le premier envoi, sans réponse. */
  retries: 2,
  messageAuthenticator: true,
  nasIdentifier: 'sulfur',
  /** Vide : attribut NAS-IP-Address non envoyé. */
  nasIpAddress: '',
  method: 'pap',
  username: 'operator',
  password: '',
  /** Attributs ajoutés aux requêtes (« Nom = valeur », une ligne par attribut). */
  attributes: 'NAS-Port-Type = Ethernet\nService-Type = Login-User',
  sessionId: ''
}
