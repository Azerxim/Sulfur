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

const SERVER = 'server:'
const CLIENT = 'client:'

/**
 * Points de données du module Modbus pour les autres modules (contrat : `points.js` du SDK) :
 * points du serveur (`server:<id>`) et surveillances du client (`client:<id>`).
 */
export function createPointsApi({ server, client, savedConfig = () => ({}) }) {
  // Points de tous les équipements du serveur (configuration en marche, sinon enregistrée).
  const points = () =>
    allPoints(server.status().config ?? normalizeServerConfig(savedConfig().server) ?? DEFAULT_SERVER_CONFIG)

  return {
    name: 'Modbus',

    points() {
      const list = points()
      // Plusieurs équipements : le nom du point est précédé de celui de son équipement.
      const several = new Set(list.map(({ unit }) => unit.id)).size > 1
      return [
        ...list.map(({ unit, point: p }) => ({
          id: SERVER + p.id,
          group: 'server',
          name: several ? `${unitLabel(unit)} · ${p.name}` : p.name,
          dataType: p.dataType,
          numeric: true,
          writable: true
        })),
        ...client.status().watches.map((w) => ({
          id: CLIENT + w.id,
          group: 'client',
          name: w.label || `${TABLES[w.table]?.prefix ?? ''}${w.address}`,
          dataType: w.dataType,
          numeric: true,
          writable: !!TABLES[w.table]?.writable
        }))
      ]
    },

    read(ids) {
      const values = server.values()
      return Object.fromEntries(
        ids.map((id) => [
          id,
          id.startsWith(SERVER)
            ? values[id.slice(SERVER.length)]
            : (client.last.get(id.slice(CLIENT.length))?.value ?? undefined)
        ])
      )
    },

    async write(id, value) {
      if (id.startsWith(SERVER)) return server.setValue(id.slice(SERVER.length), value)
      const watch = client.watches.get(id.slice(CLIENT.length))
      if (!watch) throw new Error(t('modbus.errors.unknownWatch'))
      return client.writeValue(watch.table, watch.address, value, watch.dataType, watch.wordOrder)
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

    /** Les défauts portent sur les points du serveur (ids `server:<id>`). */
    setFaults(faults) {
      server.setFaults(
        faults.map((f) => ({
          ...f,
          points: (f.points ?? []).filter((p) => p.startsWith(SERVER)).map((p) => p.slice(SERVER.length))
        }))
      )
    }
  }
}
