/**
 * Points de données partagés entre modules (process principal).
 *
 * Un module de protocole publie ses points avec `ctx.expose(api)` ; les modules transverses
 * (simulateur, courbes) les retrouvent avec `ctx.peers()`. Contrat de `api` :
 *
 *   name                     nom affiché du module (ex. 'OPC UA')
 *   points()                 [{ id, group: 'server' | 'client', name, dataType, numeric, writable }]
 *                            `id` est local au module ; les points du serveur sont listés même
 *                            serveur arrêté (configuration enregistrée)
 *   read(ids)                { [id]: valeur } — valeur courante, undefined si indisponible
 *   write(id, value)         écrit une valeur (Promise) ; lève une erreur traduite si impossible
 *   faultTypes()             défauts injectables : [{ type, codes?: [{ value, label }], points?: true }]
 *   setFaults(faults)        défauts actifs pour ce module : [{ id, type, params, points }]
 *
 * Hors du module, un point est désigné par `<moduleId>/<id local>` (voir pointKey / parsePointKey).
 */

export const pointKey = (moduleId, id) => `${moduleId}/${id}`

export function parsePointKey(key) {
  const i = String(key).indexOf('/')
  return i < 0 ? { moduleId: key, id: '' } : { moduleId: key.slice(0, i), id: key.slice(i + 1) }
}

/** Valeur numérique pour un graphique ou un fichier CSV (booléen → 0 / 1), null sinon. */
export function toNumber(value) {
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  return null
}

/** Défauts communs, dans l'ordre d'affichage (libellés : simulator.faults.types.*). */
export const FAULT_TYPES = ['delay', 'noResponse', 'cut', 'exception', 'badStatus', 'kissOfDeath', 'freeze']
