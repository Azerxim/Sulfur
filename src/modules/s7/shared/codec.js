import { stringLength, typeSize } from './address'
import { t } from './i18n'

/**
 * Encodage / décodage des valeurs S7 (big-endian), sur des tableaux d'octets.
 * Fonctionne côté process principal et côté interface (DataView, sans Buffer).
 */

const INT_RANGES = {
  Byte: [0, 0xff],
  USInt: [0, 0xff],
  SInt: [-0x80, 0x7f],
  Word: [0, 0xffff],
  UInt: [0, 0xffff],
  Int: [-0x8000, 0x7fff],
  DWord: [0, 0xffffffff],
  UDInt: [0, 0xffffffff],
  DInt: [-0x80000000, 0x7fffffff]
}

export function toBoolean(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  return ['true', '1', 'on', 'yes', 'oui'].includes(String(value).trim().toLowerCase())
}

/** Valeur numérique bornée au type (entiers arrondis). */
export function toNumber(value, dataType) {
  if (typeof value === 'boolean') return value ? 1 : 0
  const text = String(value).trim()
  const n = /^0x[0-9a-f]+$/i.test(text) ? parseInt(text, 16) : Number(text)
  if (text === '' || !Number.isFinite(n)) throw new Error(t('errors.invalidNumber', { value }))
  const range = INT_RANGES[dataType]
  if (!range) return n
  return Math.min(range[1], Math.max(range[0], Math.round(n)))
}

/** Valeur → octets (`length` : longueur maximale d'une chaîne). Un booléen occupe un octet (0 / 1). */
export function encodeValue(value, dataType, length) {
  const size = typeSize(dataType, length)
  const bytes = new Uint8Array(size)
  const view = new DataView(bytes.buffer)
  switch (dataType) {
    case 'Bool':
      bytes[0] = toBoolean(value) ? 1 : 0
      break
    case 'Char': {
      const code = String(value ?? '').charCodeAt(0)
      bytes[0] = Number.isFinite(code) && code < 256 ? code : 0x3f
      break
    }
    case 'String': {
      const max = stringLength(length)
      const text = String(value ?? '').slice(0, max)
      bytes[0] = max
      bytes[1] = text.length
      for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i)
        bytes[2 + i] = code < 256 ? code : 0x3f
      }
      break
    }
    case 'Byte':
    case 'USInt':
      view.setUint8(0, toNumber(value, dataType))
      break
    case 'SInt':
      view.setInt8(0, toNumber(value, dataType))
      break
    case 'Word':
    case 'UInt':
      view.setUint16(0, toNumber(value, dataType))
      break
    case 'Int':
      view.setInt16(0, toNumber(value, dataType))
      break
    case 'DWord':
    case 'UDInt':
      view.setUint32(0, toNumber(value, dataType))
      break
    case 'DInt':
      view.setInt32(0, toNumber(value, dataType))
      break
    case 'Real':
      view.setFloat32(0, toNumber(value, dataType))
      break
    case 'LReal':
      view.setFloat64(0, toNumber(value, dataType))
      break
  }
  return bytes
}

/** Octets → valeur. Pour un booléen, `bit` désigne le bit lu dans le premier octet. */
export function decodeValue(input, dataType, { bit = 0, length } = {}) {
  const bytes = input instanceof Uint8Array ? input : Uint8Array.from(input)
  const size = dataType === 'String' ? 2 : typeSize(dataType, length)
  if (bytes.length < size) throw new Error(t('s7.errors.shortData', { type: dataType, count: size }))
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  switch (dataType) {
    case 'Bool':
      return ((bytes[0] >> bit) & 1) === 1
    case 'Char':
      return String.fromCharCode(bytes[0])
    case 'String': {
      const count = Math.min(bytes[1], bytes[0] || bytes[1], bytes.length - 2)
      return String.fromCharCode(...bytes.subarray(2, 2 + count))
    }
    case 'Byte':
    case 'USInt':
      return view.getUint8(0)
    case 'SInt':
      return view.getInt8(0)
    case 'Word':
    case 'UInt':
      return view.getUint16(0)
    case 'Int':
      return view.getInt16(0)
    case 'DWord':
    case 'UDInt':
      return view.getUint32(0)
    case 'DInt':
      return view.getInt32(0)
    case 'Real':
      return view.getFloat32(0)
    case 'LReal':
      return view.getFloat64(0)
  }
  throw new Error(t('s7.errors.unknownType', { type: dataType }))
}

/** Type numérique (courbes, générateurs de valeurs). */
export const isNumericType = (dataType) => !['Char', 'String'].includes(dataType)

/** Valeur saisie (texte) convertie selon le type. */
export function parseInput(raw, dataType) {
  if (dataType === 'Bool') return toBoolean(raw)
  if (!isNumericType(dataType)) return String(raw)
  return toNumber(raw, dataType)
}
