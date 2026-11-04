import { FORMATS, payloadText } from './codec'

/**
 * LwM2M (OMA) : modèle des objets connus, chemins et formats de contenu (texte, TLV, SenML JSON,
 * ancien JSON LwM2M 1.0). Pur, partagé par le process principal et les tests.
 *
 * Types des ressources : string, integer, float, boolean, time (secondes), opaque, none (exécutable).
 * Opérations : R (lecture), W (écriture), E (exécution).
 */
export const OBJECTS = {
  0: { name: 'LwM2M Security', resources: {} },
  1: {
    name: 'LwM2M Server',
    resources: {
      0: { name: 'Short Server ID', type: 'integer', ops: 'R' },
      1: { name: 'Lifetime', type: 'integer', ops: 'RW', units: 's' },
      7: { name: 'Binding', type: 'string', ops: 'RW' },
      8: { name: 'Registration Update Trigger', type: 'none', ops: 'E' }
    }
  },
  3: {
    name: 'Device',
    resources: {
      0: { name: 'Manufacturer', type: 'string', ops: 'R' },
      1: { name: 'Model Number', type: 'string', ops: 'R' },
      2: { name: 'Serial Number', type: 'string', ops: 'R' },
      3: { name: 'Firmware Version', type: 'string', ops: 'R' },
      4: { name: 'Reboot', type: 'none', ops: 'E' },
      9: { name: 'Battery Level', type: 'integer', ops: 'R', units: '%' },
      13: { name: 'Current Time', type: 'time', ops: 'RW' },
      14: { name: 'UTC Offset', type: 'string', ops: 'RW' },
      16: { name: 'Supported Binding and Modes', type: 'string', ops: 'R' }
    }
  },
  3303: {
    name: 'Temperature',
    resources: {
      5700: { name: 'Sensor Value', type: 'float', ops: 'R' },
      5601: { name: 'Min Measured Value', type: 'float', ops: 'R' },
      5602: { name: 'Max Measured Value', type: 'float', ops: 'R' },
      5605: { name: 'Reset Min and Max Measured Values', type: 'none', ops: 'E' },
      5701: { name: 'Sensor Units', type: 'string', ops: 'R' }
    }
  },
  3311: {
    name: 'Light Control',
    resources: {
      5850: { name: 'On/Off', type: 'boolean', ops: 'RW' },
      5851: { name: 'Dimmer', type: 'integer', ops: 'RW', units: '%' },
      5706: { name: 'Colour', type: 'string', ops: 'RW' },
      5852: { name: 'On Time', type: 'integer', ops: 'RW', units: 's' }
    }
  }
}

/** Définition d'une ressource connue (undefined sinon). */
export const resourceDef = (objectId, resourceId) => OBJECTS[objectId]?.resources[resourceId]

/** Nom lisible d'un chemin : « Temperature / 0 / Sensor Value ». */
export function pathLabel(path) {
  const p = parsePath(path)
  if (!p) return path
  const object = OBJECTS[p.object]
  const parts = [object?.name ?? `Object ${p.object}`]
  if (p.instance !== undefined) parts.push(String(p.instance))
  if (p.resource !== undefined) parts.push(resourceDef(p.object, p.resource)?.name ?? `Resource ${p.resource}`)
  return parts.join(' / ')
}

/** Chemin LwM2M « /3303/0/5700 » → { object, instance?, resource?, resourceInstance? } (null si invalide). */
export function parsePath(path) {
  const parts = String(path ?? '')
    .split('/')
    .filter((s) => s !== '')
  if (!parts.length || parts.length > 4 || !parts.every((s) => /^\d+$/.test(s) && Number(s) <= 65535)) return null
  const [object, instance, resource, resourceInstance] = parts.map(Number)
  return { object, instance, resource, resourceInstance, depth: parts.length }
}

// --- Valeurs ------------------------------------------------------------------------------------

/** Valeur saisie (texte) → valeur typée ; lève une erreur si elle ne convient pas au type. */
export function parseValue(type, raw) {
  const text = String(raw ?? '').trim()
  if (type === 'boolean') {
    if (['1', 'true', 'on'].includes(text.toLowerCase())) return true
    if (['0', 'false', 'off'].includes(text.toLowerCase())) return false
    throw new Error(`Invalid boolean: ${raw}`)
  }
  if (type === 'integer' || type === 'time') {
    const n = Number(text)
    if (!text || !Number.isInteger(n)) throw new Error(`Invalid integer: ${raw}`)
    return n
  }
  if (type === 'float') {
    const n = Number(text.replace(',', '.'))
    if (!text || !Number.isFinite(n)) throw new Error(`Invalid number: ${raw}`)
    return n
  }
  if (type === 'opaque') return Buffer.from(text.replace(/\s+/g, ''), 'hex')
  return String(raw ?? '')
}

/** Valeur → texte LwM2M (« text/plain ») : booléens 0 / 1, opaque en base64. */
export function valueToText(value) {
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (Buffer.isBuffer(value)) return value.toString('base64')
  return String(value)
}

function encodeInteger(n) {
  if (n >= -128 && n <= 127) return Buffer.from([n & 0xff])
  if (n >= -32768 && n <= 32767) {
    const b = Buffer.alloc(2)
    b.writeInt16BE(n)
    return b
  }
  if (n >= -2147483648 && n <= 2147483647) {
    const b = Buffer.alloc(4)
    b.writeInt32BE(n)
    return b
  }
  const b = Buffer.alloc(8)
  b.writeBigInt64BE(BigInt(n))
  return b
}

/** Valeur typée → octets d'une ressource TLV. */
export function encodeTlvValue(type, value) {
  if (type === 'integer' || type === 'time') return encodeInteger(Math.trunc(Number(value)))
  if (type === 'float') {
    const b = Buffer.alloc(8)
    b.writeDoubleBE(Number(value))
    return b
  }
  if (type === 'boolean') return Buffer.from([value ? 1 : 0])
  if (type === 'opaque') return Buffer.from(value)
  return Buffer.from(String(value ?? ''), 'utf8')
}

/** Octets d'une ressource TLV → valeur selon le type (devinée si le type est inconnu). */
export function decodeTlvValue(type, bytes) {
  const n = bytes.length
  if (type === 'integer' || type === 'time') {
    if (n === 1) return bytes.readInt8(0)
    if (n === 2) return bytes.readInt16BE(0)
    if (n === 4) return bytes.readInt32BE(0)
    if (n === 8) return Number(bytes.readBigInt64BE(0))
  }
  if (type === 'float') {
    if (n === 4) return bytes.readFloatBE(0)
    if (n === 8) return bytes.readDoubleBE(0)
  }
  if (type === 'boolean' && n === 1) return bytes[0] !== 0
  if (type === 'string') return bytes.toString('utf8')
  if (type === 'opaque' || type) return bytes
  // Type inconnu : texte s'il est lisible, entier sur 1, 2, 4 ou 8 octets, sinon octets.
  const text = bytes.toString('utf8')
  if (n && /^[\x20-\x7e]+$/.test(text)) return text
  if ([1, 2, 4, 8].includes(n)) return decodeTlvValue('integer', bytes)
  return bytes
}

// --- TLV (application/vnd.oma.lwm2m+tlv) ------------------------------------------------------

/** Types d'identifiant TLV. */
const TLV = { instance: 0, resourceInstance: 1, multiple: 2, resource: 3 }
const TLV_NAMES = ['instance', 'resourceInstance', 'multiple', 'resource']

/**
 * Nœuds TLV → octets. Nœud : { type: 'instance' | 'multiple', id, children } ou
 * { type: 'resource' | 'resourceInstance', id, value: Buffer }.
 */
export function encodeTlv(nodes) {
  return Buffer.concat(
    nodes.map((node) => {
      const value = node.children ? encodeTlv(node.children) : Buffer.from(node.value)
      const longId = node.id > 255
      const length = value.length
      const lengthBytes = length < 8 ? 0 : length < 256 ? 1 : length < 65536 ? 2 : 3
      let typeByte = (TLV[node.type] << 6) | (longId ? 0x20 : 0) | (lengthBytes << 3)
      if (!lengthBytes) typeByte |= length
      const header = [typeByte]
      if (longId) header.push(node.id >> 8, node.id & 0xff)
      else header.push(node.id)
      for (let i = lengthBytes - 1; i >= 0; i--) header.push((length >> (8 * i)) & 0xff)
      return Buffer.concat([Buffer.from(header), value])
    })
  )
}

/** Octets TLV → nœuds (voir `encodeTlv`) ; lève une erreur si le contenu est mal formé. */
export function decodeTlv(buffer) {
  const data = Buffer.from(buffer)
  const nodes = []
  let i = 0
  while (i < data.length) {
    const typeByte = data[i++]
    const type = TLV_NAMES[typeByte >> 6]
    const longId = typeByte & 0x20
    const lengthBytes = (typeByte >> 3) & 0x03
    if (i + (longId ? 2 : 1) + lengthBytes > data.length) throw new Error('LwM2M TLV truncated')
    const id = longId ? data.readUInt16BE(i) : data[i]
    i += longId ? 2 : 1
    let length = typeByte & 0x07
    if (lengthBytes) {
      length = 0
      for (let k = 0; k < lengthBytes; k++) length = length * 256 + data[i++]
    }
    if (i + length > data.length) throw new Error('LwM2M TLV truncated')
    const value = data.subarray(i, i + length)
    i += length
    nodes.push(
      type === 'instance' || type === 'multiple' ? { type, id, children: decodeTlv(value) } : { type, id, value }
    )
  }
  return nodes
}

// --- Contenu ↔ valeurs par chemin ---------------------------------------------------------------

/**
 * Valeurs d'un contenu reçu pour une requête sur `path` : [{ path, value }]. Les types des
 * ressources connues servent au décodage TLV.
 */
export function decodeContent(format, payload, path) {
  const base = parsePath(path)
  if (format === FORMATS.TLV) {
    const values = []
    const walk = (nodes, prefix, level) => {
      for (const node of nodes) {
        if (node.type === 'instance') walk(node.children, [...prefix, node.id], 'instance')
        else if (node.type === 'multiple') walk(node.children, [...prefix, node.id], 'multiple')
        else {
          const segments = [...prefix, node.id]
          const [object, , resource] = segments
          const def = resourceDef(object, level === 'multiple' ? segments[2] : resource)
          values.push({ path: `/${segments.join('/')}`, value: decodeTlvValue(def?.type, node.value) })
        }
      }
    }
    const prefix = base ? [base.object, base.instance, base.resource].filter((v) => v !== undefined) : []
    // Lecture d'une ressource : le TLV contient la ressource elle-même (même identifiant).
    let nodes = decodeTlv(payload)
    // Lecture d'une instance : ses ressources, parfois enveloppées dans l'instance elle-même.
    if (base?.depth === 2 && nodes.length === 1 && nodes[0].type === 'instance' && nodes[0].id === base.instance)
      nodes = nodes[0].children
    if (base?.depth === 3) walk(nodes, prefix.slice(0, 2), 'instance')
    else walk(nodes, prefix, base?.depth === 2 ? 'instance' : 'object')
    return values
  }
  if (format === FORMATS.SENML_JSON || format === FORMATS.LWM2M_JSON) {
    const parsed = JSON.parse(payload.toString('utf8'))
    const records = Array.isArray(parsed) ? parsed : (parsed.e ?? []).map((e) => ({ ...e, bn: undefined }))
    let bn = Array.isArray(parsed) ? '' : (parsed.bn ?? '')
    return records.map((r) => {
      if (r.bn !== undefined) bn = r.bn
      const value = r.v ?? r.vs ?? r.sv ?? r.vb ?? r.bv ?? (r.vd !== undefined ? Buffer.from(r.vd, 'base64') : null)
      return { path: `${bn}${r.n ?? ''}`, value }
    })
  }
  if (format === FORMATS.TEXT || format === undefined) {
    const text = payload.toString('utf8')
    const def = base ? resourceDef(base.object, base.resource) : null
    let value = text
    try {
      if (def && def.type !== 'string') value = def.type === 'boolean' ? text === '1' : parseValue(def.type, text)
    } catch {
      // valeur gardée en texte
    }
    return [{ path: path || '/', value }]
  }
  return [{ path: path || '/', value: payloadText(payload) }]
}

/** Valeurs [{ path, value, type }] → SenML JSON (RFC 8428), noms relatifs au premier chemin. */
export function encodeSenml(values) {
  return JSON.stringify(
    values.map(({ path, value, type }, i) => {
      const record = i === 0 ? { bn: path.replace(/[^/]*$/, ''), n: path.split('/').pop() } : { n: '' }
      if (i > 0) {
        const bn = values[0].path.replace(/[^/]*$/, '')
        record.n = path.startsWith(bn) ? path.slice(bn.length) : path
      }
      if (type === 'boolean') record.vb = !!value
      else if (type === 'string') record.vs = String(value)
      else if (type === 'opaque') record.vd = Buffer.from(value).toString('base64')
      else record.v = Number(value)
      return record
    })
  )
}

/** Valeur affichable (texte) d'une valeur décodée. */
export function displayValue(value) {
  if (value === null || value === undefined) return '—'
  if (Buffer.isBuffer(value)) return value.toString('hex').replace(/(..)/g, '$1 ').trim()
  if (typeof value === 'number' && !Number.isInteger(value)) return String(Math.round(value * 1000) / 1000)
  return String(value)
}
