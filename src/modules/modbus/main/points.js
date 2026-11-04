import { instancePointId, instanceSection, parseInstancePointId } from '@azerxim/sulfur-sdk'
import { DEFAULT_SERVER_CONFIG, TABLES } from '../shared/constants'
import { allPoints, normalizeServerConfig, unitLabel } from '../shared/units'
import { t } from '../shared/i18n'

/** Codes d'exception proposés pour le défaut « exception forcée ». */
export const FAULT_EXCEPTIONS = [
  { value: 1, label: '01 Illegal function' },
  { value: 2, label: '02 Illegal data address' },
  { value: 3, label: '03 Illegal data value' },
  { value: 4, label: '04 Server device failure' },
  { value: 6, label: '06 Server device busy' },
  { value: 10, label: '0A Gateway path unavailable' },
  { value: 11, label: '0B Gateway target failed to respond' }
]

/**
 * Points de données du module Modbus pour les autres modules (contrat : `points.js` du SDK) : points
 * de chaque serveur et surveillances de chaque client, d'identifiant `<id instance>:<id>`.
 */
export function createPointsApi({ instances, savedConfig = () => ({}) }) {
  /** Configuration d'un serveur : celle en marche, sinon celle enregistrée. */
  const serverConfig = (instance, server) =>
    server.status().config ??
    normalizeServerConfig(savedConfig()[instanceSection('server', instance.id)]) ??
    DEFAULT_SERVER_CONFIG

  /** Instance désignée par un identifiant de point : { instance, object, id } ou null. */
  const resolve = (pointId) => {
    const { instanceId, id } = parseInstancePointId(pointId)
    const entry = instances.all().find(({ instance }) => instance.id === instanceId)
    return entry ? { ...entry, id } : null
  }

  return {
    name: 'Modbus',

    points() {
      return instances.all().flatMap(({ instance, object }) => {
        const base = { group: instance.role, groupName: instance.name, numeric: true }
        if (instance.role === 'client') {
          return object.status().watches.map((w) => ({
            ...base,
            id: instancePointId(instance.id, w.id),
            name: w.label || `${TABLES[w.table]?.prefix ?? ''}${w.address}`,
            dataType: w.dataType,
            writable: !!TABLES[w.table]?.writable
          }))
        }
        const list = allPoints(serverConfig(instance, object))
        // Plusieurs équipements : le nom du point est précédé de celui de son équipement.
        const several = new Set(list.map(({ unit }) => unit.id)).size > 1
        return list.map(({ unit, point: p }) => ({
          ...base,
          id: instancePointId(instance.id, p.id),
          name: several ? `${unitLabel(unit)} · ${p.name}` : p.name,
          dataType: p.dataType,
          writable: true
        }))
      })
    },

    read(ids) {
      const values = new Map()
      return Object.fromEntries(
        ids.map((pointId) => {
          const target = resolve(pointId)
          if (!target) return [pointId, undefined]
          const { instance, object, id } = target
          if (instance.role === 'client') return [pointId, object.last.get(id)?.value ?? undefined]
          if (!values.has(instance.id)) values.set(instance.id, object.values())
          return [pointId, values.get(instance.id)[id]]
        })
      )
    },

    async write(pointId, value) {
      const target = resolve(pointId)
      if (!target) throw new Error(t('errors.unknownInstance', { id: parseInstancePointId(pointId).instanceId }))
      const { instance, object, id } = target
      if (instance.role === 'server') return object.setValue(id, value)
      const watch = object.watches.get(id)
      if (!watch) throw new Error(t('modbus.errors.unknownWatch'))
      return object.writeValue(watch.table, watch.address, value, watch.dataType, watch.wordOrder)
    },

    faultTypes() {
      return [
        { type: 'delay' },
        { type: 'noResponse' },
        { type: 'cut' },
        { type: 'exception', codes: FAULT_EXCEPTIONS, scope: true },
        { type: 'freeze', points: true }
      ]
    },

    /**
     * Les défauts portent sur les serveurs : un défaut sans point vaut pour tous, un défaut visant des
     * points ne concerne que le serveur qui les porte (une liste vide vaudrait pour tous ses points).
     */
    setFaults(faults) {
      for (const { instance, object } of instances.all('server')) {
        object.setFaults(
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
