/**
 * Trames Modbus selon le transport : MBAP (Modbus TCP), RTU (série ou RTU over TCP) et ASCII (série).
 *
 *   RTU   : adresse (1) · PDU · CRC-16 (2, poids faible en premier)
 *   ASCII : ':' · adresse + PDU + LRC en hexadécimal · CR LF
 *
 * Une trame RTU n'a pas d'en-tête de longueur : sa fin est déduite du code fonction (et du nombre
 * d'octets annoncé). Pour un code fonction inconnu, la trame se termine par un silence sur la ligne
 * (`flush`). Toutes les trames décodées ont la forme { transactionId, unitId, pdu } (transactionId :
 * MBAP uniquement).
 */

import { FrameError, FrameReader, encodeFrame } from './protocol'
import { t } from '../shared/i18n'

/** Transports sur liaison série (les autres passent par TCP). */
export const SERIAL_TRANSPORTS = ['rtu', 'ascii']
export const isSerialTransport = (transport) => SERIAL_TRANSPORTS.includes(transport)

/** Taille maximale d'une trame RTU (adresse + PDU de 253 octets + CRC). */
const MAX_RTU_FRAME = 256
/** Taille maximale d'une trame ASCII (':' + 2 × 255 caractères + CR LF). */
const MAX_ASCII_FRAME = 513
/** Après ce silence, une trame RTU incomplète de longueur connue est abandonnée. */
const STALE_FRAME_MS = 1000

// --- Sommes de contrôle -------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint16Array(256)
  for (let i = 0; i < 256; i++) {
    let crc = i
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1
    table[i] = crc
  }
  return table
})()

/** CRC-16 Modbus (polynôme 0xA001, valeur initiale 0xFFFF). */
export function crc16(bytes) {
  let crc = 0xffff
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff]
  return crc
}

/** LRC Modbus ASCII : complément à deux de la somme des octets. */
export function lrc(bytes) {
  let sum = 0
  for (const byte of bytes) sum = (sum + byte) & 0xff
  return (0x100 - sum) & 0xff
}

// --- RTU ----------------------------------------------------------------------------------

export function encodeRtu(unitId, pdu) {
  const frame = Buffer.alloc(pdu.length + 3)
  frame[0] = unitId
  pdu.copy(frame, 1)
  frame.writeUInt16LE(crc16(frame.subarray(0, pdu.length + 1)), pdu.length + 1)
  return frame
}

const checkRtu = (frame) => crc16(frame.subarray(0, frame.length - 2)) === frame.readUInt16LE(frame.length - 2)

/**
 * Longueur totale d'une trame RTU à partir de son début : nombre d'octets, `0` si le début ne suffit
 * pas encore pour la connaître, `null` si la fonction est inconnue (fin de trame par silence).
 * `role` : 'request' (trames reçues par un serveur) ou 'response' (reçues par un client).
 */
export function rtuFrameLength(buffer, role) {
  if (buffer.length < 2) return 0
  const fc = buffer[1]
  const byteAt = (i) => (buffer.length > i ? buffer[i] : -1)
  const counted = (index, fixed) => (byteAt(index) < 0 ? 0 : fixed + buffer[index])

  if (role === 'request') {
    switch (fc) {
      case 1:
      case 2:
      case 3:
      case 4:
      case 5:
      case 6:
      case 8:
        return 8
      case 7:
      case 11:
      case 12:
      case 17:
        return 4
      case 15:
      case 16:
        return counted(6, 9)
      case 20:
      case 21:
        return counted(2, 5)
      case 22:
        return 10
      case 23:
        return counted(10, 13)
      case 24:
        return 6
      case 43:
        if (byteAt(2) < 0) return 0
        return buffer[2] === 0x0e ? 7 : null
      default:
        return null
    }
  }

  if (fc & 0x80) return 5
  switch (fc) {
    case 1:
    case 2:
    case 3:
    case 4:
    case 12:
    case 17:
    case 20:
    case 21:
    case 23:
      return counted(2, 5)
    case 5:
    case 6:
    case 8:
    case 11:
    case 15:
    case 16:
      return 8
    case 7:
      return 5
    case 22:
      return 10
    case 24:
      return buffer.length < 4 ? 0 : 6 + buffer.readUInt16BE(2)
    case 43: {
      // Identification : en-tête de 8 octets puis objets (identifiant, longueur, valeur).
      if (buffer.length < 3) return 0
      if (buffer[2] !== 0x0e) return null
      if (buffer.length < 8) return 0
      let offset = 8
      for (let i = 0; i < buffer[7]; i++) {
        if (buffer.length < offset + 2) return 0
        offset += 2 + buffer[offset + 1]
      }
      return offset + 2
    }
    default:
      return null
  }
}

/**
 * Découpe un flux RTU en trames. Une trame dont le CRC est faux lève FrameError en mode `strict`
 * (RTU over TCP : la connexion est fermée) ; sur une liaison série, l'octet de tête est abandonné
 * et la recherche reprend (resynchronisation après un parasite).
 */
export class RtuReader {
  buffer = Buffer.alloc(0)
  /** Trames rejetées (CRC faux, octets parasites) : affichées dans le journal du serveur. */
  errors = 0

  constructor(role, { strict = false } = {}) {
    this.role = role
    this.strict = strict
  }

  push(chunk) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk
    const frames = []
    while (this.buffer.length >= 4) {
      const length = rtuFrameLength(this.buffer, this.role)
      if (length === null || length === 0) break
      if (length > MAX_RTU_FRAME) {
        this.reject(t('modbus.errors.invalidLength', { length }))
        continue
      }
      if (this.buffer.length < length) break
      const frame = this.buffer.subarray(0, length)
      if (!checkRtu(frame)) {
        this.reject(t('modbus.errors.badCrc'))
        continue
      }
      frames.push({ transactionId: null, unitId: frame[0], pdu: Buffer.from(frame.subarray(1, length - 2)) })
      this.buffer = this.buffer.subarray(length)
    }
    if (this.buffer.length > MAX_RTU_FRAME)
      this.reject(t('modbus.errors.invalidLength', { length: this.buffer.length }))
    return frames
  }

  reject(message) {
    this.errors++
    if (this.strict) {
      this.buffer = Buffer.alloc(0)
      throw new FrameError(message)
    }
    this.buffer = this.buffer.subarray(1)
  }

  /**
   * Silence sur la ligne depuis `idleMs` : fin de la trame en cours. Une trame de fonction inconnue
   * est retournée si son CRC est bon ; une trame incomplète de longueur connue est gardée tant que le
   * silence reste court (latence des adaptateurs USB), puis abandonnée.
   */
  flush(idleMs = Infinity) {
    if (!this.buffer.length) return []
    const length = this.buffer.length >= 2 ? rtuFrameLength(this.buffer, this.role) : 0
    if (length !== null && idleMs < STALE_FRAME_MS) return []
    const frame = this.buffer
    this.buffer = Buffer.alloc(0)
    if (length === null && frame.length >= 4 && checkRtu(frame)) {
      return [{ transactionId: null, unitId: frame[0], pdu: Buffer.from(frame.subarray(1, frame.length - 2)) }]
    }
    this.errors++
    if (this.strict) throw new FrameError(t('modbus.errors.incompleteFrame'))
    return []
  }

  /** Données en attente d'une fin de trame. */
  get pending() {
    return this.buffer.length > 0
  }
}

// --- ASCII --------------------------------------------------------------------------------

export function encodeAscii(unitId, pdu) {
  const body = Buffer.concat([Buffer.from([unitId]), pdu])
  const hex = Buffer.concat([body, Buffer.from([lrc(body)])])
    .toString('hex')
    .toUpperCase()
  return Buffer.from(`:${hex}\r\n`, 'latin1')
}

/** Découpe un flux ASCII en trames ; une trame invalide (hexadécimal, LRC) est ignorée. */
export class AsciiReader {
  text = ''
  errors = 0

  push(chunk) {
    this.text += chunk.toString('latin1')
    const frames = []
    for (;;) {
      const start = this.text.indexOf(':')
      if (start < 0) {
        this.text = ''
        break
      }
      // Un nouveau ':' recommence la trame (spécification Modbus ASCII).
      const end = this.text.indexOf('\n', start)
      const restart = this.text.indexOf(':', start + 1)
      if (restart >= 0 && (end < 0 || restart < end)) {
        this.errors++
        this.text = this.text.slice(restart)
        continue
      }
      if (end < 0) {
        this.text = this.text.slice(start)
        if (this.text.length > MAX_ASCII_FRAME) {
          this.errors++
          this.text = ''
        }
        break
      }
      const frame = this.decode(this.text.slice(start + 1, end).replace(/\r$/, ''))
      this.text = this.text.slice(end + 1)
      if (frame) frames.push(frame)
      else this.errors++
    }
    return frames
  }

  decode(hex) {
    if (hex.length < 6 || hex.length % 2 || !/^[0-9a-fA-F]+$/.test(hex)) return null
    const bytes = Buffer.from(hex, 'hex')
    const body = bytes.subarray(0, -1)
    if (lrc(body) !== bytes[bytes.length - 1]) return null
    return { transactionId: null, unitId: body[0], pdu: Buffer.from(body.subarray(1)) }
  }

  flush() {
    return []
  }

  get pending() {
    return this.text.length > 0
  }
}

// --- Sélection selon le transport --------------------------------------------------------

/**
 * Lecteur et encodeur de trames d'un transport.
 *  - transport : 'tcp' (MBAP), 'rtuOverTcp', 'rtu' ou 'ascii'
 *  - role : 'request' (côté serveur) ou 'response' (côté client)
 * Retourne { reader, encode({ transactionId, unitId, pdu }), framed } — `framed` : le transport
 * numérote les transactions (MBAP), sinon une seule requête à la fois.
 */
export function createFramer(transport, role) {
  switch (transport) {
    case 'rtuOverTcp':
      return {
        reader: new RtuReader(role, { strict: true }),
        encode: ({ unitId, pdu }) => encodeRtu(unitId, pdu),
        framed: false
      }
    case 'rtu':
      return { reader: new RtuReader(role), encode: ({ unitId, pdu }) => encodeRtu(unitId, pdu), framed: false }
    case 'ascii':
      return { reader: new AsciiReader(), encode: ({ unitId, pdu }) => encodeAscii(unitId, pdu), framed: false }
    default:
      return {
        reader: new FrameReader(),
        encode: ({ transactionId, unitId, pdu }) => encodeFrame(transactionId, unitId, pdu),
        framed: true
      }
  }
}

/**
 * Durée d'un caractère sur la liaison série, en millisecondes (bit de start, données, parité, stop).
 * Au-delà de 19 200 bauds, la spécification fixe le silence inter-trames à 1,75 ms.
 */
export function charTime({ baudRate = 9600, dataBits = 8, parity = 'none', stopBits = 1 } = {}) {
  const bits = 1 + Number(dataBits) + (parity === 'none' ? 0 : 1) + Number(stopBits)
  return (bits * 1000) / Number(baudRate)
}

/** Silence marquant la fin d'une trame RTU (3,5 caractères, 1,75 ms au-delà de 19 200 bauds). */
export const interFrameDelay = (serial) =>
  Number(serial?.baudRate) > 19200 ? 1.75 : Math.max(1.75, 3.5 * charTime(serial))
