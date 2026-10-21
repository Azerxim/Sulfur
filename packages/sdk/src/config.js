/**
 * Configurations enregistrées des modules.
 *
 * Chaque module conserve un objet `{ <section>: valeur }` (ex. `server`, `client`) dans
 * `<userData>/modules/<id>/config.json`. Les sections sont restaurées au démarrage par-dessus les
 * valeurs par défaut, pour qu'une configuration ancienne reste valable lorsque des réglages
 * sont ajoutés.
 */

export const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * Valeur enregistrée complétée par les valeurs par défaut : les clés absentes reprennent la valeur
 * par défaut ; les objets sont complétés récursivement, les tableaux enregistrés remplacent ceux par
 * défaut. Un objet ou un tableau attendu mais remplacé par autre chose revient à la valeur par défaut.
 */
export function withDefaults(defaults, saved) {
  if (saved === undefined || saved === null) return defaults
  if (Array.isArray(defaults)) return Array.isArray(saved) ? saved : defaults
  if (!isPlainObject(defaults)) return saved
  if (!isPlainObject(saved)) return defaults
  const result = { ...saved }
  for (const [key, value] of Object.entries(defaults)) result[key] = withDefaults(value, saved[key])
  return result
}
