import { intToIp, ipToInt, isIPv4 } from '@azerxim/sulfur-sdk'
/** Paquets DHCP (RFC 2131) et options (RFC 2132). */

export const OP = { REQUEST: 1, REPLY: 2 }

export const TYPE = { DISCOVER: 1, OFFER: 2, REQUEST: 3, DECLINE: 4, ACK: 5, NAK: 6, RELEASE: 7, INFORM: 8 }
export const TYPE_NAMES = Object.fromEntries(Object.entries(TYPE).map(([name, value]) => [value, name]))

export const OPTION = {
  PAD: 0,
  SUBNET_MASK: 1,
  ROUTER: 3,
  DNS: 6,
  HOSTNAME: 12,
  DOMAIN: 15,
  REQUESTED_IP: 50,
  LEASE_TIME: 51,
  MESSAGE_TYPE: 53,
  SERVER_ID: 54,
  PARAMETERS: 55,
  MESSAGE: 56,
  RENEWAL: 58,
  REBINDING: 59,
  CLIENT_ID: 61,
  END: 255
}

/** Indicateur « réponse en diffusion » du champ flags. */
export const BROADCAST_FLAG = 0x8000

const MAGIC_COOKIE = 0x63825363
const HEADER_SIZE = 236
const MIN_SIZE = HEADER_SIZE + 4
/** Taille minimale d'un message BOOTP (RFC 951) : les réponses sont complétées jusqu'à elle. */
const BOOTP_MIN_SIZE = 300

const MAC = /^([0-9a-f]{2})([:-]?)([0-9a-f]{2})\2([0-9a-f]{2})\2([0-9a-f]{2})\2([0-9a-f]{2})\2([0-9a-f]{2})$/i

/** Adresse MAC normalisée (aa:bb:cc:dd:ee:ff), null si invalide. Séparateurs « : », « - » ou aucun. */
export function normalizeMac(text) {
  const match = String(text ?? '')
    .trim()
    .match(MAC)
  if (!match) return null
  return [1, 3, 4, 5, 6, 7].map((i) => match[i].toLowerCase()).join(':')
}

const macToBuffer = (mac) => Buffer.from(mac.split(':').map((h) => parseInt(h, 16)))
const readIp = (buf, offset) => intToIp(buf.readUInt32BE(offset))
const ipBuffer = (ip) => {
  const buf = Buffer.alloc(4)
  buf.writeUInt32BE(ip && isIPv4(ip) ? ipToInt(ip) : 0)
  return buf
}

/** Lecture des options (après le magic cookie). Une option répétée est concaténée (RFC 3396). */
function readOptions(buf, offset) {
  const options = new Map()
  while (offset < buf.length) {
    const code = buf[offset++]
    if (code === OPTION.PAD) continue
    if (code === OPTION.END) break
    if (offset >= buf.length) throw new Error('truncated option')
    const length = buf[offset++]
    if (offset + length > buf.length) throw new Error('truncated option')
    const value = buf.subarray(offset, offset + length)
    options.set(code, options.has(code) ? Buffer.concat([options.get(code), value]) : Buffer.from(value))
    offset += length
  }
  return options
}

const optionIp = (value) => (value?.length === 4 ? readIp(value, 0) : null)
const optionIps = (value) => {
  const list = []
  for (let i = 0; value && i + 4 <= value.length; i += 4) list.push(readIp(value, i))
  return list
}
const optionText = (value) => (value ? value.toString('utf8').replace(/\0+$/, '') : null)
const optionUInt32 = (value) => (value?.length === 4 ? value.readUInt32BE(0) : null)

/**
 * Décodage d'un paquet DHCP. Lève une erreur s'il n'en est pas un (taille, magic cookie, type de
 * message absent ou inconnu).
 */
export function decode(buf) {
  if (buf.length < MIN_SIZE) throw new Error('packet too short')
  if (buf.readUInt32BE(HEADER_SIZE) !== MAGIC_COOKIE) throw new Error('not a DHCP packet')
  const options = readOptions(buf, MIN_SIZE)
  const type = options.get(OPTION.MESSAGE_TYPE)?.[0]
  if (!TYPE_NAMES[type]) throw new Error('missing message type')
  const htype = buf[1]
  const hlen = buf[2]
  return {
    op: buf[0],
    htype,
    hlen,
    hops: buf[3],
    xid: buf.readUInt32BE(4),
    secs: buf.readUInt16BE(8),
    flags: buf.readUInt16BE(10),
    ciaddr: readIp(buf, 12),
    yiaddr: readIp(buf, 16),
    siaddr: readIp(buf, 20),
    giaddr: readIp(buf, 24),
    // Ethernet uniquement (htype 1, hlen 6) : autre matériel, adresse non lue.
    chaddr:
      htype === 1 && hlen === 6
        ? [...buf.subarray(28, 34)].map((b) => b.toString(16).padStart(2, '0')).join(':')
        : null,
    type,
    options,
    subnetMask: optionIp(options.get(OPTION.SUBNET_MASK)),
    routers: optionIps(options.get(OPTION.ROUTER)),
    dns: optionIps(options.get(OPTION.DNS)),
    hostname: optionText(options.get(OPTION.HOSTNAME)),
    domain: optionText(options.get(OPTION.DOMAIN)),
    requestedIp: optionIp(options.get(OPTION.REQUESTED_IP)),
    leaseTime: optionUInt32(options.get(OPTION.LEASE_TIME)),
    serverId: optionIp(options.get(OPTION.SERVER_ID)),
    message: optionText(options.get(OPTION.MESSAGE)),
    parameters: [...(options.get(OPTION.PARAMETERS) ?? [])]
  }
}

/** Valeur d'une option à encoder : adresse(s) IP, texte, entier 32 bits ou octets bruts. */
function optionValue(code, value) {
  if (Buffer.isBuffer(value)) return value
  switch (code) {
    case OPTION.SUBNET_MASK:
    case OPTION.REQUESTED_IP:
    case OPTION.SERVER_ID:
      return ipBuffer(value)
    case OPTION.ROUTER:
    case OPTION.DNS:
      return Buffer.concat([].concat(value).map(ipBuffer))
    case OPTION.LEASE_TIME:
    case OPTION.RENEWAL:
    case OPTION.REBINDING: {
      const buf = Buffer.alloc(4)
      buf.writeUInt32BE(value)
      return buf
    }
    case OPTION.MESSAGE_TYPE:
      return Buffer.from([value])
    case OPTION.PARAMETERS:
      return Buffer.from(value)
    default:
      return Buffer.from(String(value), 'utf8')
  }
}

/**
 * Encodage d'un paquet. `options` : [[code, valeur], …] dans l'ordre d'écriture (le type de message
 * est ajouté en tête) ; une valeur de plus de 255 octets est découpée en plusieurs options.
 */
export function encode({ op, type, xid, secs = 0, flags = 0, ciaddr, yiaddr, siaddr, giaddr, chaddr, options = [] }) {
  const header = Buffer.alloc(MIN_SIZE)
  header[0] = op
  header[1] = 1
  header[2] = 6
  header.writeUInt32BE(xid >>> 0, 4)
  header.writeUInt16BE(secs, 8)
  header.writeUInt16BE(flags, 10)
  ipBuffer(ciaddr).copy(header, 12)
  ipBuffer(yiaddr).copy(header, 16)
  ipBuffer(siaddr).copy(header, 20)
  ipBuffer(giaddr).copy(header, 24)
  if (chaddr) macToBuffer(chaddr).copy(header, 28)
  header.writeUInt32BE(MAGIC_COOKIE, HEADER_SIZE)
  const parts = [header]
  for (const [code, value] of [[OPTION.MESSAGE_TYPE, type], ...options]) {
    if (value === undefined || value === null || value === '') continue
    const data = optionValue(code, value)
    for (let i = 0; i < data.length || i === 0; i += 255) {
      const chunk = data.subarray(i, i + 255)
      parts.push(Buffer.from([code, chunk.length]), chunk)
    }
  }
  parts.push(Buffer.from([OPTION.END]))
  const packet = Buffer.concat(parts)
  return packet.length >= BOOTP_MIN_SIZE
    ? packet
    : Buffer.concat([packet, Buffer.alloc(BOOTP_MIN_SIZE - packet.length)])
}
