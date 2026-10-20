/**
 * Noms distinctifs (DN) et fichiers LDIF (RFC 2849), partagés par le serveur et l'interface.
 */

/** Composants d'un DN (« uid=x, ou=people,dc=a » → [['uid','x'], ['ou','people'], ['dc','a']]). */
export function parseDn(dn) {
  const text = String(dn ?? '').trim()
  if (!text) return []
  const parts = []
  let current = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '\\' && i + 1 < text.length) {
      current += c + text[++i]
    } else if (c === ',' || c === ';') {
      parts.push(current)
      current = ''
    } else current += c
  }
  parts.push(current)
  return parts.map((part) => {
    const eq = part.indexOf('=')
    if (eq <= 0) throw new Error(`invalid DN component: ${part}`)
    return [part.slice(0, eq).trim(), part.slice(eq + 1).trim()]
  })
}

/** DN normalisé pour les comparaisons : types et valeurs en minuscules, sans espaces superflus. */
export function normalizeDn(dn) {
  return parseDn(dn)
    .map(([type, value]) => `${type.toLowerCase()}=${value.replace(/\s+/g, ' ').toLowerCase()}`)
    .join(',')
}

export function isValidDn(dn) {
  try {
    return parseDn(dn).length > 0
  } catch {
    return false
  }
}

/** DN parent (normalisé), ou '' pour un DN d'un seul composant. */
export const parentDn = (normalized) => normalized.split(',').slice(1).join(',')

/** `dn` est-il `base` ou un de ses descendants (DN normalisés) ? */
export const isUnder = (dn, base) => !base || dn === base || dn.endsWith(`,${base}`)

const decodeBase64 = (text) => new TextDecoder().decode(Uint8Array.from(atob(text.trim()), (c) => c.charCodeAt(0)))

/**
 * Lit un texte LDIF : entrées séparées par une ligne vide, lignes « attribut: valeur »,
 * « attribut:: base64 », lignes repliées (commençant par une espace), commentaires « # ».
 * Retourne { entries: [{ dn, attributes: { nom: [valeurs] } }], errors: [{ line, message }] }.
 */
export function parseLdif(text) {
  const entries = []
  const errors = []
  // Déplie les lignes continuées.
  const lines = []
  String(text ?? '')
    .split(/\r?\n/)
    .forEach((raw, index) => {
      if (raw.startsWith(' ') && lines.length && lines.at(-1).text !== '') lines.at(-1).text += raw.slice(1)
      else lines.push({ text: raw, line: index + 1 })
    })

  let current = null
  const finish = () => {
    if (current) entries.push(current)
    current = null
  }
  for (const { text: line, line: number } of lines) {
    if (line.trim() === '') {
      finish()
      continue
    }
    if (line.startsWith('#')) continue
    if (/^version:\s*1\s*$/i.test(line) && !current) continue
    const match = line.match(/^([A-Za-z0-9][A-Za-z0-9.;-]*)(::?)\s?(.*)$/)
    if (!match) {
      errors.push({ line: number, message: 'syntax' })
      continue
    }
    const [, name, sep, rawValue] = match
    let value = rawValue
    if (sep === '::') {
      try {
        value = decodeBase64(rawValue)
      } catch {
        errors.push({ line: number, message: 'base64' })
        continue
      }
    }
    if (name.toLowerCase() === 'dn') {
      finish()
      if (!isValidDn(value)) {
        errors.push({ line: number, message: 'dn' })
        current = null
        continue
      }
      current = { dn: value.trim(), attributes: {}, line: number }
      continue
    }
    if (!current) {
      errors.push({ line: number, message: 'noDn' })
      continue
    }
    const key = Object.keys(current.attributes).find((k) => k.toLowerCase() === name.toLowerCase()) ?? name
    ;(current.attributes[key] ??= []).push(value)
  }
  finish()

  const seen = new Set()
  for (const entry of entries) {
    const dn = normalizeDn(entry.dn)
    if (seen.has(dn)) errors.push({ line: entry.line, message: 'duplicate' })
    seen.add(dn)
  }
  return { entries: entries.map(({ line: _line, ...entry }) => entry), errors }
}
