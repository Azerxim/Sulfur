/**
 * Messages Syslog : RFC 5424 (format actuel) et RFC 3164 (format BSD historique).
 * Partagé par le process principal (serveur, émetteur) et l'interface (aperçu du message).
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Champ RFC 5424 : caractères ASCII imprimables sans espace, `-` si vide. */
const field = (value, max) => {
  const clean = String(value ?? '').replace(/[^\x21-\x7e]/g, '')
  return clean ? clean.slice(0, max) : '-'
}

const pad = (n, size = 2) => String(n).padStart(size, '0')

/** Horodatage RFC 3164 : `Oct  9 14:05:03` (heure locale, sans année). */
function bsdTimestamp(date) {
  return `${MONTHS[date.getMonth()]} ${String(date.getDate()).padStart(2, ' ')} ${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}:${pad(date.getSeconds())}`
}

/** Valeur PRI : facilité × 8 + gravité. */
export const priority = (facility, severity) => Number(facility) * 8 + Number(severity)

/** Remplace `{n}` (numéro du message) et `{time}` (heure ISO) dans le texte d'un message. */
export const fillTemplate = (text, { n = 1, time = new Date() } = {}) =>
  String(text ?? '')
    .replaceAll('{n}', String(n))
    .replaceAll('{time}', time.toISOString())

/** Texte d'un message Syslog. */
export function encodeMessage({
  format = 'rfc5424',
  facility = 1,
  severity = 6,
  hostname,
  appName,
  procId,
  msgId,
  structuredData,
  message = '',
  time = new Date()
}) {
  const pri = `<${priority(facility, severity)}>`
  if (format === 'rfc3164') {
    const tag = String(appName ?? '')
      .replace(/[^\x21-\x7e]/g, '')
      .replace(/[[\]:]/g, '')
      .slice(0, 32)
    const pid = String(procId ?? '').trim()
    const prefix = tag ? `${tag}${pid ? `[${pid}]` : ''}: ` : ''
    return `${pri}${bsdTimestamp(time)} ${field(hostname, 255)} ${prefix}${message}`
  }
  const sd = String(structuredData ?? '').trim() || '-'
  return `${pri}1 ${time.toISOString()} ${field(hostname, 255)} ${field(appName, 48)} ${field(procId, 128)} ${field(
    msgId,
    32
  )} ${sd}${message ? ` ${message}` : ''}`
}

/** Données structurées RFC 5424 au début de `text` : `-` ou une suite de `[id param="valeur"…]`. */
function splitStructuredData(text) {
  if (text.startsWith('-')) return ['-', text.slice(1)]
  let i = 0
  while (text[i] === '[') {
    i++
    while (i < text.length && text[i] !== ']') {
      if (text[i] === '"') {
        i++
        while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1
      }
      i++
    }
    i++
  }
  return i > 0 ? [text.slice(0, i), text.slice(i)] : null
}

/** Éléments des données structurées : [{ id, params: { nom: valeur } }]. */
export function parseStructuredData(sd) {
  if (!sd || sd === '-') return []
  const elements = []
  for (const [, body] of sd.matchAll(/\[((?:[^\]"]|"(?:[^"\\]|\\.)*")*)\]/g)) {
    const [id] = body.split(' ', 1)
    const params = {}
    for (const [, name, value] of body.slice(id.length).matchAll(/([^\s=]+)="((?:[^"\\]|\\.)*)"/g)) {
      params[name] = value.replace(/\\(["\\\]])/g, '$1')
    }
    elements.push({ id, params })
  }
  return elements
}

const nil = (value) => (value === '-' ? '' : value)

/**
 * Analyse un message reçu. Retourne { facility, severity, format, timestamp, hostname, appName,
 * procId, msgId, structuredData, message } ; format `unknown` si l'en-tête n'est pas reconnu (le
 * reste du texte est alors le message, avec la priorité par défaut user.notice de la RFC 3164).
 */
export function parseMessage(raw, now = new Date()) {
  const text = String(raw).replace(/[\r\n\0]+$/, '')
  const head = text.match(/^<(\d{1,3})>/)
  const pri = head && Number(head[1]) <= 191 ? Number(head[1]) : 13
  const rest = head ? text.slice(head[0].length) : text
  const base = { facility: pri >> 3, severity: pri & 7, hostname: '', appName: '', procId: '', msgId: '' }

  const v1 = rest.match(/^1 (\S+) (\S+) (\S+) (\S+) (\S+) /)
  if (v1) {
    const sd = splitStructuredData(rest.slice(v1[0].length))
    if (sd) {
      const timestamp = v1[1] === '-' ? null : new Date(v1[1])
      return {
        ...base,
        format: 'rfc5424',
        timestamp: timestamp && !Number.isNaN(timestamp.getTime()) ? timestamp.toISOString() : null,
        hostname: nil(v1[2]),
        appName: nil(v1[3]),
        procId: nil(v1[4]),
        msgId: nil(v1[5]),
        structuredData: sd[0] === '-' ? '' : sd[0],
        // Message éventuellement précédé d'une marque d'ordre des octets UTF-8.
        message: sd[1].replace(/^ /, '').replace(/^\uFEFF/, '')
      }
    }
  }

  const bsd = rest.match(/^([A-Z][a-z]{2}) ([ \d]\d) (\d\d):(\d\d):(\d\d) (\S+) ?/)
  if (bsd && MONTHS.includes(bsd[1])) {
    const date = new Date(now.getFullYear(), MONTHS.indexOf(bsd[1]), Number(bsd[2]), +bsd[3], +bsd[4], +bsd[5])
    // Pas d'année dans la RFC 3164 : une date « dans le futur » date de l'année précédente.
    if (date - now > 86_400_000) date.setFullYear(date.getFullYear() - 1)
    const body = rest.slice(bsd[0].length)
    const tag = body.match(/^([^\s:[\]]{1,48})(?:\[([^\]]*)\])?: ?/)
    return {
      ...base,
      format: 'rfc3164',
      timestamp: date.toISOString(),
      hostname: bsd[6],
      appName: tag?.[1] ?? '',
      procId: tag?.[2] ?? '',
      structuredData: '',
      message: tag ? body.slice(tag[0].length) : body
    }
  }

  return { ...base, format: 'unknown', timestamp: null, structuredData: '', message: rest }
}
