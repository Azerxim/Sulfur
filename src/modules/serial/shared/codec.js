import { LINE_ENDINGS, MAX_SEND } from './constants'
import { t } from './i18n'

/**
 * Octets d'une saisie hexadécimale : « 01 03 0A », « 01030a », « 0x01, 0x03 » ou « 01:03-0A ».
 * Chaque groupe est un nombre pair de chiffres (un chiffre seul vaut un octet : « 1 2 » = 01 02).
 */
export function parseHex(text) {
  const tokens = String(text ?? '')
    .replace(/0x/gi, ' ')
    .split(/[\s,;:-]+/)
    .filter(Boolean)
  const bytes = []
  for (const token of tokens) {
    if (!/^[0-9a-f]+$/i.test(token)) throw new Error(t('serial.errors.invalidHex', { value: token }))
    const digits = token.length === 1 ? `0${token}` : token
    if (digits.length % 2) throw new Error(t('serial.errors.oddHex', { value: token }))
    for (let i = 0; i < digits.length; i += 2) bytes.push(parseInt(digits.slice(i, i + 2), 16))
  }
  return Uint8Array.from(bytes)
}

const ESCAPES = { r: 0x0d, n: 0x0a, t: 0x09, 0: 0x00, e: 0x1b, '\\': 0x5c }
const utf8 = new TextEncoder()

/**
 * Octets d'un texte (UTF-8) avec séquences d'échappement : \r \n \t \0 \e (ESC) \\ et \xNN (octet
 * quelconque). Une barre oblique inverse suivie d'un autre caractère est gardée telle quelle.
 */
export function parseEscaped(text) {
  const bytes = []
  let plain = ''
  const source = String(text ?? '')
  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    if (c !== '\\' || i === source.length - 1) {
      plain += c
      continue
    }
    const next = source[i + 1]
    let byte = ESCAPES[next]
    let skip = 1
    if (next === 'x' && /^[0-9a-f]{2}$/i.test(source.slice(i + 2, i + 4))) {
      byte = parseInt(source.slice(i + 2, i + 4), 16)
      skip = 3
    }
    if (byte === undefined) {
      plain += c
      continue
    }
    bytes.push(...utf8.encode(plain), byte)
    plain = ''
    i += skip
  }
  bytes.push(...utf8.encode(plain))
  return Uint8Array.from(bytes)
}

/** Octets à envoyer : { mode: 'text' | 'hex', text, lineEnding } (fin de ligne : texte seulement). */
export function encodePayload({ mode = 'text', text = '', lineEnding = 'none' } = {}) {
  const data = mode === 'hex' ? parseHex(text) : parseEscaped(String(text ?? '') + (LINE_ENDINGS[lineEnding] ?? ''))
  if (!data.length) throw new Error(t('serial.errors.emptyPayload'))
  if (data.length > MAX_SEND) throw new Error(t('serial.errors.payloadTooLarge', { max: MAX_SEND }))
  return data
}

/** Notation hexadécimale « 01 03 0A » d'octets (Buffer, Uint8Array ou tableau). */
export const toHex = (bytes) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    .join(' ')
    .toUpperCase()

/** Octets d'une notation hexadécimale compacte (« 01030a », format du journal). */
export const fromHex = (hex) => Uint8Array.from(String(hex).match(/../g) ?? [], (h) => parseInt(h, 16))

const CONTROL_NAMES = { 0x00: '\\0', 0x09: '\\t', 0x0a: '\\n', 0x0d: '\\r', 0x1b: '\\e' }

/**
 * Segments affichables d'octets : [{ text, control }]. ASCII imprimable tel quel, caractères de
 * contrôle et octets ≥ 0x7F écrits comme dans une saisie (\r, \n, \xNN) et marqués `control`.
 */
export function textSegments(bytes) {
  const segments = []
  for (const b of bytes) {
    const control = b < 0x20 || b >= 0x7f
    const text = control
      ? (CONTROL_NAMES[b] ?? `\\x${b.toString(16).padStart(2, '0').toUpperCase()}`)
      : String.fromCharCode(b)
    const last = segments.at(-1)
    if (last && last.control === control) last.text += text
    else segments.push({ text, control })
  }
  return segments
}

/** Texte d'octets en une ligne (journal exporté, points de données). */
export const escapedText = (bytes) =>
  textSegments(bytes)
    .map((s) => s.text)
    .join('')
