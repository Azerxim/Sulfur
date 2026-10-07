import { DATA_TYPES } from './constants'

/** Nom utilisable pour un type structuré, un champ ou un argument (aussi sûr dans un NodeSet XML). */
export const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * Lit une liste de champs ou d'arguments saisie sous la forme « Nom:Type, Autre:Type[] »
 * (`[]` : tableau). Lève une erreur dont le message est la partie fautive.
 * `types` : types autorisés (par défaut, les types de base).
 */
export function parseFields(text, types = DATA_TYPES) {
  const fields = String(text ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^([^:\s]+)\s*:\s*([A-Za-z0-9_]+)\s*(\[\])?$/)
      if (!match || !NAME_PATTERN.test(match[1]) || !types.includes(match[2])) throw new Error(part)
      return { name: match[1], dataType: match[2], array: !!match[3] }
    })
  const names = fields.map((f) => f.name)
  const duplicate = names.find((n, i) => names.indexOf(n) !== i)
  if (duplicate) throw new Error(duplicate)
  return fields
}

export const formatFields = (fields = []) =>
  fields.map((f) => `${f.name}:${f.dataType}${f.array ? '[]' : ''}`).join(', ')
