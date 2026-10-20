/**
 * Protocole LDAP v3 (RFC 4511) côté serveur : codage BER des messages, décodage des requêtes et
 * construction des réponses.
 */

// --- BER ------------------------------------------------------------------------------------

/** Erreur de décodage : la connexion est fermée. */
export class ProtocolError extends Error {}

function readLength(buf, pos) {
  if (pos >= buf.length) return null
  const first = buf[pos]
  if (first < 0x80) return { length: first, pos: pos + 1 }
  const count = first & 0x7f
  if (count === 0 || count > 4) throw new ProtocolError('unsupported BER length')
  if (pos + 1 + count > buf.length) return null
  let length = 0
  for (let i = 0; i < count; i++) length = length * 256 + buf[pos + 1 + i]
  return { length, pos: pos + 1 + count }
}

/** Longueur totale du premier élément d'un tampon (0 : incomplet). */
export function elementLength(buf) {
  if (buf.length < 2) return 0
  const header = readLength(buf, 1)
  if (!header) return 0
  const total = header.pos + header.length
  return buf.length >= total ? total : 0
}

/** Éléments successifs d'un contenu BER : [{ tag, value }]. */
export function children(buf) {
  const out = []
  let pos = 0
  while (pos < buf.length) {
    const tag = buf[pos]
    const header = readLength(buf, pos + 1)
    if (!header || header.pos + header.length > buf.length) throw new ProtocolError('truncated BER element')
    out.push({ tag, value: buf.subarray(header.pos, header.pos + header.length) })
    pos = header.pos + header.length
  }
  return out
}

function readInteger(value) {
  if (!value.length) return 0
  let n = value[0] & 0x80 ? -1 : 0
  for (const byte of value) n = n * 256 + byte
  return n
}

const text = (value) => value.toString('utf8')

function length(n) {
  if (n < 0x80) return Buffer.from([n])
  const bytes = []
  for (let v = n; v > 0; v = Math.floor(v / 256)) bytes.unshift(v & 0xff)
  return Buffer.from([0x80 | bytes.length, ...bytes])
}

export const tlv = (tag, ...parts) => {
  const body = Buffer.concat(parts.map((p) => (Buffer.isBuffer(p) ? p : Buffer.from(p))))
  return Buffer.concat([Buffer.from([tag]), length(body.length), body])
}

function integerBytes(n) {
  const bytes = []
  let v = n
  do {
    bytes.unshift(v & 0xff)
    v = Math.floor(v / 256)
  } while (v > 0)
  if (bytes[0] & 0x80) bytes.unshift(0)
  return Buffer.from(bytes)
}

export const integer = (n, tag = 0x02) => tlv(tag, integerBytes(n))
export const enumerated = (n) => integer(n, 0x0a)
export const octets = (value, tag = 0x04) =>
  tlv(tag, Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8'))
export const sequence = (...parts) => tlv(0x30, ...parts)
export const set = (...parts) => tlv(0x31, ...parts)

// --- Requêtes -------------------------------------------------------------------------------

/** Codes de résultat utilisés (RFC 4511, annexe A). */
export const RESULT = {
  success: 0,
  operationsError: 1,
  protocolError: 2,
  sizeLimitExceeded: 4,
  compareFalse: 5,
  compareTrue: 6,
  authMethodNotSupported: 7,
  noSuchAttribute: 16,
  noSuchObject: 32,
  invalidDNSyntax: 34,
  invalidCredentials: 49,
  insufficientAccessRights: 50,
  busy: 51,
  unavailable: 52,
  unwillingToPerform: 53,
  other: 80
}

export const OID = {
  startTls: '1.3.6.1.4.1.1466.20037',
  whoAmI: '1.3.6.1.4.1.4203.1.11.3'
}

const OPS = {
  0x60: 'bind',
  0x42: 'unbind',
  0x63: 'search',
  0x66: 'modify',
  0x68: 'add',
  0x4a: 'delete',
  0x6c: 'modifyDn',
  0x6e: 'compare',
  0x50: 'abandon',
  0x77: 'extended'
}

const SCOPES = ['base', 'one', 'sub']

/** Filtre de recherche décodé : { type, filters | filter | attribute, value, ... }. */
export function decodeFilter({ tag, value }) {
  switch (tag) {
    case 0xa0:
      return { type: 'and', filters: children(value).map(decodeFilter) }
    case 0xa1:
      return { type: 'or', filters: children(value).map(decodeFilter) }
    case 0xa2:
      return { type: 'not', filter: decodeFilter(children(value)[0]) }
    case 0xa3:
    case 0xa5:
    case 0xa6:
    case 0xa8: {
      const [attribute, assertion] = children(value)
      const type = { 0xa3: 'equal', 0xa5: 'ge', 0xa6: 'le', 0xa8: 'approx' }[tag]
      return { type, attribute: text(attribute.value), value: text(assertion.value) }
    }
    case 0xa4: {
      const [attribute, list] = children(value)
      const parts = { initial: null, any: [], final: null }
      for (const part of children(list.value)) {
        if (part.tag === 0x80) parts.initial = text(part.value)
        else if (part.tag === 0x81) parts.any.push(text(part.value))
        else if (part.tag === 0x82) parts.final = text(part.value)
      }
      return { type: 'substrings', attribute: text(attribute.value), ...parts }
    }
    case 0x87:
      return { type: 'present', attribute: text(value) }
    case 0xa9:
      return { type: 'extensible' }
    default:
      throw new ProtocolError(`unknown filter 0x${tag.toString(16)}`)
  }
}

const escapeFilter = (v) => v.replace(/[\\*()\0]/g, (c) => `\\${c.charCodeAt(0).toString(16).padStart(2, '0')}`)

/** Représentation textuelle d'un filtre (RFC 4515), pour le journal. */
export function filterToString(f) {
  switch (f.type) {
    case 'and':
      return `(&${f.filters.map(filterToString).join('')})`
    case 'or':
      return `(|${f.filters.map(filterToString).join('')})`
    case 'not':
      return `(!${filterToString(f.filter)})`
    case 'equal':
      return `(${f.attribute}=${escapeFilter(f.value)})`
    case 'ge':
      return `(${f.attribute}>=${escapeFilter(f.value)})`
    case 'le':
      return `(${f.attribute}<=${escapeFilter(f.value)})`
    case 'approx':
      return `(${f.attribute}~=${escapeFilter(f.value)})`
    case 'present':
      return `(${f.attribute}=*)`
    case 'substrings':
      return `(${f.attribute}=${[f.initial ?? '', ...f.any, f.final ?? ''].map(escapeFilter).join('*')})`
    default:
      return '(?)'
  }
}

/** Décode un message LDAP complet : { id, op, ... }. Lève ProtocolError s'il est mal formé. */
export function decodeMessage(buf) {
  const [root] = children(buf)
  if (!root || root.tag !== 0x30) throw new ProtocolError('LDAPMessage expected')
  const [idElement, opElement] = children(root.value)
  if (!idElement || idElement.tag !== 0x02 || !opElement) throw new ProtocolError('invalid LDAPMessage')
  const id = readInteger(idElement.value)
  const op = OPS[opElement.tag] ?? 'unknown'
  const fields = opElement.tag & 0x20 ? children(opElement.value) : []
  switch (op) {
    case 'bind': {
      const [version, name, auth] = fields
      return {
        id,
        op,
        version: readInteger(version.value),
        name: text(name.value),
        simple: auth.tag === 0x80,
        password: auth.tag === 0x80 ? text(auth.value) : null
      }
    }
    case 'search': {
      const [base, scope, , sizeLimit, , typesOnly, filter, attributes] = fields
      return {
        id,
        op,
        base: text(base.value),
        scope: SCOPES[readInteger(scope.value)] ?? 'sub',
        sizeLimit: readInteger(sizeLimit.value),
        typesOnly: typesOnly.value[0] !== 0,
        filter: decodeFilter(filter),
        attributes: children(attributes.value).map((a) => text(a.value))
      }
    }
    case 'compare': {
      const [entry, ava] = fields
      const [attribute, value] = children(ava.value)
      return { id, op, dn: text(entry.value), attribute: text(attribute.value), value: text(value.value) }
    }
    case 'extended': {
      const name = fields.find((f) => f.tag === 0x80)
      return { id, op, name: name ? text(name.value) : '' }
    }
    case 'delete':
      return { id, op, dn: text(opElement.value) }
    case 'add':
    case 'modify':
    case 'modifyDn':
      return { id, op, dn: fields[0] ? text(fields[0].value) : '' }
    default:
      return { id, op, tag: opElement.tag }
  }
}

// --- Réponses -------------------------------------------------------------------------------

const RESPONSE_TAGS = {
  bind: 0x61,
  searchDone: 0x65,
  modify: 0x67,
  add: 0x69,
  delete: 0x6b,
  modifyDn: 0x6d,
  compare: 0x6f,
  extended: 0x78
}

const message = (id, op) => sequence(integer(id), op)

/** Réponse de type LDAPResult (bind, fin de recherche, compare…), éventuellement complétée. */
export function resultMessage(id, kind, code, { matchedDn = '', diagnostic = '', extra = [] } = {}) {
  return message(id, tlv(RESPONSE_TAGS[kind], enumerated(code), octets(matchedDn), octets(diagnostic), ...extra))
}

/** Réponse à une opération étendue : nom (OID) et valeur facultatifs. */
export function extendedMessage(id, code, { name, value, diagnostic = '' } = {}) {
  const extra = []
  if (name) extra.push(octets(name, 0x8a))
  if (value !== undefined) extra.push(octets(value, 0x8b))
  return resultMessage(id, 'extended', code, { diagnostic, extra })
}

/** Entrée de résultat de recherche : attributs { nom: [valeurs] } (valeurs omises si `typesOnly`). */
export function entryMessage(id, dn, attributes, typesOnly = false) {
  const list = Object.entries(attributes).map(([name, values]) =>
    sequence(octets(name), set(...(typesOnly ? [] : values.map((v) => octets(v)))))
  )
  return message(id, tlv(0x64, octets(dn), sequence(...list)))
}

/** Avis de déconnexion (notice of disconnection, RFC 4511 § 4.4.1). */
export const disconnectionMessage = (code, diagnostic) =>
  sequence(
    integer(0),
    tlv(0x78, enumerated(code), octets(''), octets(diagnostic), octets('1.3.6.1.4.1.1466.20036', 0x8a))
  )
