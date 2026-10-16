import { t } from './i18n'

/**
 * Chemin d'une route : segments fixes et paramètres `:nom` (ex. `/api/devices/:id`), `*` en dernier
 * segment pour accepter la suite du chemin. Retourne les paramètres, ou null si le chemin ne
 * correspond pas.
 */
export function matchPath(pattern, path) {
  const split = (p) => String(p).split('/').filter(Boolean)
  const parts = split(pattern)
  const segments = split(path)
  const params = {}
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (part === '*' && i === parts.length - 1) {
      params['*'] = segments.slice(i).join('/')
      return params
    }
    if (i >= segments.length) return null
    if (part.startsWith(':')) params[part.slice(1)] = decodeURIComponent(segments[i])
    else if (part !== segments[i]) return null
  }
  return segments.length === parts.length ? params : null
}

/** Valeur d'un chemin pointé (`data.items.0.value`) dans un objet ; `''` ou absent : l'objet lui-même. */
export function getPath(value, path) {
  if (path === undefined || path === null || path === '') return value
  let current = value
  for (const part of String(path).split('.')) {
    if (current === null || current === undefined) return undefined
    current = current[part]
  }
  return current
}

const text = (value) => {
  if (value === undefined || value === null) return ''
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

/**
 * Remplit un gabarit de réponse. Expressions `{{…}}` :
 *   var.<nom>      valeur d'une variable du serveur
 *   params.<nom>   paramètre du chemin (`:nom`)
 *   query.<nom>    paramètre de l'URL (`?nom=`)
 *   headers.<nom>  en-tête de la requête (en minuscules)
 *   body           corps reçu (texte) ; body.<chemin> : champ du corps JSON
 *   now            date ISO ; timestamp : millisecondes depuis 1970 ; uuid : identifiant aléatoire
 * Un objet est inséré en JSON, une valeur absente par une chaîne vide.
 */
export function renderTemplate(template, context) {
  return String(template ?? '').replace(/\{\{\s*([\w.*-]+)\s*\}\}/g, (_match, expr) => {
    const [root, ...rest] = expr.split('.')
    const path = rest.join('.')
    switch (root) {
      case 'now':
        return new Date().toISOString()
      case 'timestamp':
        return String(Date.now())
      case 'uuid':
        return crypto.randomUUID()
      case 'body':
        return path ? text(getPath(context.json, path)) : (context.body ?? '')
      case 'var':
        return text(context.variables?.[path])
      case 'params':
      case 'query':
      case 'headers':
        return text(getPath(context[root], path))
      default:
        return ''
    }
  })
}

/** Convertit une valeur reçue (texte, nombre, JSON) dans le type d'une variable. Lève une erreur traduite. */
export function coerce(value, dataType) {
  switch (dataType) {
    case 'Number':
    case 'Integer': {
      const n = Number(value)
      if (value === '' || value === null || !Number.isFinite(n)) {
        throw new Error(t('http.errors.notNumber', { value: text(value) }))
      }
      return dataType === 'Integer' ? Math.round(n) : n
    }
    case 'Boolean':
      if (typeof value === 'boolean') return value
      if (typeof value === 'number') return value !== 0
      return ['true', '1', 'on', 'yes', 'oui'].includes(String(value).trim().toLowerCase())
    case 'JSON':
      if (typeof value !== 'string') return value
      try {
        return JSON.parse(value)
      } catch {
        throw new Error(t('http.errors.invalidJson'))
      }
    default:
      return text(value)
  }
}

/** Nom de variable utilisable dans un chemin d'URL et un gabarit. */
export const VARIABLE_NAME = /^[A-Za-z_][\w-]*$/
