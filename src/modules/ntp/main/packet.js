import net from 'net'
import { t } from '../shared/i18n'

/**
 * Paquet NTP (RFC 5905), 48 octets sans extension ni authentification :
 *   0  LI (2 bits) · VN (3 bits) · Mode (3 bits)   1 Strate   2 Poll   3 Précision
 *   4  Root delay (16.16)   8 Root dispersion (16.16)   12 Reference ID
 *   16 Reference   24 Origin   32 Receive   40 Transmit   (horodatages 64 bits 32.32)
 */
export const PACKET_SIZE = 48

export const MODES = { SYMMETRIC_ACTIVE: 1, CLIENT: 3, SERVER: 4 }

/** Secondes entre l'époque NTP (1900) et l'époque Unix (1970). */
export const NTP_UNIX_OFFSET = 2208988800

const TWO_32 = 2 ** 32

/** Écrit un horodatage NTP (ms Unix) à `offset`. L'ère 1 (après février 2036) repart de 0. */
export function writeTimestamp(buf, offset, ms) {
  const seconds = Math.floor(ms / 1000)
  const fraction = Math.round(((ms - seconds * 1000) / 1000) * TWO_32)
  buf.writeUInt32BE((seconds + NTP_UNIX_OFFSET) % TWO_32, offset)
  buf.writeUInt32BE(Math.min(fraction, TWO_32 - 1), offset + 4)
}

/**
 * Lit un horodatage NTP en ms Unix (null s'il vaut zéro). Un nombre de secondes dont le bit de poids
 * fort est nul est rapporté à l'ère 1 (après 2036), comme le recommande la RFC 4330.
 */
export function readTimestamp(buf, offset) {
  const seconds = buf.readUInt32BE(offset)
  const fraction = buf.readUInt32BE(offset + 4)
  if (seconds === 0 && fraction === 0) return null
  const era = seconds < 0x80000000 ? TWO_32 : 0
  return (seconds + era - NTP_UNIX_OFFSET) * 1000 + (fraction / TWO_32) * 1000
}

/** Format court 16.16 (root delay, root dispersion) : secondes. */
const writeShort = (buf, offset, seconds) => buf.writeUInt32BE(Math.max(0, Math.round(seconds * 65536)) >>> 0, offset)
const readShort = (buf, offset) => buf.readUInt32BE(offset) / 65536

/**
 * Identifiant de référence : 4 caractères ASCII pour les strates 0 (code Kiss-o'-Death) et 1 (source,
 * ex. GPS) ; adresse IPv4 du serveur amont pour les strates supérieures (texte sinon).
 */
export function encodeRefId(refId, stratum) {
  const value = String(refId ?? '')
  if (stratum >= 2 && net.isIPv4(value)) return Buffer.from(value.split('.').map(Number))
  const buf = Buffer.alloc(4)
  buf.write(value.slice(0, 4), 'ascii')
  return buf
}

export function decodeRefId(buf, stratum) {
  if (stratum >= 2) return [...buf].join('.')
  return buf.toString('ascii').replace(/\0+$/, '')
}

/** Construit un paquet. `origin` : 8 octets bruts recopiés de la requête (champ Transmit du client). */
export function encodePacket({
  leap = 0,
  version = 4,
  mode,
  stratum = 0,
  poll = 0,
  precision = -20,
  rootDelay = 0,
  rootDispersion = 0,
  refId = '',
  reference = null,
  origin = null,
  receive = null,
  transmit = null
}) {
  const buf = Buffer.alloc(PACKET_SIZE)
  buf[0] = ((leap & 3) << 6) | ((version & 7) << 3) | (mode & 7)
  buf[1] = stratum & 0xff
  buf.writeInt8(Math.max(-128, Math.min(127, poll)), 2)
  buf.writeInt8(Math.max(-128, Math.min(127, precision)), 3)
  writeShort(buf, 4, rootDelay)
  writeShort(buf, 8, rootDispersion)
  encodeRefId(refId, stratum).copy(buf, 12)
  if (reference !== null) writeTimestamp(buf, 16, reference)
  if (origin) origin.copy(buf, 24, 0, 8)
  if (receive !== null) writeTimestamp(buf, 32, receive)
  if (transmit !== null) writeTimestamp(buf, 40, transmit)
  return buf
}

/** Décode un paquet ; lève une erreur traduite s'il est trop court. */
export function decodePacket(buf) {
  if (buf.length < PACKET_SIZE) throw new Error(t('ntp.errors.shortPacket', { size: buf.length }))
  const stratum = buf[1]
  return {
    leap: buf[0] >> 6,
    version: (buf[0] >> 3) & 7,
    mode: buf[0] & 7,
    stratum,
    poll: buf.readInt8(2),
    precision: buf.readInt8(3),
    rootDelay: readShort(buf, 4),
    rootDispersion: readShort(buf, 8),
    refId: decodeRefId(buf.subarray(12, 16), stratum),
    reference: readTimestamp(buf, 16),
    origin: readTimestamp(buf, 24),
    receive: readTimestamp(buf, 32),
    transmit: readTimestamp(buf, 40),
    /** Champs bruts, pour vérifier qu'une réponse correspond à la requête. */
    rawOrigin: Buffer.from(buf.subarray(24, 32)),
    rawTransmit: Buffer.from(buf.subarray(40, 48))
  }
}

/**
 * Écart et délai aller-retour (ms) d'un échange : t1 envoi (client), t2 réception (serveur),
 * t3 envoi (serveur), t4 réception (client).
 */
export function offsetAndDelay(t1, t2, t3, t4) {
  return { offset: (t2 - t1 + (t3 - t4)) / 2, delay: t4 - t1 - (t3 - t2) }
}
