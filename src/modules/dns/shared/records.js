/**
 * Enregistrements de la zone locale : noms relatifs ou absolus, valeurs saisies en texte.
 * Partagé par le serveur (conversion vers dns-packet) et l'interface (validation à la saisie).
 */

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/
const LABEL = /^(\*|[a-zA-Z0-9_]([a-zA-Z0-9_-]{0,61}[a-zA-Z0-9])?)$/

export const isIPv4 = (value) => IPV4.test(String(value))

export function isIPv6(value) {
  const text = String(value)
  if (!/^[0-9a-fA-F:.]+$/.test(text) || !text.includes(':')) return false
  const parts = text.split('::')
  if (parts.length > 2) return false
  const groups = (part) => (part ? part.split(':') : [])
  let head = groups(parts[0])
  let tail = parts.length === 2 ? groups(parts[1]) : []
  // IPv4 en fin d'adresse (::ffff:192.168.1.1) : compte pour deux groupes.
  const last = (tail.length ? tail : head).at(-1)
  let extra = 0
  if (last?.includes('.')) {
    if (!isIPv4(last)) return false
    if (tail.length) tail = tail.slice(0, -1)
    else head = head.slice(0, -1)
    extra = 2
  }
  const all = [...head, ...tail]
  if (!all.every((g) => /^[0-9a-fA-F]{1,4}$/.test(g))) return false
  const count = all.length + extra
  return parts.length === 2 ? count < 8 : count === 8
}

/** Nom de domaine valide (étiquettes de 63 caractères au plus, « * » en tête accepté). */
export function isDomainName(name) {
  const text = String(name).replace(/\.$/, '')
  if (!text || text.length > 253) return false
  return text.split('.').every((label, i) => LABEL.test(label) && (label !== '*' || i === 0))
}

/**
 * Nom absolu (sans point final, en minuscules) : « @ » désigne le domaine, un nom terminé par un
 * point est déjà absolu, un nom relatif est rattaché au domaine.
 */
export function absoluteName(name, domain) {
  const text = String(name ?? '').trim()
  const zone = String(domain ?? '')
    .trim()
    .replace(/\.$/, '')
    .toLowerCase()
  if (!text || text === '@') return zone
  if (text.endsWith('.')) return text.slice(0, -1).toLowerCase()
  return (zone ? `${text}.${zone}` : text).toLowerCase()
}

/**
 * Données dns-packet d'un enregistrement, ou exception avec la clé de traduction du problème
 * (`err.key`, `err.params`). Les noms cibles relatifs sont rattachés au domaine.
 */
export function recordData(record, domain) {
  const value = String(record.value ?? '').trim()
  const fail = (key, params = {}) => {
    const err = new Error(key)
    err.key = key
    err.params = { value, ...params }
    throw err
  }
  const target = (text) => {
    if (!isDomainName(text === '@' ? domain : text.replace(/\.$/, ''))) fail('dns.errors.invalidTarget')
    return absoluteName(text, domain)
  }
  const numbers = (parts, count) => {
    const values = parts.slice(0, count).map(Number)
    if (parts.length !== count + 1 || values.some((n) => !Number.isInteger(n) || n < 0 || n > 65535)) return null
    return values
  }
  switch (record.type) {
    case 'A':
      if (!isIPv4(value)) fail('dns.errors.invalidIPv4')
      return value
    case 'AAAA':
      if (!isIPv6(value)) fail('dns.errors.invalidIPv6')
      return value
    case 'CNAME':
    case 'NS':
    case 'PTR':
      return target(value)
    case 'MX': {
      const parts = value.split(/\s+/)
      const [preference] = numbers(parts, 1) ?? fail('dns.errors.invalidMx')
      return { preference, exchange: target(parts[1]) }
    }
    case 'SRV': {
      const parts = value.split(/\s+/)
      const [priority, weight, port] = numbers(parts, 3) ?? fail('dns.errors.invalidSrv')
      return { priority, weight, port, target: target(parts[3]) }
    }
    case 'TXT':
      if (!value) fail('dns.errors.emptyTxt')
      // Chaînes de 255 octets au plus par élément.
      return value.match(/.{1,255}/gsu)
    default:
      return fail('dns.errors.unknownType', { type: record.type })
  }
}

/** Problème d'un enregistrement pour l'interface : { key, params } ou null. */
export function recordProblem(record, domain) {
  const name = String(record.name ?? '').trim()
  if (name !== '@' && !isDomainName(name.replace(/\.$/, '')))
    return { key: 'dns.errors.invalidName', params: { value: name } }
  try {
    recordData(record, domain)
    return null
  } catch (err) {
    return { key: err.key ?? 'dns.errors.invalidValue', params: err.params ?? {} }
  }
}

/** Nom de résolution inverse d'une adresse : 10.1.168.192.in-addr.arpa, ou ip6.arpa. */
export function reverseName(address) {
  if (isIPv4(address)) return `${address.split('.').reverse().join('.')}.in-addr.arpa`
  if (!isIPv6(address)) return null
  // Développement de l'adresse IPv6 en 32 chiffres hexadécimaux.
  const [head, tail = ''] = address.split('::')
  const groups = (part) => (part ? part.split(':') : [])
  const h = groups(head)
  const tl = groups(tail)
  const full = [...h, ...Array(8 - h.length - tl.length).fill('0'), ...tl].map((g) => g.padStart(4, '0')).join('')
  return `${[...full].reverse().join('.')}.ip6.arpa`
}
