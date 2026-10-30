/**
 * Codec CoAP (RFC 7252) : messages, options et codes. Pur (sans socket), partagé par le process
 * principal et les tests.
 *
 * Message : { type, code, mid, token: Buffer, options: [{ number, value: Buffer }], payload: Buffer }
 * `code` est l'octet du code (classe << 5 | détail), affiché « 2.05 » par `codeName`.
 */

export const VERSION = 1

/** Types de message. */
export const TYPES = { CON: 0, NON: 1, ACK: 2, RST: 3 }
export const TYPE_NAMES = ['CON', 'NON', 'ACK', 'RST']

/** Code d'un message : classe.détail → octet. */
export const code = (cls, detail) => (cls << 5) | detail

export const CODES = {
  EMPTY: 0,
  GET: code(0, 1),
  POST: code(0, 2),
  PUT: code(0, 3),
  DELETE: code(0, 4),
  CREATED: code(2, 1),
  DELETED: code(2, 2),
  VALID: code(2, 3),
  CHANGED: code(2, 4),
  CONTENT: code(2, 5),
  BAD_REQUEST: code(4, 0),
  UNAUTHORIZED: code(4, 1),
  BAD_OPTION: code(4, 2),
  NOT_FOUND: code(4, 4),
  METHOD_NOT_ALLOWED: code(4, 5),
  NOT_ACCEPTABLE: code(4, 6),
  UNSUPPORTED_FORMAT: code(4, 15),
  INTERNAL_ERROR: code(5, 0),
  NOT_IMPLEMENTED: code(5, 1),
  SERVICE_UNAVAILABLE: code(5, 3),
  GATEWAY_TIMEOUT: code(5, 4)
}

/** Méthodes des requêtes : nom → code. */
export const METHODS = { GET: CODES.GET, POST: CODES.POST, PUT: CODES.PUT, DELETE: CODES.DELETE }
export const METHOD_NAMES = Object.fromEntries(Object.entries(METHODS).map(([name, c]) => [c, name]))

/** Libellés des codes de réponse (anglais, comme dans la RFC). */
export const CODE_LABELS = {
  [CODES.CREATED]: 'Created',
  [CODES.DELETED]: 'Deleted',
  [CODES.VALID]: 'Valid',
  [CODES.CHANGED]: 'Changed',
  [CODES.CONTENT]: 'Content',
  [CODES.BAD_REQUEST]: 'Bad Request',
  [CODES.UNAUTHORIZED]: 'Unauthorized',
  [CODES.BAD_OPTION]: 'Bad Option',
  [code(4, 3)]: 'Forbidden',
  [CODES.NOT_FOUND]: 'Not Found',
  [CODES.METHOD_NOT_ALLOWED]: 'Method Not Allowed',
  [CODES.NOT_ACCEPTABLE]: 'Not Acceptable',
  [code(4, 12)]: 'Precondition Failed',
  [code(4, 13)]: 'Request Entity Too Large',
  [CODES.UNSUPPORTED_FORMAT]: 'Unsupported Content-Format',
  [CODES.INTERNAL_ERROR]: 'Internal Server Error',
  [CODES.NOT_IMPLEMENTED]: 'Not Implemented',
  [code(5, 2)]: 'Bad Gateway',
  [CODES.SERVICE_UNAVAILABLE]: 'Service Unavailable',
  [CODES.GATEWAY_TIMEOUT]: 'Gateway Timeout'
}

/** « 2.05 » pour un octet de code. */
export const codeName = (value) => `${value >> 5}.${String(value & 0x1f).padStart(2, '0')}`

/** Code « 4.04 » → octet (null si invalide). */
export function parseCode(text) {
  const m = /^([0-7])\.(\d{2})$/.exec(String(text).trim())
  if (!m || Number(m[2]) > 31) return null
  return code(Number(m[1]), Number(m[2]))
}

export const isRequest = (value) => value >> 5 === 0 && value !== 0
export const isResponse = (value) => value >> 5 >= 2
export const isSuccess = (value) => value >> 5 === 2

/** Options (RFC 7252 § 5.10, RFC 7641, RFC 7959) : numéro, nom et format de la valeur. */
export const OPTIONS = {
  IF_MATCH: 1,
  URI_HOST: 3,
  ETAG: 4,
  IF_NONE_MATCH: 5,
  OBSERVE: 6,
  URI_PORT: 7,
  LOCATION_PATH: 8,
  URI_PATH: 11,
  CONTENT_FORMAT: 12,
  MAX_AGE: 14,
  URI_QUERY: 15,
  ACCEPT: 17,
  LOCATION_QUERY: 20,
  BLOCK2: 23,
  BLOCK1: 27,
  SIZE2: 28,
  PROXY_URI: 35,
  SIZE1: 60
}

const OPTION_FORMATS = {
  [OPTIONS.IF_MATCH]: 'opaque',
  [OPTIONS.URI_HOST]: 'string',
  [OPTIONS.ETAG]: 'opaque',
  [OPTIONS.IF_NONE_MATCH]: 'empty',
  [OPTIONS.OBSERVE]: 'uint',
  [OPTIONS.URI_PORT]: 'uint',
  [OPTIONS.LOCATION_PATH]: 'string',
  [OPTIONS.URI_PATH]: 'string',
  [OPTIONS.CONTENT_FORMAT]: 'uint',
  [OPTIONS.MAX_AGE]: 'uint',
  [OPTIONS.URI_QUERY]: 'string',
  [OPTIONS.ACCEPT]: 'uint',
  [OPTIONS.LOCATION_QUERY]: 'string',
  [OPTIONS.BLOCK2]: 'uint',
  [OPTIONS.BLOCK1]: 'uint',
  [OPTIONS.SIZE2]: 'uint',
  [OPTIONS.PROXY_URI]: 'string',
  [OPTIONS.SIZE1]: 'uint'
}

export const OPTION_NAMES = {
  1: 'If-Match',
  3: 'Uri-Host',
  4: 'ETag',
  5: 'If-None-Match',
  6: 'Observe',
  7: 'Uri-Port',
  8: 'Location-Path',
  11: 'Uri-Path',
  12: 'Content-Format',
  14: 'Max-Age',
  15: 'Uri-Query',
  17: 'Accept',
  20: 'Location-Query',
  23: 'Block2',
  27: 'Block1',
  28: 'Size2',
  35: 'Proxy-Uri',
  60: 'Size1'
}

/** Formats de contenu (registre IANA « CoAP Content-Formats »). */
export const CONTENT_FORMATS = {
  0: 'text/plain',
  40: 'application/link-format',
  41: 'application/xml',
  42: 'application/octet-stream',
  47: 'application/exi',
  50: 'application/json',
  60: 'application/cbor',
  110: 'application/senml+json',
  112: 'application/senml+cbor',
  11542: 'application/vnd.oma.lwm2m+tlv',
  11543: 'application/vnd.oma.lwm2m+json'
}

export const FORMATS = {
  TEXT: 0,
  LINK: 40,
  OCTETS: 42,
  JSON: 50,
  SENML_JSON: 110,
  TLV: 11542,
  LWM2M_JSON: 11543
}

export const formatName = (value) => CONTENT_FORMATS[value] ?? String(value)

/** Valeur d'option encodée : entier non signé au plus court, texte UTF-8 ou octets. */
export function encodeOptionValue(number, value) {
  if (Buffer.isBuffer(value)) return value
  // Le format de l'option décide : un segment de chemin « 3 » reste un texte.
  const format = OPTION_FORMATS[number] ?? (typeof value === 'number' ? 'uint' : 'string')
  if (format === 'uint') {
    let n = Number(value)
    const bytes = []
    while (n > 0) {
      bytes.unshift(n & 0xff)
      n = Math.floor(n / 256)
    }
    return Buffer.from(bytes)
  }
  if (value === undefined || value === null) return Buffer.alloc(0)
  return Buffer.from(String(value), 'utf8')
}

/** Valeur d'option décodée selon son format (entier, texte ou octets). */
export function decodeOptionValue(number, value) {
  const format = OPTION_FORMATS[number]
  if (format === 'uint') return value.reduce((n, b) => n * 256 + b, 0)
  if (format === 'string') return value.toString('utf8')
  return value
}

/** Option : { number, value } avec une valeur encodée. */
export const option = (number, value) => ({ number, value: encodeOptionValue(number, value) })

/** Valeurs décodées de toutes les options `number` d'un message. */
export const optionValues = (msg, number) =>
  msg.options.filter((o) => o.number === number).map((o) => decodeOptionValue(number, o.value))

/** Valeur décodée de la première option `number` (undefined si absente). */
export const optionValue = (msg, number) => optionValues(msg, number)[0]

/** Options d'un chemin (« /a/b » → Uri-Path a, Uri-Path b) et d'une requête (« x=1&y » → Uri-Query). */
export function uriOptions(path = '', query = '') {
  const segments = String(path)
    .split('/')
    .filter((s) => s !== '')
    .map((s) => option(OPTIONS.URI_PATH, decodeURIComponent(s)))
  const queries = String(query)
    .replace(/^\?/, '')
    .split('&')
    .filter(Boolean)
    .map((q) => option(OPTIONS.URI_QUERY, decodeURIComponent(q)))
  return [...segments, ...queries]
}

/** Chemin d'une requête (« /sensors/temp ») à partir de ses options Uri-Path. */
export const messagePath = (msg) => `/${optionValues(msg, OPTIONS.URI_PATH).join('/')}`

/** Paramètres Uri-Query d'une requête : { ep: 'device', lt: '300', b: 'U' }. */
export function messageQuery(msg) {
  return Object.fromEntries(
    optionValues(msg, OPTIONS.URI_QUERY).map((q) => {
      const i = q.indexOf('=')
      return i < 0 ? [q, ''] : [q.slice(0, i), q.slice(i + 1)]
    })
  )
}

function nibble(value) {
  if (value < 13) return [value, []]
  if (value < 269) return [13, [value - 13]]
  return [14, [(value - 269) >> 8, (value - 269) & 0xff]]
}

/** Message CoAP → octets. Les options sont triées par numéro (encodage par différence). */
export function encode({ type = TYPES.CON, code: c = 0, mid = 0, token = Buffer.alloc(0), options = [], payload }) {
  const tok = Buffer.from(token)
  if (tok.length > 8) throw new Error('CoAP token longer than 8 bytes')
  const parts = [Buffer.from([(VERSION << 6) | (type << 4) | tok.length, c, (mid >> 8) & 0xff, mid & 0xff]), tok]
  let previous = 0
  for (const { number, value } of [...options].sort((a, b) => a.number - b.number)) {
    const [delta, deltaExt] = nibble(number - previous)
    const [length, lengthExt] = nibble(value.length)
    parts.push(Buffer.from([(delta << 4) | length, ...deltaExt, ...lengthExt]), value)
    previous = number
  }
  const body = payload === undefined || payload === null ? Buffer.alloc(0) : Buffer.from(payload)
  if (body.length) parts.push(Buffer.from([0xff]), body)
  return Buffer.concat(parts)
}

/** Octets → message CoAP ; lève une erreur si le message est mal formé. */
export function decode(buffer) {
  const data = Buffer.from(buffer)
  if (data.length < 4) throw new Error('CoAP message too short')
  const version = data[0] >> 6
  if (version !== VERSION) throw new Error(`Unsupported CoAP version ${version}`)
  const type = (data[0] >> 4) & 0x03
  const tkl = data[0] & 0x0f
  if (tkl > 8) throw new Error('Invalid CoAP token length')
  const msg = {
    type,
    code: data[1],
    mid: data.readUInt16BE(2),
    token: data.subarray(4, 4 + tkl),
    options: [],
    payload: Buffer.alloc(0)
  }
  if (data.length < 4 + tkl) throw new Error('CoAP message truncated')
  let i = 4 + tkl
  let number = 0
  const ext = (nib) => {
    if (nib < 13) return nib
    if (nib === 13) {
      if (i >= data.length) throw new Error('CoAP option truncated')
      return data[i++] + 13
    }
    if (nib === 14) {
      if (i + 1 >= data.length) throw new Error('CoAP option truncated')
      const v = data.readUInt16BE(i) + 269
      i += 2
      return v
    }
    throw new Error('Invalid CoAP option nibble')
  }
  while (i < data.length) {
    if (data[i] === 0xff) {
      msg.payload = data.subarray(i + 1)
      if (!msg.payload.length) throw new Error('CoAP payload marker without payload')
      break
    }
    const byte = data[i++]
    number += ext(byte >> 4)
    const length = ext(byte & 0x0f)
    if (i + length > data.length) throw new Error('CoAP option truncated')
    msg.options.push({ number, value: data.subarray(i, i + length) })
    i += length
  }
  return msg
}

/** Résumé lisible d'un message pour les journaux : « CON GET /sensors/temp » ou « ACK 2.05 Content ». */
export function describe(msg) {
  const type = TYPE_NAMES[msg.type]
  if (msg.code === 0) return `${type} (empty)`
  if (isRequest(msg.code)) return `${type} ${METHOD_NAMES[msg.code] ?? codeName(msg.code)} ${messagePath(msg)}`
  return `${type} ${codeName(msg.code)} ${CODE_LABELS[msg.code] ?? ''}`.trim()
}

/** Contenu d'un message en texte : UTF-8 lisible, sinon hexadécimal. */
export function payloadText(payload) {
  if (!payload?.length) return ''
  const text = payload.toString('utf8')
  // eslint-disable-next-line no-control-regex
  return /[\u0000-\u0008\u000e-\u001f�]/.test(text) ? payload.toString('hex').replace(/(..)/g, '$1 ').trim() : text
}

/** Liens CoRE (RFC 6690) : « </a>;rt="x";obs,</b> » → [{ href: '/a', attrs: { rt: 'x', obs: true } }]. */
export function parseLinks(text) {
  const links = []
  const source = String(text ?? '')
  let i = 0
  while (i < source.length) {
    while (source[i] === ',' || source[i] === ' ' || source[i] === '\n') i++
    if (source[i] !== '<') break
    const end = source.indexOf('>', i)
    if (end < 0) break
    const link = { href: source.slice(i + 1, end), attrs: {} }
    i = end + 1
    while (source[i] === ';') {
      i++
      let key = ''
      while (i < source.length && !'=;,'.includes(source[i])) key += source[i++]
      let value = true
      if (source[i] === '=') {
        i++
        if (source[i] === '"') {
          const close = source.indexOf('"', i + 1)
          value = source.slice(i + 1, close < 0 ? undefined : close)
          i = close < 0 ? source.length : close + 1
        } else {
          value = ''
          while (i < source.length && !';,'.includes(source[i])) value += source[i++]
        }
      }
      link.attrs[key.trim()] = value
    }
    links.push(link)
  }
  return links
}

/** Liens CoRE → texte (« link-format »). */
export const formatLinks = (links) =>
  links
    .map(
      ({ href, attrs = {} }) =>
        `<${href}>` +
        Object.entries(attrs)
          .map(([k, v]) => (v === true ? `;${k}` : typeof v === 'number' ? `;${k}=${v}` : `;${k}="${v}"`))
          .join('')
    )
    .join(',')
