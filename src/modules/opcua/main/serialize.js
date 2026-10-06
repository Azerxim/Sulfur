import { DataType } from 'node-opcua'
import { t } from '../shared/i18n'

/** Convertit une valeur OPC UA en valeur sérialisable par l'IPC Electron. */
export function toPlain(value) {
  if (value === null || value === undefined) return value
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (Buffer.isBuffer(value)) return `0x${value.toString('hex')}`
  if (ArrayBuffer.isView(value)) return Array.from(value, toPlain)
  if (Array.isArray(value)) return value.map(toPlain)
  if (typeof value === 'object') {
    if (typeof value.toJSON === 'function') return value.toJSON()
    return String(value)
  }
  return value
}

export function dataValueToPlain(dataValue) {
  return {
    value: toPlain(dataValue.value?.value),
    dataType: DataType[dataValue.value?.dataType] ?? 'Null',
    statusCode: dataValue.statusCode?.name ?? 'Unknown',
    sourceTimestamp: dataValue.sourceTimestamp?.toISOString() ?? null,
    serverTimestamp: dataValue.serverTimestamp?.toISOString() ?? null
  }
}

/** Convertit une saisie utilisateur vers le type OPC UA attendu. */
export function coerce(raw, dataTypeName) {
  switch (dataTypeName) {
    case 'Boolean':
      if (typeof raw === 'boolean') return raw
      return ['true', '1', 'on', 'yes'].includes(String(raw).trim().toLowerCase())
    case 'String':
    case 'LocalizedText':
      return String(raw)
    case 'Double':
    case 'Float': {
      const n = Number(raw)
      if (Number.isNaN(n)) throw new Error(t('errors.invalidNumber', { value: raw }))
      return n
    }
    case 'SByte':
    case 'Byte':
    case 'Int16':
    case 'UInt16':
    case 'Int32':
    case 'UInt32': {
      const n = Number(raw)
      if (!Number.isInteger(n)) throw new Error(t('errors.invalidInteger', { value: raw }))
      return n
    }
    case 'DateTime':
      return new Date(raw)
    default:
      throw new Error(t('opcua.errors.writeUnsupported', { type: dataTypeName }))
  }
}
