import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { ATTRIBUTES } from '../../shared/radius'
import { t } from '../../shared/i18n'

/** Codes des paquets utilisés par le serveur et le client. */
export const CODE = {
  accessRequest: 1,
  accessAccept: 2,
  accessReject: 3,
  accountingRequest: 4,
  accountingResponse: 5,
  statusServer: 12
}

export const ATTR = {
  userName: 1,
  userPassword: 2,
  chapPassword: 3,
  nasIpAddress: 4,
  replyMessage: 18,
  vendorSpecific: 26,
  nasIdentifier: 32,
  proxyState: 33,
  acctStatusType: 40,
  acctSessionId: 44,
  acctSessionTime: 46,
  chapChallenge: 60,
  eapMessage: 79,
  messageAuthenticator: 80
}

const HEADER = 20
/** Taille maximale d'un paquet (RFC 2865 § 3). */
export const MAX_PACKET = 4096

export class ProtocolError extends Error {}

const md5 = (...parts) => {
  const hash = createHash('md5')
  for (const part of parts) hash.update(part)
  return hash.digest()
}

const safeEqual = (a, b) => a.length === b.length && timingSafeEqual(a, b)

/** Octets d'une valeur « string » saisie : hexadécimal « 0x… » ou texte UTF-8. */
const stringBytes = (value) =>
  Buffer.isBuffer(value)
    ? value
    : /^0x([0-9a-f]{2})+$/i.test(value)
      ? Buffer.from(value.slice(2), 'hex')
      : Buffer.from(String(value), 'utf8')

/** Attribut codé (type, longueur, valeur) d'un attribut { type, value } (voir parseAttribute). */
export function encodeAttribute({ type, value }) {
  const kind = ATTRIBUTES[type]?.kind ?? 'string'
  let data
  if (kind === 'integer') {
    data = Buffer.alloc(4)
    data.writeUInt32BE(value)
  } else if (kind === 'ipaddr') {
    data = Buffer.from(String(value).split('.').map(Number))
  } else if (kind === 'vsa' && value && typeof value === 'object' && !Buffer.isBuffer(value)) {
    const inner = stringBytes(value.value)
    data = Buffer.concat([Buffer.alloc(4), Buffer.from([value.vendorType, inner.length + 2]), inner])
    data.writeUInt32BE(value.vendor)
  } else if (kind === 'text') {
    data = Buffer.from(String(value), 'utf8')
  } else {
    data = stringBytes(value)
  }
  if (data.length > 253) {
    throw new Error(t('radius.errors.attributeTooLong', { name: ATTRIBUTES[type]?.name ?? type }))
  }
  return Buffer.concat([Buffer.from([type, data.length + 2]), data])
}

/** Valeur lisible d'octets : texte s'ils en forment un, sinon hexadécimal « 0x… ». */
function readable(bytes) {
  const text = bytes.toString('utf8')
  return bytes.length && !text.includes('\uFFFD') && /^[\x20-\x7e\u00a0-\uffff]*$/.test(text)
    ? text
    : `0x${bytes.toString('hex')}`
}

/** Valeur décodée d'un attribut (même forme que parseAttribute). */
function decodeValue(type, data) {
  switch (ATTRIBUTES[type]?.kind) {
    case 'integer':
      return data.length === 4 ? data.readUInt32BE(0) : `0x${data.toString('hex')}`
    case 'ipaddr':
      return data.length === 4 ? [...data].join('.') : `0x${data.toString('hex')}`
    case 'text':
      return data.toString('utf8')
    case 'password':
      return '********'
    case 'vsa': {
      // Un seul sous-attribut au format habituel (RFC 2865 § 5.26) ; sinon valeur brute.
      if (data.length >= 6 && data[5] === data.length - 4) {
        return { vendor: data.readUInt32BE(0), vendorType: data[4], value: readable(data.subarray(6)) }
      }
      return `0x${data.toString('hex')}`
    }
    default:
      return readable(data)
  }
}

/** Paquet RADIUS lu : { code, id, authenticator, attributes: [{ type, data, value }] }. */
export function decodePacket(buffer) {
  if (buffer.length < HEADER) throw new ProtocolError(t('radius.log.tooShort'))
  const length = buffer.readUInt16BE(2)
  if (length < HEADER || length > MAX_PACKET || length > buffer.length) {
    throw new ProtocolError(t('radius.log.badLength', { length }))
  }
  const attributes = []
  let offset = HEADER
  while (offset < length) {
    const type = buffer[offset]
    const size = buffer[offset + 1]
    if (offset + 1 >= length || size < 2 || offset + size > length) {
      throw new ProtocolError(t('radius.log.badAttribute', { offset }))
    }
    const data = buffer.subarray(offset + 2, offset + size)
    attributes.push({ type, data, value: decodeValue(type, data) })
    offset += size
  }
  return {
    code: buffer[0],
    id: buffer[1],
    authenticator: buffer.subarray(4, HEADER),
    attributes,
    raw: buffer.subarray(0, length)
  }
}

/** Premier attribut d'un type donné (octets), ou null. */
export const attribute = (packet, type) => packet.attributes.find((a) => a.type === type)?.data ?? null

/** Assemble un paquet : en-tête, authentificateur (16 octets) et attributs codés. */
export function encodePacket(code, id, authenticator, attributes) {
  const body = Buffer.concat(attributes)
  const length = HEADER + body.length
  if (length > MAX_PACKET) throw new Error(t('radius.errors.packetTooLarge'))
  const header = Buffer.alloc(4)
  header[0] = code
  header[1] = id
  header.writeUInt16BE(length, 2)
  return Buffer.concat([header, authenticator, body])
}

const ZERO_MA = encodeAttributeRaw(ATTR.messageAuthenticator, Buffer.alloc(16))

function encodeAttributeRaw(type, data) {
  return Buffer.concat([Buffer.from([type, data.length + 2]), data])
}

/** Position de la valeur de Message-Authenticator dans un paquet (-1 s'il n'en a pas). */
function messageAuthenticatorOffset(packet) {
  let offset = HEADER
  while (offset + 1 < packet.length) {
    if (packet[offset] === ATTR.messageAuthenticator && packet[offset + 1] === 18) return offset + 2
    offset += Math.max(2, packet[offset + 1])
  }
  return -1
}

/**
 * Message-Authenticator (RFC 3579 § 3.2) : HMAC-MD5 du paquet, valeur de l'attribut à zéro et champ
 * authentificateur égal à `authenticator` (celui de la requête pour une réponse).
 */
function computeMessageAuthenticator(packet, secret, authenticator) {
  const copy = Buffer.from(packet)
  authenticator.copy(copy, 4)
  const offset = messageAuthenticatorOffset(copy)
  copy.fill(0, offset, offset + 16)
  return createHmac('md5', secret).update(copy).digest()
}

/** Message-Authenticator d'un paquet reçu : true (valide), false (faux) ou null (absent). */
export function checkMessageAuthenticator(packet, secret, authenticator = packet.subarray(4, HEADER)) {
  const offset = messageAuthenticatorOffset(packet)
  if (offset < 0) return null
  return safeEqual(packet.subarray(offset, offset + 16), computeMessageAuthenticator(packet, secret, authenticator))
}

/**
 * User-Password masqué (RFC 2865 § 5.2) : mot de passe complété par des zéros à un multiple de 16
 * octets, combiné par OU exclusif avec MD5(secret + authentificateur), puis du bloc précédent.
 */
export function hidePassword(password, secret, authenticator) {
  const plain = Buffer.from(String(password), 'utf8')
  if (plain.length > 128) throw new Error(t('radius.errors.passwordTooLong'))
  const padded = Buffer.alloc(Math.max(16, Math.ceil(plain.length / 16) * 16))
  plain.copy(padded)
  const out = Buffer.alloc(padded.length)
  let previous = authenticator
  for (let i = 0; i < padded.length; i += 16) {
    const key = md5(Buffer.from(secret, 'utf8'), previous)
    for (let j = 0; j < 16; j++) out[i + j] = padded[i + j] ^ key[j]
    previous = out.subarray(i, i + 16)
  }
  return out
}

/** Mot de passe d'un User-Password masqué (null si sa longueur est invalide). */
export function revealPassword(hidden, secret, authenticator) {
  if (!hidden.length || hidden.length % 16 || hidden.length > 128) return null
  const out = Buffer.alloc(hidden.length)
  let previous = authenticator
  for (let i = 0; i < hidden.length; i += 16) {
    const key = md5(Buffer.from(secret, 'utf8'), previous)
    for (let j = 0; j < 16; j++) out[i + j] = hidden[i + j] ^ key[j]
    previous = hidden.subarray(i, i + 16)
  }
  const end = out.indexOf(0)
  return out.subarray(0, end < 0 ? out.length : end).toString('utf8')
}

/** Réponse CHAP (RFC 1994) : MD5(identifiant + mot de passe + défi). */
export const chapResponse = (chapId, password, challenge) =>
  md5(Buffer.from([chapId]), Buffer.from(String(password), 'utf8'), challenge)

/** CHAP-Password reçu vérifié contre un mot de passe en clair. */
export function checkChap(chapPassword, password, challenge) {
  if (chapPassword?.length !== 17) return false
  return safeEqual(chapPassword.subarray(1), chapResponse(chapPassword[0], password, challenge))
}

/**
 * Requête signée : Access-Request ou Status-Server (authentificateur aléatoire, Message-Authenticator
 * en option), ou Accounting-Request (authentificateur MD5 du paquet, RFC 2866 § 3).
 */
export function buildRequest(code, id, attributes, secret, { messageAuthenticator = false, authenticator } = {}) {
  const accounting = code === CODE.accountingRequest
  const requestAuthenticator = accounting ? Buffer.alloc(16) : (authenticator ?? randomBytes(16))
  const list = messageAuthenticator && !accounting ? [...attributes, ZERO_MA] : attributes
  const packet = encodePacket(code, id, requestAuthenticator, list)
  if (accounting) {
    md5(packet, Buffer.from(secret, 'utf8')).copy(packet, 4)
  } else if (messageAuthenticator) {
    computeMessageAuthenticator(packet, secret, requestAuthenticator).copy(packet, messageAuthenticatorOffset(packet))
  }
  return packet
}

/**
 * Réponse signée à `request` : Message-Authenticator (si demandé), puis authentificateur de réponse
 * MD5(code + id + longueur + authentificateur de la requête + attributs + secret).
 */
export function buildResponse(code, request, attributes, secret, { messageAuthenticator = false } = {}) {
  const list = messageAuthenticator ? [...attributes, ZERO_MA] : attributes
  const packet = encodePacket(code, request.id, request.authenticator, list)
  if (messageAuthenticator) {
    computeMessageAuthenticator(packet, secret, request.authenticator).copy(packet, messageAuthenticatorOffset(packet))
  }
  md5(packet, Buffer.from(secret, 'utf8')).copy(packet, 4)
  return packet
}

/** Authentificateur d'une Accounting-Request reçue vérifié (RFC 2866 § 3). */
export function checkAccountingRequest(raw, secret) {
  const copy = Buffer.from(raw)
  copy.fill(0, 4, HEADER)
  return safeEqual(raw.subarray(4, HEADER), md5(copy, Buffer.from(secret, 'utf8')))
}

/** Authentificateur d'une réponse vérifié contre celui de la requête envoyée. */
export function checkResponse(raw, requestAuthenticator, secret) {
  const copy = Buffer.from(raw)
  requestAuthenticator.copy(copy, 4)
  return safeEqual(raw.subarray(4, HEADER), md5(copy, Buffer.from(secret, 'utf8')))
}
