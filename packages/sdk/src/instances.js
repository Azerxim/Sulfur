/**
 * Instances des modules : un module peut avoir autant de serveurs, de clients… (« rôles ») qu'on le
 * souhaite ; aucune instance n'existe par défaut.
 *
 * - La liste des instances est la section `instances` de la configuration du module :
 *   `[{ id, role, name }]`, tenue par le process principal (voir `defineInstances` de /main).
 * - Les réglages d'une instance sont rangés dans des sections propres : `instanceSection('server',
 *   id)` → `server:<id>`, supprimées avec l'instance.
 * - Un point de données d'une instance a pour identifiant local `<id instance>:<id du point>`
 *   (`instancePointId`), soit `<moduleId>/<id instance>:<id du point>` hors du module.
 */
import { isPlainObject } from './config.js'

/** Section de la configuration qui liste les instances. */
export const INSTANCES_SECTION = 'instances'

/** Identifiant d'instance valide : lettres, chiffres, `-` et `_` (il entre dans les canaux IPC). */
export const INSTANCE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/

/** Section de configuration d'une instance : `<section>:<id>`. */
export const instanceSection = (section, id) => `${section}:${id}`

/** Identifiant local d'un point d'instance : `<id instance>:<id du point>`. */
export const instancePointId = (instanceId, id) => `${instanceId}:${id}`

/** Décompose un identifiant local de point d'instance ({ instanceId, id }). */
export function parseInstancePointId(pointId) {
  const s = String(pointId)
  const i = s.indexOf(':')
  return i < 0 ? { instanceId: s, id: '' } : { instanceId: s.slice(0, i), id: s.slice(i + 1) }
}

/** Liste des instances d'une configuration de module (entrées invalides écartées). */
export function instancesOf(config) {
  const list = config?.[INSTANCES_SECTION]
  if (!Array.isArray(list)) return []
  return list.filter(
    (i) =>
      isPlainObject(i) && INSTANCE_ID_PATTERN.test(i.id) && typeof i.role === 'string' && typeof i.name === 'string'
  )
}

/**
 * Convertit une configuration antérieure aux instances (un serveur et un client uniques) :
 * pour chaque rôle de `roles` (`{ server: { sections: ['server'], name: 'Serveur 1' } }`), si une
 * de ses sections existe, une instance d'identifiant égal au rôle est créée et les sections sont
 * renommées (`server` → `server:server`). L'identifiant de l'instance étant celui du rôle, les
 * identifiants des points (`server:<id>`) restent ceux d'avant : les flux du simulateur et les
 * courbes qui les visent fonctionnent toujours.
 * Sans effet si la configuration a déjà une liste d'instances.
 */
export function migrateToInstances(config, roles) {
  if (!isPlainObject(config) || INSTANCES_SECTION in config) return config
  const next = { ...config }
  const instances = []
  for (const [role, { sections, name }] of Object.entries(roles)) {
    const present = sections.filter((section) => section in config)
    if (!present.length) continue
    instances.push({ id: role, role, name })
    for (const section of present) {
      next[instanceSection(section, role)] = config[section]
      delete next[section]
    }
  }
  if (!instances.length) return config
  next[INSTANCES_SECTION] = instances
  return next
}

/** Premier nom libre de la forme « <libellé> <n> » parmi les instances `instances`. */
export function nextInstanceName(label, instances) {
  const names = new Set(instances.map((i) => i.name))
  let n = 1
  while (names.has(`${label} ${n}`)) n++
  return `${label} ${n}`
}
