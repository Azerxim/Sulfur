import { DATA_TYPES } from './constants'
import { t } from './i18n'

/**
 * Encodage / décodage des valeurs sur des registres Modbus 16 bits.
 * Fonctionne côté process principal et côté interface (DataView, sans Buffer).
 */

const swapBytes = (w) => ((w & 0xff) << 8) | (w >> 8)

/** Réordonne des mots (ordre ABCD ↔ ordre demandé). L'opération est sa propre inverse. */
function reorder(words, order) {
  let w = [...words]
  if (order === 'CDAB' || order === 'DCBA') w.reverse()
  if (order === 'BADC' || order === 'DCBA') w = w.map(swapBytes)
  return w
}

const INT_RANGES = {
  UInt16: [0, 0xffff],
  Int16: [-0x8000, 0x7fff],
  UInt32: [0, 0xffffffff],
  Int32: [-0x80000000, 0x7fffffff]
}

export function toNumber(value, dataType) {
  if (typeof value === 'boolean') return value ? 1 : 0
  const n = Number(value)
  if (!Number.isFinite(n)) throw new Error(t('errors.invalidNumber', { value }))
  const range = INT_RANGES[dataType]
  if (!range) return n
  return Math.min(range[1], Math.max(range[0], Math.round(n)))
}

export function toBoolean(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  return ['true', '1', 'on', 'yes', 'oui'].includes(String(value).trim().toLowerCase())
}

/** Valeur → tableau de mots 16 bits. */
export function encodeValue(value, dataType, order = 'ABCD') {
  const words = DATA_TYPES[dataType]
  if (!words) throw new Error(t('modbus.errors.notEncodable', { type: dataType }))
  const view = new DataView(new ArrayBuffer(words * 2))
  const n = toNumber(value, dataType)
  switch (dataType) {
    case 'UInt16': view.setUint16(0, n); break
    case 'Int16': view.setInt16(0, n); break
    case 'UInt32': view.setUint32(0, n); break
    case 'Int32': view.setInt32(0, n); break
    case 'Float32': view.setFloat32(0, n); break
    case 'Float64': view.setFloat64(0, n); break
  }
  const out = []
  for (let i = 0; i < words; i++) out.push(view.getUint16(i * 2))
  return reorder(out, order)
}

/** Tableau de mots 16 bits → valeur. */
export function decodeValue(words, dataType, order = 'ABCD') {
  const count = DATA_TYPES[dataType]
  if (!count) throw new Error(t('modbus.errors.notDecodable', { type: dataType }))
  if (words.length < count) throw new Error(t('modbus.errors.needsRegisters', { type: dataType, count }))
  const ordered = reorder(words.slice(0, count), order)
  const view = new DataView(new ArrayBuffer(count * 2))
  ordered.forEach((w, i) => view.setUint16(i * 2, w))
  switch (dataType) {
    case 'UInt16': return view.getUint16(0)
    case 'Int16': return view.getInt16(0)
    case 'UInt32': return view.getUint32(0)
    case 'Int32': return view.getInt32(0)
    case 'Float32': return view.getFloat32(0)
    case 'Float64': return view.getFloat64(0)
  }
}

/** Nombre de registres (ou de bits) occupés par un point. */
export const pointSize = (dataType) => DATA_TYPES[dataType] || 1
