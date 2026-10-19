/** Topics MQTT : validation, filtres à jokers, valeurs des contenus. */

/** Nom de topic de publication : non vide, sans joker ni caractère nul. */
export const isValidTopic = (topic) => typeof topic === 'string' && topic.length > 0 && !/[+#\0]/.test(topic)

/** Filtre d'abonnement : `+` occupe un niveau entier, `#` est le dernier niveau. */
export function isValidFilter(filter) {
  if (typeof filter !== 'string' || !filter || filter.includes('\0')) return false
  const levels = filter.split('/')
  return levels.every(
    (level, i) => (level !== '#' || i === levels.length - 1) && (!/[+#]/.test(level) || level.length === 1)
  )
}

/** Vrai si `topic` correspond au filtre `filter` (les topics `$…` ne correspondent qu'à un filtre `$…`). */
export function matchTopic(filter, topic) {
  const f = filter.split('/')
  const t = topic.split('/')
  if (topic.startsWith('$') !== filter.startsWith('$')) return false
  for (let i = 0; i < f.length; i++) {
    if (f[i] === '#') return true
    if (i >= t.length) return false
    if (f[i] !== '+' && f[i] !== t[i]) return false
  }
  return f.length === t.length
}

/** Valeur dans un objet par un chemin `a.b.0.c`. */
function pick(value, path) {
  return path
    .split('.')
    .filter(Boolean)
    .reduce((v, key) => (v !== null && typeof v === 'object' ? v[key] : undefined), value)
}

/**
 * Valeur d'un contenu reçu : nombre, booléen, objet JSON ou texte. `field` (chemin dans l'objet
 * JSON, ex. `value` ou `data.temp`) extrait une valeur d'un contenu JSON.
 */
export function payloadValue(text, field = '') {
  const s = String(text ?? '').trim()
  let value = s
  if (s === 'true' || s === 'false') value = s === 'true'
  else if (s !== '' && Number.isFinite(Number(s))) value = Number(s)
  else if (/^[[{"]/.test(s)) {
    try {
      value = JSON.parse(s)
    } catch {
      // texte qui ressemble à du JSON
    }
  }
  return field ? pick(value, field) : value
}
