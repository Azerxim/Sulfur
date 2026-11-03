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
import { t } from './i18n.js'

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

/**
 * Points de données d'un module à instances (contrat `PointsApi`, voir points.js), assemblés à
 * partir de ceux de chaque instance. `roles[role](objet, instance)` décrit les points d'une
 * instance : `{ points(), read(ids), write?(id, valeur), setFaults?(défauts) }`, aux identifiants
 * locaux à l'instance (sans préfixe). Les points publiés sont `<id instance>:<id>`, de groupe le rôle
 * et de `groupName` le nom de l'instance.
 * Défauts : un défaut sans point vaut pour toutes les instances qui en acceptent ; un défaut visant
 * des points ne concerne que les instances qui les portent (identifiants locaux).
 */
export function instancesPointsApi({ name, instances, roles, faultTypes }) {
  const entries = () =>
    instances
      .all()
      .filter(({ instance }) => Object.hasOwn(roles, instance.role))
      .map(({ instance, object }) => ({ instance, api: roles[instance.role](object, instance) }))

  const api = {
    name,

    points() {
      return entries().flatMap(({ instance, api: own }) =>
        own.points().map((p) => ({
          ...p,
          id: instancePointId(instance.id, p.id),
          group: instance.role,
          groupName: instance.name
        }))
      )
    },

    read(ids) {
      const list = entries()
      const values = {}
      for (const [instanceId, keys] of Map.groupBy(ids, (key) => parseInstancePointId(key).instanceId)) {
        const own = list.find((e) => e.instance.id === instanceId)?.api
        const read = own ? own.read(keys.map((key) => parseInstancePointId(key).id)) : {}
        for (const key of keys) values[key] = read[parseInstancePointId(key).id]
      }
      return values
    },

    async write(pointId, value) {
      const { instanceId, id } = parseInstancePointId(pointId)
      const own = entries().find((e) => e.instance.id === instanceId)?.api
      if (!own) throw new Error(t('errors.unknownInstance', { id: instanceId }))
      if (!own.write) throw new Error(t('errors.readOnlyPoint', { id: pointId }))
      return own.write(id, value)
    }
  }
  if (!faultTypes) return api
  return {
    ...api,
    faultTypes: () => (typeof faultTypes === 'function' ? faultTypes() : faultTypes),
    setFaults(faults) {
      for (const { instance, api: own } of entries()) {
        if (!own.setFaults) continue
        own.setFaults(
          faults.flatMap((f) => {
            if (!f.points?.length) return [{ ...f, points: [] }]
            const points = f.points
              .map(parseInstancePointId)
              .filter((p) => p.instanceId === instance.id)
              .map((p) => p.id)
            return points.length ? [{ ...f, points }] : []
          })
        )
      }
    }
  }
}
