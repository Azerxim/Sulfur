import { DataType, lowerFirstLetter } from 'node-opcua'
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

/** Valeur par défaut d'un type de base (complète les tableaux et structures). */
export function defaultValue(dataTypeName) {
  switch (dataTypeName) {
    case 'Boolean':
      return false
    case 'String':
    case 'LocalizedText':
      return ''
    case 'DateTime':
      return new Date(0)
    default:
      return 0
  }
}

/** Liste saisie (« 1, 2, 3 », « 1,5; 2,5 » ou JSON) ou déjà sous forme de tableau. */
export function parseList(raw) {
  if (Array.isArray(raw) || ArrayBuffer.isView(raw)) return Array.from(raw)
  const text = String(raw ?? '').trim()
  if (!text) return []
  if (text.startsWith('[')) {
    try {
      const list = JSON.parse(text)
      if (Array.isArray(list)) return list
    } catch {
      // message ci-dessous
    }
    throw new Error(t('opcua.errors.invalidArray', { value: text }))
  }
  return text.split(text.includes(';') ? ';' : ',').map((item) => item.trim())
}

/** Convertit une saisie en tableau du type attendu ; `length` tronque ou complète par la valeur par défaut. */
export function coerceArray(raw, dataTypeName, length) {
  const items = parseList(raw).map((item) => coerce(item, dataTypeName))
  if (!length) return items
  return Array.from({ length }, (_, i) => (i < items.length ? items[i] : defaultValue(dataTypeName)))
}

/**
 * Convertit une saisie (objet ou JSON) en champs d'une structure, typés selon `fields`
 * ([{ name, dataType, array }]). Les clés sont celles de node-opcua (première lettre en minuscule) ;
 * la saisie peut utiliser l'une ou l'autre forme. Les champs absents prennent la valeur par défaut.
 */
export function coerceStruct(raw, fields) {
  let obj = raw
  if (typeof raw === 'string') {
    try {
      obj = raw.trim() ? JSON.parse(raw) : {}
    } catch {
      obj = null
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error(t('opcua.errors.invalidStruct', { value: String(raw) }))
  }
  return Object.fromEntries(
    fields.map((field) => {
      const key = lowerFirstLetter(field.name)
      const value = obj[key] ?? obj[field.name]
      if (field.array) return [key, coerceArray(value ?? [], field.dataType)]
      return [key, value === undefined || value === null ? defaultValue(field.dataType) : coerce(value, field.dataType)]
    })
  )
}
