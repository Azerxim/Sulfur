/**
 * Protocole Modbus TCP : en-tête MBAP + PDU.
 *
 *   MBAP : transactionId (2) · protocolId (2, = 0) · length (2) · unitId (1)
 *   PDU  : functionCode (1) · données (≤ 252 octets)
 */

import { t } from '../shared/i18n'

export const FC = {
  READ_COILS: 1,
  READ_DISCRETE_INPUTS: 2,
  READ_HOLDING_REGISTERS: 3,
  READ_INPUT_REGISTERS: 4,
  WRITE_SINGLE_COIL: 5,
  WRITE_SINGLE_REGISTER: 6,
  WRITE_MULTIPLE_COILS: 15,
  WRITE_MULTIPLE_REGISTERS: 16,
  READ_WRITE_MULTIPLE_REGISTERS: 23,
  ENCAPSULATED_INTERFACE: 43
}

/** Type MEI de la fonction 43 : lecture de l'identification de l'équipement. */
export const MEI_DEVICE_IDENTIFICATION = 0x0e

/**
 * Codes de lecture de l'identification (fonction 43 / 14) : 1 basique, 2 régulière, 3 étendue
 * (accès par flux), 4 objet individuel.
 */
export const DEVICE_ID_CODES = { BASIC: 1, REGULAR: 2, EXTENDED: 3, INDIVIDUAL: 4 }

/** Niveau de conformité annoncé : identification régulière, accès par flux et individuel. */
export const CONFORMITY_LEVEL = 0x82

export const EX = {
  ILLEGAL_FUNCTION: 1,
  ILLEGAL_DATA_ADDRESS: 2,
  ILLEGAL_DATA_VALUE: 3,
  SERVER_DEVICE_FAILURE: 4,
  SERVER_DEVICE_BUSY: 6,
  GATEWAY_TARGET_FAILED: 11
}

/** Table et sens (lecture / écriture) de chaque code fonction. */
export const FUNCTIONS = {
  [FC.READ_COILS]: { table: 'coils', write: false },
  [FC.READ_DISCRETE_INPUTS]: { table: 'discreteInputs', write: false },
  [FC.READ_HOLDING_REGISTERS]: { table: 'holdingRegisters', write: false },
  [FC.READ_INPUT_REGISTERS]: { table: 'inputRegisters', write: false },
  [FC.WRITE_SINGLE_COIL]: { table: 'coils', write: true },
  [FC.WRITE_SINGLE_REGISTER]: { table: 'holdingRegisters', write: true },
  [FC.WRITE_MULTIPLE_COILS]: { table: 'coils', write: true },
  [FC.WRITE_MULTIPLE_REGISTERS]: { table: 'holdingRegisters', write: true },
  // Écriture puis lecture : la requête demande les deux droits.
  [FC.READ_WRITE_MULTIPLE_REGISTERS]: { table: 'holdingRegisters', write: true, read: true },
  [FC.ENCAPSULATED_INTERFACE]: { table: null, write: false }
}

export const READ_FC = {
  coils: FC.READ_COILS,
  discreteInputs: FC.READ_DISCRETE_INPUTS,
  holdingRegisters: FC.READ_HOLDING_REGISTERS,
  inputRegisters: FC.READ_INPUT_REGISTERS
}

const MAX_PDU = 253
const MBAP_LENGTH = 7

export class ModbusException extends Error {
  constructor(code, message) {
    super(
      message ??
        t('modbus.exceptions.format', {
          code,
          message: t(`modbus.exceptions.${code}`, null, t('modbus.exceptions.unknown'))
        })
    )
    this.code = code
  }
}

/** Erreur de trame : la connexion doit être fermée. */
export class FrameError extends Error {}

/**
 * Découpe un flux TCP en trames Modbus complètes.
 * Lève FrameError sur un en-tête invalide (protocole ≠ 0, longueur incohérente).
 */
export class FrameReader {
  buffer = Buffer.alloc(0)

  push(chunk) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk
    const frames = []
    while (this.buffer.length >= MBAP_LENGTH) {
      const protocolId = this.buffer.readUInt16BE(2)
      const length = this.buffer.readUInt16BE(4)
      if (protocolId !== 0) throw new FrameError(t('modbus.errors.invalidProtocolId', { id: protocolId }))
      if (length < 2 || length > MAX_PDU + 1) throw new FrameError(t('modbus.errors.invalidLength', { length }))
      const total = 6 + length
      if (this.buffer.length < total) break
      const frame = this.buffer.subarray(0, total)
      frames.push({
        transactionId: frame.readUInt16BE(0),
        unitId: frame.readUInt8(6),
        pdu: Buffer.from(frame.subarray(7))
      })
      this.buffer = this.buffer.subarray(total)
    }
    return frames
  }
}

export function encodeFrame(transactionId, unitId, pdu) {
  const header = Buffer.alloc(MBAP_LENGTH)
  header.writeUInt16BE(transactionId, 0)
  header.writeUInt16BE(0, 2)
  header.writeUInt16BE(pdu.length + 1, 4)
  header.writeUInt8(unitId, 6)
  return Buffer.concat([header, pdu])
}

export const exceptionPdu = (fc, code) => Buffer.from([fc | 0x80, code])

// --- Bits -------------------------------------------------------------------

export function packBits(values) {
  const bytes = Buffer.alloc(Math.ceil(values.length / 8))
  values.forEach((v, i) => {
    if (v) bytes[i >> 3] |= 1 << (i & 7)
  })
  return bytes
}

export function unpackBits(bytes, count) {
  const out = []
  for (let i = 0; i < count; i++) out.push(((bytes[i >> 3] >> (i & 7)) & 1) === 1)
  return out
}

// --- Côté serveur : décodage des requêtes ------------------------------------

/**
 * Décode le PDU d'une requête. Retourne { fc, table, write, address, quantity, values? } ;
 * fonction 23 : en plus { read: true, writeAddress, writeQuantity } (address / quantity : lecture) ;
 * fonction 43 / 14 : { fc, identification: true, code, objectId }.
 * Lève ModbusException (fonction illégale, valeur illégale).
 */
export function parseRequest(pdu) {
  const fc = pdu[0]
  const fn = FUNCTIONS[fc]
  if (!fn) throw new ModbusException(EX.ILLEGAL_FUNCTION, t('modbus.errors.unsupportedFunction', { fc }))
  const need = (n) => {
    if (pdu.length < n) throw new ModbusException(EX.ILLEGAL_DATA_VALUE, t('modbus.errors.truncated'))
  }
  if (fc === FC.ENCAPSULATED_INTERFACE) {
    need(2)
    if (pdu[1] !== MEI_DEVICE_IDENTIFICATION) {
      throw new ModbusException(EX.ILLEGAL_FUNCTION, t('modbus.errors.unsupportedMei', { mei: pdu[1] }))
    }
    need(4)
    const code = pdu[2]
    if (code < DEVICE_ID_CODES.BASIC || code > DEVICE_ID_CODES.INDIVIDUAL) {
      throw new ModbusException(EX.ILLEGAL_DATA_VALUE, t('modbus.errors.invalidDeviceIdCode', { code }))
    }
    return { fc, ...fn, identification: true, code, objectId: pdu[3] }
  }
  need(5)
  const address = pdu.readUInt16BE(1)
  const base = { fc, ...fn, address }

  switch (fc) {
    case FC.READ_COILS:
    case FC.READ_DISCRETE_INPUTS:
    case FC.READ_HOLDING_REGISTERS:
    case FC.READ_INPUT_REGISTERS: {
      const quantity = pdu.readUInt16BE(3)
      const max = fc <= 2 ? 2000 : 125
      if (quantity < 1 || quantity > max)
        throw new ModbusException(EX.ILLEGAL_DATA_VALUE, t('modbus.errors.invalidQuantity', { quantity }))
      return { ...base, quantity }
    }
    case FC.WRITE_SINGLE_COIL: {
      const raw = pdu.readUInt16BE(3)
      if (raw !== 0xff00 && raw !== 0x0000)
        throw new ModbusException(EX.ILLEGAL_DATA_VALUE, t('modbus.errors.invalidCoilValue'))
      return { ...base, quantity: 1, values: [raw === 0xff00] }
    }
    case FC.WRITE_SINGLE_REGISTER:
      return { ...base, quantity: 1, values: [pdu.readUInt16BE(3)] }
    case FC.WRITE_MULTIPLE_COILS: {
      need(6)
      const quantity = pdu.readUInt16BE(3)
      const byteCount = pdu[5]
      if (quantity < 1 || quantity > 1968 || byteCount !== Math.ceil(quantity / 8) || pdu.length !== 6 + byteCount) {
        throw new ModbusException(EX.ILLEGAL_DATA_VALUE, t('modbus.errors.invalidCoilsWrite'))
      }
      return { ...base, quantity, values: unpackBits(pdu.subarray(6), quantity) }
    }
    case FC.WRITE_MULTIPLE_REGISTERS: {
      need(6)
      const quantity = pdu.readUInt16BE(3)
      const byteCount = pdu[5]
      if (quantity < 1 || quantity > 123 || byteCount !== quantity * 2 || pdu.length !== 6 + byteCount) {
        throw new ModbusException(EX.ILLEGAL_DATA_VALUE, t('modbus.errors.invalidRegistersWrite'))
      }
      const values = []
      for (let i = 0; i < quantity; i++) values.push(pdu.readUInt16BE(6 + i * 2))
      return { ...base, quantity, values }
    }
    case FC.READ_WRITE_MULTIPLE_REGISTERS: {
      need(10)
      const quantity = pdu.readUInt16BE(3)
      const writeAddress = pdu.readUInt16BE(5)
      const writeQuantity = pdu.readUInt16BE(7)
      const byteCount = pdu[9]
      if (
        quantity < 1 ||
        quantity > 125 ||
        writeQuantity < 1 ||
        writeQuantity > 121 ||
        byteCount !== writeQuantity * 2 ||
        pdu.length !== 10 + byteCount
      ) {
        throw new ModbusException(EX.ILLEGAL_DATA_VALUE, t('modbus.errors.invalidReadWrite'))
      }
      const values = []
      for (let i = 0; i < writeQuantity; i++) values.push(pdu.readUInt16BE(10 + i * 2))
      return { ...base, quantity, writeAddress, writeQuantity, values }
    }
  }
}

/** Octets d'un objet d'identification (texte ASCII, tronqué pour tenir dans une réponse). */
const objectBytes = (text) => Buffer.from(String(text ?? ''), 'latin1').subarray(0, MAX_PDU - 10)

/**
 * Réponse à une lecture de l'identification (fonction 43 / 14). `objects` : Map identifiant d'objet
 * → texte (objets basiques 0 à 2 toujours présents). En accès par flux, la réponse est découpée si
 * elle dépasse la taille d'un PDU (« more follows » et identifiant du prochain objet).
 */
export function buildIdentificationResponse(req, objects) {
  if (req.code === DEVICE_ID_CODES.EXTENDED) {
    throw new ModbusException(EX.ILLEGAL_DATA_VALUE, t('modbus.errors.extendedIdentification'))
  }
  let ids
  if (req.code === DEVICE_ID_CODES.INDIVIDUAL) {
    if (!objects.has(req.objectId)) {
      throw new ModbusException(EX.ILLEGAL_DATA_ADDRESS, t('modbus.errors.unknownObject', { id: req.objectId }))
    }
    ids = [req.objectId]
  } else {
    const last = req.code === DEVICE_ID_CODES.BASIC ? 2 : 0x7f
    const available = [...objects.keys()].filter((id) => id <= last).sort((a, b) => a - b)
    // Objet de départ inconnu : la lecture reprend au début (spécification Modbus).
    const start = available.includes(req.objectId) ? req.objectId : 0
    ids = available.filter((id) => id >= start)
  }

  const parts = []
  let size = 7
  let next = null
  for (const id of ids) {
    const bytes = objectBytes(objects.get(id))
    if (parts.length && size + 2 + bytes.length > MAX_PDU) {
      next = id
      break
    }
    parts.push(Buffer.from([id, bytes.length]), bytes)
    size += 2 + bytes.length
  }
  const header = Buffer.from([
    FC.ENCAPSULATED_INTERFACE,
    MEI_DEVICE_IDENTIFICATION,
    req.code,
    CONFORMITY_LEVEL,
    next === null ? 0x00 : 0xff,
    next ?? 0,
    parts.length / 2
  ])
  return Buffer.concat([header, ...parts])
}

/** Construit le PDU de réponse à une requête traitée (`data` = valeurs lues pour une lecture). */
export function buildResponse(req, data) {
  switch (req.fc) {
    case FC.READ_COILS:
    case FC.READ_DISCRETE_INPUTS: {
      const bytes = packBits(data)
      return Buffer.concat([Buffer.from([req.fc, bytes.length]), bytes])
    }
    case FC.READ_HOLDING_REGISTERS:
    case FC.READ_INPUT_REGISTERS:
    case FC.READ_WRITE_MULTIPLE_REGISTERS: {
      const pdu = Buffer.alloc(2 + data.length * 2)
      pdu[0] = req.fc
      pdu[1] = data.length * 2
      data.forEach((w, i) => pdu.writeUInt16BE(w, 2 + i * 2))
      return pdu
    }
    case FC.WRITE_SINGLE_COIL: {
      const pdu = Buffer.alloc(5)
      pdu[0] = req.fc
      pdu.writeUInt16BE(req.address, 1)
      pdu.writeUInt16BE(req.values[0] ? 0xff00 : 0, 3)
      return pdu
    }
    case FC.WRITE_SINGLE_REGISTER: {
      const pdu = Buffer.alloc(5)
      pdu[0] = req.fc
      pdu.writeUInt16BE(req.address, 1)
      pdu.writeUInt16BE(req.values[0], 3)
      return pdu
    }
    case FC.WRITE_MULTIPLE_COILS:
    case FC.WRITE_MULTIPLE_REGISTERS: {
      const pdu = Buffer.alloc(5)
      pdu[0] = req.fc
      pdu.writeUInt16BE(req.address, 1)
      pdu.writeUInt16BE(req.quantity, 3)
      return pdu
    }
  }
}

// --- Côté client : construction des requêtes / lecture des réponses ----------

export function readRequest(table, address, quantity) {
  const pdu = Buffer.alloc(5)
  pdu[0] = READ_FC[table]
  pdu.writeUInt16BE(address, 1)
  pdu.writeUInt16BE(quantity, 3)
  return pdu
}

export function writeRequest(table, address, values, { forceMultiple = false } = {}) {
  if (table === 'coils') {
    if (values.length === 1 && !forceMultiple) {
      const pdu = Buffer.alloc(5)
      pdu[0] = FC.WRITE_SINGLE_COIL
      pdu.writeUInt16BE(address, 1)
      pdu.writeUInt16BE(values[0] ? 0xff00 : 0, 3)
      return pdu
    }
    const bytes = packBits(values)
    const head = Buffer.alloc(6)
    head[0] = FC.WRITE_MULTIPLE_COILS
    head.writeUInt16BE(address, 1)
    head.writeUInt16BE(values.length, 3)
    head[5] = bytes.length
    return Buffer.concat([head, bytes])
  }
  if (table === 'holdingRegisters') {
    if (values.length === 1 && !forceMultiple) {
      const pdu = Buffer.alloc(5)
      pdu[0] = FC.WRITE_SINGLE_REGISTER
      pdu.writeUInt16BE(address, 1)
      pdu.writeUInt16BE(values[0], 3)
      return pdu
    }
    const pdu = Buffer.alloc(6 + values.length * 2)
    pdu[0] = FC.WRITE_MULTIPLE_REGISTERS
    pdu.writeUInt16BE(address, 1)
    pdu.writeUInt16BE(values.length, 3)
    pdu[5] = values.length * 2
    values.forEach((v, i) => pdu.writeUInt16BE(v, 6 + i * 2))
    return pdu
  }
  throw new Error(t('modbus.errors.readOnlyTable'))
}

/** Lecture / écriture de registres en une requête (fonction 23) : écriture de `values` puis lecture. */
export function readWriteRequest(readAddress, readQuantity, writeAddress, values) {
  const pdu = Buffer.alloc(10 + values.length * 2)
  pdu[0] = FC.READ_WRITE_MULTIPLE_REGISTERS
  pdu.writeUInt16BE(readAddress, 1)
  pdu.writeUInt16BE(readQuantity, 3)
  pdu.writeUInt16BE(writeAddress, 5)
  pdu.writeUInt16BE(values.length, 7)
  pdu[9] = values.length * 2
  values.forEach((v, i) => pdu.writeUInt16BE(v, 10 + i * 2))
  return pdu
}

/** Lecture de l'identification de l'équipement (fonction 43 / 14). */
export const identificationRequest = (code, objectId = 0) =>
  Buffer.from([FC.ENCAPSULATED_INTERFACE, MEI_DEVICE_IDENTIFICATION, code, objectId])

/** Analyse une réponse. Lève ModbusException si le serveur a répondu par une exception. */
export function parseResponse(requestPdu, pdu, quantity) {
  const fc = pdu[0]
  if (fc === (requestPdu[0] | 0x80)) throw new ModbusException(pdu[1])
  if (fc !== requestPdu[0]) throw new Error(t('modbus.errors.unexpectedResponse', { fc }))
  switch (fc) {
    case FC.READ_COILS:
    case FC.READ_DISCRETE_INPUTS:
      return unpackBits(pdu.subarray(2, 2 + pdu[1]), quantity)
    case FC.READ_HOLDING_REGISTERS:
    case FC.READ_INPUT_REGISTERS:
    case FC.READ_WRITE_MULTIPLE_REGISTERS: {
      const out = []
      for (let i = 0; i < pdu[1] / 2; i++) out.push(pdu.readUInt16BE(2 + i * 2))
      return out
    }
    case FC.ENCAPSULATED_INTERFACE: {
      // { code, conformity, moreFollows, nextObjectId, objects: [{ id, value }] }
      if (pdu.length < 7 || pdu[1] !== MEI_DEVICE_IDENTIFICATION) throw new Error(t('modbus.errors.invalidResponse'))
      const objects = []
      let offset = 7
      for (let i = 0; i < pdu[6]; i++) {
        if (offset + 2 > pdu.length) throw new Error(t('modbus.errors.invalidResponse'))
        const length = pdu[offset + 1]
        objects.push({ id: pdu[offset], value: pdu.subarray(offset + 2, offset + 2 + length).toString('latin1') })
        offset += 2 + length
      }
      return { code: pdu[2], conformity: pdu[3], moreFollows: pdu[4] === 0xff, nextObjectId: pdu[5], objects }
    }
    default:
      return null
  }
}
