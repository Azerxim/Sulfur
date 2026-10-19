import net from 'net'
import snmp from 'net-snmp'
import { t } from '../shared/i18n'

/** Type net-snmp de chaque type d'objet. */
export const SNMP_TYPES = {
  Integer: snmp.ObjectType.Integer,
  Counter32: snmp.ObjectType.Counter32,
  Gauge32: snmp.ObjectType.Gauge32,
  TimeTicks: snmp.ObjectType.TimeTicks,
  OctetString: snmp.ObjectType.OctetString,
  IpAddress: snmp.ObjectType.IpAddress,
  OID: snmp.ObjectType.OID,
  Counter64: snmp.ObjectType.Counter64
}

const TYPE_NAMES = {
  [snmp.ObjectType.Boolean]: 'Boolean',
  [snmp.ObjectType.Integer]: 'Integer',
  [snmp.ObjectType.OctetString]: 'OctetString',
  [snmp.ObjectType.Null]: 'Null',
  [snmp.ObjectType.OID]: 'OID',
  [snmp.ObjectType.IpAddress]: 'IpAddress',
  [snmp.ObjectType.Counter32]: 'Counter32',
  [snmp.ObjectType.Gauge32]: 'Gauge32',
  [snmp.ObjectType.TimeTicks]: 'TimeTicks',
  [snmp.ObjectType.Opaque]: 'Opaque',
  [snmp.ObjectType.Counter64]: 'Counter64',
  [snmp.ObjectType.NoSuchObject]: 'noSuchObject',
  [snmp.ObjectType.NoSuchInstance]: 'noSuchInstance',
  [snmp.ObjectType.EndOfMibView]: 'endOfMibView'
}

export const isValidOid = (oid) => /^[0-2](\.\d+)+$/.test(String(oid ?? '').trim())

/** OID saisi : espaces et point initial retirés. */
export const cleanOid = (oid) =>
  String(oid ?? '')
    .trim()
    .replace(/^\./, '')

const INT32_MIN = -2147483648
const INT32_MAX = 2147483647
const UINT32_MAX = 4294967295

/** Convertit une valeur saisie ou simulée dans le type d'un objet. */
export function convertValue(type, raw) {
  switch (type) {
    case 'OctetString':
      return Buffer.isBuffer(raw) ? raw.toString('utf8') : typeof raw === 'string' ? raw : JSON.stringify(raw)
    case 'IpAddress': {
      const s = String(raw).trim()
      if (!net.isIPv4(s)) throw new Error(t('snmp.errors.invalidIp', { value: raw }))
      return s
    }
    case 'OID': {
      const s = cleanOid(raw)
      if (!isValidOid(s)) throw new Error(t('snmp.errors.invalidOid', { oid: raw }))
      return s
    }
    default: {
      const n = typeof raw === 'number' ? raw : typeof raw === 'boolean' ? Number(raw) : Number(String(raw).trim())
      if (String(raw).trim() === '' || !Number.isFinite(n)) throw new Error(t('errors.invalidNumber', { value: raw }))
      const v = Math.round(n)
      const [min, max] = type === 'Integer' ? [INT32_MIN, INT32_MAX] : [0, UINT32_MAX]
      if (v < min || v > max) throw new Error(t('snmp.errors.outOfRange', { value: raw }))
      return v
    }
  }
}

/** Texte lisible d'une chaîne d'octets : UTF-8 imprimable, sinon hexadécimal. */
function octets(buf) {
  const text = buf.toString('utf8')
  const printable = ![...text].some((c) => {
    const code = c.charCodeAt(0)
    return (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 0xfffd
  })
  return printable ? text : buf.toString('hex').replace(/(..)(?!$)/g, '$1:')
}

/** Varbind reçu → { oid, type, value } lisible ; `error` pour noSuchObject, noSuchInstance, endOfMibView. */
export function readVarbind(vb) {
  const type = TYPE_NAMES[vb.type] ?? String(vb.type)
  if (snmp.isVarbindError(vb)) return { oid: vb.oid, type, value: null, error: true }
  let value = vb.value
  if (Buffer.isBuffer(value)) {
    value = vb.type === snmp.ObjectType.Counter64 ? Number(BigInt(`0x${value.toString('hex') || '0'}`)) : octets(value)
  }
  return { oid: vb.oid, type, value }
}
