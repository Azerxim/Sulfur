/**
 * Protocole S7comm sur ISO-on-TCP (RFC 1006) : TPKT → COTP (ISO 8073) → PDU S7.
 *
 *   TPKT  : 03 00 <longueur totale sur 2 octets>
 *   COTP  : CR (0xE0) / CC (0xD0) avec les TSAP, puis DT (0xF0) pour les données
 *   S7    : 0x32, type (Job 1, Ack-Data 3, Userdata 7), référence, longueurs, paramètres, données
 *
 * Fonctions prises en charge : négociation (0xF0), lecture (0x04) et écriture (0x05) de variables,
 * démarrage (0x28) et arrêt (0x29) de la CPU, lecture de listes d'état système (SZL, userdata).
 */

export const ROSCTR = { JOB: 1, ACK: 2, ACK_DATA: 3, USERDATA: 7 }
export const FUNCTIONS = { SETUP: 0xf0, READ: 0x04, WRITE: 0x05, START: 0x28, STOP: 0x29 }
const COTP = { CR: 0xe0, CC: 0xd0, DT: 0xf0, DR: 0x80 }

/** Tailles de transport : dans les requêtes (BIT / BYTE) et dans les réponses (longueur en bits ou octets). */
export const TRANSPORT = { BIT: 0x01, BYTE: 0x02 }
const DATA_TRANSPORT = { BIT: 0x03, BYTE: 0x04, OCTET: 0x09 }

/** Taille maximale d'une trame TPKT acceptée. */
const MAX_FRAME = 8192
/** Nombre maximal d'éléments par requête de lecture / écriture (limite des CPU S7-300). */
export const MAX_ITEMS = 20

/** Erreur S7 : classe et code d'erreur de l'en-tête, ou code d'erreur des paramètres (userdata). */
export class S7Error extends Error {
  constructor(message, { errorClass = 0, errorCode = 0 } = {}) {
    super(message)
    this.errorClass = errorClass
    this.errorCode = errorCode
  }
}

// --- TPKT / COTP -----------------------------------------------------------------

export function tpkt(payload) {
  const header = Buffer.from([0x03, 0x00, 0, 0])
  header.writeUInt16BE(payload.length + 4, 2)
  return Buffer.concat([header, payload])
}

/** Découpe un flux TCP en trames TPKT complètes. */
export class FrameReader {
  buffer = Buffer.alloc(0)

  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk])
    const frames = []
    while (this.buffer.length >= 4) {
      if (this.buffer[0] !== 0x03) throw new Error('TPKT invalide')
      const length = this.buffer.readUInt16BE(2)
      if (length < 7 || length > MAX_FRAME) throw new Error(`Longueur TPKT invalide : ${length}`)
      if (this.buffer.length < length) break
      frames.push(this.buffer.subarray(4, length))
      this.buffer = this.buffer.subarray(length)
    }
    return frames
  }
}

/** TSAP sous forme de nombre (ex. 0x0102) à partir de « 01.02 », « 0102 » ou d'un nombre. */
export function parseTsap(value) {
  if (typeof value === 'number') return value & 0xffff
  const hex = String(value ?? '').replace(/[^0-9a-f]/gi, '')
  if (!hex || hex.length > 4) return NaN
  return parseInt(hex, 16)
}

export const formatTsap = (tsap) =>
  `${((tsap >> 8) & 0xff).toString(16).padStart(2, '0')}.${(tsap & 0xff).toString(16).padStart(2, '0')}`.toUpperCase()

/** TSAP distant d'une CPU : type de connexion (PG 1, OP 2, S7 basique 3), rack et emplacement. */
export const remoteTsap = (connectionType, rack, slot) =>
  ((connectionType & 0xff) << 8) | ((rack & 0x07) << 5) | (slot & 0x1f)

/** Taille de TPDU COTP (code 0x0A = 1024 octets). */
const TPDU_SIZE_1024 = 0x0a

export function connectRequest(localTsap, remote) {
  const params = Buffer.from([
    0xc0,
    1,
    TPDU_SIZE_1024,
    0xc1,
    2,
    (localTsap >> 8) & 0xff,
    localTsap & 0xff,
    0xc2,
    2,
    (remote >> 8) & 0xff,
    remote & 0xff
  ])
  const head = Buffer.from([6 + params.length, COTP.CR, 0, 0, 0, 1, 0])
  return tpkt(Buffer.concat([head, params]))
}

/** Lit un TPDU COTP : { type, srcRef, dstRef, params: { 0xC1: Buffer… }, payload }. */
export function parseCotp(frame) {
  const li = frame[0]
  const type = frame[1] & 0xf0
  if (li + 1 > frame.length) throw new Error('COTP tronqué')
  if (type === COTP.DT) return { type, last: (frame[2] & 0x80) !== 0, payload: frame.subarray(li + 1) }
  const result = { type, dstRef: frame.readUInt16BE(2), srcRef: frame.readUInt16BE(4), params: {} }
  let i = 7
  while (i + 2 <= li + 1) {
    const code = frame[i]
    const len = frame[i + 1]
    result.params[code] = frame.subarray(i + 2, i + 2 + len)
    i += 2 + len
  }
  return result
}

export const COTP_TYPES = COTP

/** Réponse CC à une demande de connexion : reprend les TSAP et la taille de TPDU. */
export function connectConfirm(cr, srcRef = 0x0001) {
  const params = []
  for (const code of [0xc0, 0xc1, 0xc2]) {
    const value = cr.params[code]
    if (value) params.push(Buffer.from([code, value.length]), value)
  }
  const body = Buffer.concat(params)
  const head = Buffer.from([
    6 + body.length,
    COTP.CC,
    (cr.srcRef >> 8) & 0xff,
    cr.srcRef & 0xff,
    srcRef >> 8,
    srcRef & 0xff,
    0
  ])
  return tpkt(Buffer.concat([head, body]))
}

/** Données S7 encapsulées dans un TPDU DT. */
export const dataFrame = (pdu) => tpkt(Buffer.concat([Buffer.from([0x02, COTP.DT, 0x80]), pdu]))

// --- En-tête S7 ------------------------------------------------------------------

export function s7Pdu({
  rosctr,
  ref,
  params = Buffer.alloc(0),
  data = Buffer.alloc(0),
  errorClass = 0,
  errorCode = 0
}) {
  const ack = rosctr === ROSCTR.ACK || rosctr === ROSCTR.ACK_DATA
  const header = Buffer.alloc(ack ? 12 : 10)
  header[0] = 0x32
  header[1] = rosctr
  header.writeUInt16BE(ref & 0xffff, 4)
  header.writeUInt16BE(params.length, 6)
  header.writeUInt16BE(data.length, 8)
  if (ack) {
    header[10] = errorClass
    header[11] = errorCode
  }
  return Buffer.concat([header, params, data])
}

export function parseS7(pdu) {
  if (pdu.length < 10 || pdu[0] !== 0x32) throw new Error('PDU S7 invalide')
  const rosctr = pdu[1]
  const ack = rosctr === ROSCTR.ACK || rosctr === ROSCTR.ACK_DATA
  const headerLength = ack ? 12 : 10
  const paramLength = pdu.readUInt16BE(6)
  const dataLength = pdu.readUInt16BE(8)
  if (pdu.length < headerLength + paramLength + dataLength) throw new Error('PDU S7 tronqué')
  return {
    rosctr,
    ref: pdu.readUInt16BE(4),
    errorClass: ack ? pdu[10] : 0,
    errorCode: ack ? pdu[11] : 0,
    params: pdu.subarray(headerLength, headerLength + paramLength),
    data: pdu.subarray(headerLength + paramLength, headerLength + paramLength + dataLength)
  }
}

// --- Négociation -------------------------------------------------------------------

export function setupParams(pduSize, amq = 1) {
  const params = Buffer.alloc(8)
  params[0] = FUNCTIONS.SETUP
  params.writeUInt16BE(amq, 2)
  params.writeUInt16BE(amq, 4)
  params.writeUInt16BE(pduSize, 6)
  return params
}

export const parseSetup = (params) => ({
  amqCaller: params.readUInt16BE(2),
  amqCallee: params.readUInt16BE(4),
  pduSize: params.readUInt16BE(6)
})

// --- Lecture / écriture de variables ----------------------------------------------------

/**
 * Élément d'adressage (12 octets) : { areaCode, db, offset, bit, transport, count }.
 * `transport` BIT : un bit à l'adresse offset.bit ; BYTE : `count` octets à partir de offset.
 */
function itemSpec({ areaCode, db = 0, offset, bit = 0, transport, count }) {
  const item = Buffer.alloc(12)
  item[0] = 0x12
  item[1] = 0x0a
  item[2] = 0x10
  item[3] = transport
  item.writeUInt16BE(count, 4)
  item.writeUInt16BE(db, 6)
  item[8] = areaCode
  const address = offset * 8 + (transport === TRANSPORT.BIT ? bit : 0)
  item[9] = (address >> 16) & 0xff
  item[10] = (address >> 8) & 0xff
  item[11] = address & 0xff
  return item
}

function parseItemSpecs(params, offset, count) {
  const items = []
  let i = offset
  for (let n = 0; n < count; n++) {
    if (params[i] !== 0x12 || i + 2 + params[i + 1] > params.length) throw new Error('Élément S7 invalide')
    const length = params[i + 1]
    if (params[i + 2] !== 0x10 || length < 10) throw new Error('Adressage S7 non pris en charge')
    const address = (params[i + 9] << 16) | (params[i + 10] << 8) | params[i + 11]
    items.push({
      transport: params[i + 3],
      count: params.readUInt16BE(i + 4),
      db: params.readUInt16BE(i + 6),
      areaCode: params[i + 8],
      offset: address >> 3,
      bit: address & 7
    })
    i += 2 + length
  }
  return items
}

export function readParams(items) {
  return Buffer.concat([Buffer.from([FUNCTIONS.READ, items.length]), ...items.map(itemSpec)])
}

export function writeParams(items) {
  return Buffer.concat([Buffer.from([FUNCTIONS.WRITE, items.length]), ...items.map(itemSpec)])
}

/** Requête de lecture / écriture reçue : { fn, items }. */
export function parseVarParams(params) {
  return { fn: params[0], items: parseItemSpecs(params, 2, params[1]) }
}

/** Données d'une requête d'écriture : une valeur par élément (Buffer). */
export function writeData(items, values) {
  return Buffer.concat(
    items.flatMap((item, i) => {
      const bytes = Buffer.from(values[i])
      const head = Buffer.alloc(4)
      head[0] = 0
      head[1] = item.transport === TRANSPORT.BIT ? DATA_TRANSPORT.BIT : DATA_TRANSPORT.BYTE
      head.writeUInt16BE(item.transport === TRANSPORT.BIT ? 1 : bytes.length * 8, 2)
      const pad = i < items.length - 1 && bytes.length % 2 ? [Buffer.alloc(1)] : []
      return [head, bytes, ...pad]
    })
  )
}

/** Lit les blocs de données (lecture : réponse ; écriture : requête) : [{ code, data }]. */
export function parseDataItems(data, count) {
  const items = []
  let i = 0
  for (let n = 0; n < count; n++) {
    if (i + 4 > data.length) throw new Error('Données S7 tronquées')
    const code = data[i]
    const transport = data[i + 1]
    const length = data.readUInt16BE(i + 2)
    const bytes =
      transport === DATA_TRANSPORT.BIT
        ? Math.ceil(length / 8)
        : transport === DATA_TRANSPORT.BYTE
          ? length >> 3
          : length
    const isReturn = code !== 0xff && code !== 0 && bytes === 0
    const payload = data.subarray(i + 4, i + 4 + bytes)
    items.push({ code, data: isReturn ? Buffer.alloc(0) : Buffer.from(payload) })
    i += 4 + bytes
    if (n < count - 1 && bytes % 2) i++
  }
  return items
}

/** Données d'une réponse de lecture : [{ code, data, bit }] (code 0xFF : succès). */
export function readResponseData(results) {
  return Buffer.concat(
    results.flatMap((r, i) => {
      if (r.code !== 0xff) return [Buffer.from([r.code, 0, 0, 0])]
      const head = Buffer.alloc(4)
      head[0] = 0xff
      head[1] = r.bit ? DATA_TRANSPORT.BIT : DATA_TRANSPORT.BYTE
      head.writeUInt16BE(r.bit ? 1 : r.data.length * 8, 2)
      const pad = i < results.length - 1 && r.data.length % 2 ? [Buffer.alloc(1)] : []
      return [head, r.data, ...pad]
    })
  )
}

// --- Démarrage / arrêt de la CPU (services PI) ---------------------------------------------

const P_PROGRAM = Buffer.from('P_PROGRAM', 'ascii')

export function stopParams() {
  return Buffer.concat([Buffer.from([FUNCTIONS.STOP, 0, 0, 0, 0, 0, P_PROGRAM.length]), P_PROGRAM])
}

/** Démarrage à chaud (hot) ou à froid (cold : paramètre « C »). */
export function startParams(mode = 'hot') {
  const arg = mode === 'cold' ? Buffer.from('C ', 'ascii') : Buffer.alloc(0)
  const head = Buffer.from([FUNCTIONS.START, 0, 0, 0, 0, 0, 0, 0xfd, 0, arg.length])
  return Buffer.concat([head, arg, Buffer.from([P_PROGRAM.length]), P_PROGRAM])
}

/** Nom du service PI d'une requête de démarrage / arrêt. */
export function parsePiService(params) {
  if (params[0] === FUNCTIONS.STOP) {
    const len = params[6]
    return { fn: FUNCTIONS.STOP, service: params.subarray(7, 7 + len).toString('ascii') }
  }
  const argLength = params.readUInt16BE(8)
  const nameAt = 10 + argLength
  return {
    fn: FUNCTIONS.START,
    cold: params.subarray(10, nameAt).toString('ascii').startsWith('C'),
    service: params.subarray(nameAt + 1, nameAt + 1 + params[nameAt]).toString('ascii')
  }
}

// --- Listes d'état système (SZL, userdata) -------------------------------------------------

const SZL_GROUP = 0x04
const SZL_READ = 0x01

export function szlRequest(id, index, sequence = 0) {
  const params = Buffer.from([0x00, 0x01, 0x12, 0x04, 0x11, 0x40 | SZL_GROUP, SZL_READ, sequence])
  const data = Buffer.alloc(8)
  data[0] = 0xff
  data[1] = DATA_TRANSPORT.OCTET
  data.writeUInt16BE(4, 2)
  data.writeUInt16BE(id, 4)
  data.writeUInt16BE(index, 6)
  return { params, data }
}

/** Requête userdata reçue : { group, subfunction, sequence, szlId, szlIndex }. */
export function parseUserdata(params, data) {
  const type = params[4]
  const group = params[5] & 0x0f
  const result = { type, group, subfunction: params[6], sequence: params[7] }
  if (group === SZL_GROUP && data.length >= 8) {
    result.szlId = data.readUInt16BE(4)
    result.szlIndex = data.readUInt16BE(6)
  }
  return result
}

/** Réponse SZL : en-tête de liste (id, index, longueur d'un enregistrement, nombre) et enregistrements. */
export function szlResponse({ sequence, szlId, szlIndex, recordLength, records, errorCode = 0 }) {
  const params = Buffer.alloc(12)
  params.set([0x00, 0x01, 0x12, 0x08, 0x12, 0x80 | SZL_GROUP, SZL_READ, sequence, 0x00, 0x00])
  params.writeUInt16BE(errorCode, 10)
  if (errorCode) return { params, data: Buffer.from([0x0a, 0x00, 0x00, 0x00]) }
  const body = Buffer.concat(records)
  const data = Buffer.alloc(12)
  data[0] = 0xff
  data[1] = DATA_TRANSPORT.OCTET
  data.writeUInt16BE(8 + body.length, 2)
  data.writeUInt16BE(szlId, 4)
  data.writeUInt16BE(szlIndex, 6)
  data.writeUInt16BE(recordLength, 8)
  data.writeUInt16BE(records.length, 10)
  return { params, data: Buffer.concat([data, body]) }
}

/** Réponse SZL reçue : { errorCode, last, szlId, szlIndex, recordLength, records: Buffer[] }. */
export function parseSzlResponse(params, data) {
  const errorCode = params.length >= 12 ? params.readUInt16BE(10) : 0
  const last = params.length >= 10 ? params[9] === 0 : true
  if (errorCode || data[0] !== 0xff) return { errorCode: errorCode || data[0], records: [] }
  const length = data.readUInt16BE(2)
  const body = data.subarray(4, 4 + length)
  return { errorCode: 0, last, sequence: params[7], body }
}

/** Découpe une liste SZL complète (éventuellement reçue en plusieurs fois) en enregistrements. */
export function splitSzl(body) {
  const szlId = body.readUInt16BE(0)
  const szlIndex = body.readUInt16BE(2)
  const recordLength = body.readUInt16BE(4)
  const count = body.readUInt16BE(6)
  const records = []
  for (let n = 0; n < count; n++) {
    const start = 8 + n * recordLength
    if (start + recordLength > body.length) break
    records.push(body.subarray(start, start + recordLength))
  }
  return { szlId, szlIndex, recordLength, records }
}

/** Requête de continuation d'une réponse SZL découpée. */
export function szlNextRequest(sequence) {
  return {
    params: Buffer.from([0x00, 0x01, 0x12, 0x08, 0x12, 0x40 | SZL_GROUP, SZL_READ, sequence, 0, 0, 0, 0]),
    data: Buffer.from([0x0a, 0x00, 0x00, 0x00])
  }
}
