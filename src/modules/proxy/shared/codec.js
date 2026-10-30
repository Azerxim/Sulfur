import { getLocale } from '@azerxim/sulfur-sdk'

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
 * contrôle et octets ≥ 0x7F écrits comme des séquences (\r, \n, \xNN) et marqués `control`.
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

/** Texte d'octets en une ligne (journal exporté). */
export const escapedText = (bytes) =>
  textSegments(bytes)
    .map((s) => s.text)
    .join('')

/** Taille lisible d'un volume de données dans la langue de l'interface (o, Ko, Mo / B, kB, MB). */
export function formatBytes(bytes) {
  const [value, unit] =
    bytes < 1024 ? [bytes, 'byte'] : bytes < 1024 * 1024 ? [bytes / 1024, 'kilobyte'] : [bytes / 1048576, 'megabyte']
  return new Intl.NumberFormat(getLocale(), {
    style: 'unit',
    unit,
    unitDisplay: 'short',
    maximumFractionDigits: 1
  }).format(value)
}
