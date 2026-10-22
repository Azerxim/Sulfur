import { DEFAULT_SERVER_CONFIG, RETURN_CODES } from '../shared/constants'
import { isNumericType } from '../shared/codec'
import { t } from '../shared/i18n'

const SERVER = 'server:'
const CLIENT = 'client:'

/** Codes de retour proposés pour le défaut « exception forcée ». */
export const FAULT_CODES = [
  { value: RETURN_CODES.HARDWARE_FAULT, label: '01 Hardware fault' },
  { value: RETURN_CODES.ACCESS_DENIED, label: '03 Access denied' },
  { value: RETURN_CODES.OUT_OF_RANGE, label: '05 Address out of range' },
  { value: RETURN_CODES.TYPE_NOT_SUPPORTED, label: '06 Data type not supported' },
  { value: RETURN_CODES.NOT_AVAILABLE, label: '0A Object does not exist' }
]

/**
 * Points de données du module S7 pour les autres modules (contrat : `points.js` du SDK) :
 * points de l'automate simulé (`server:<id>`) et surveillances du client (`client:<id>`).
 */
export function createPointsApi({ server, client, savedConfig = () => ({}) }) {
  const serverPoints = () =>
    server.status().config?.points ?? savedConfig().server?.points ?? DEFAULT_SERVER_CONFIG.points

  return {
    name: 'Siemens S7',

    points() {
      return [
        ...serverPoints().map((p) => ({
          id: SERVER + p.id,
          group: 'server',
          name: `${p.name} (${p.address})`,
          dataType: p.dataType,
          numeric: isNumericType(p.dataType),
          writable: true
        })),
        ...client.status().watches.map((w) => ({
          id: CLIENT + w.id,
          group: 'client',
          name: w.label ? `${w.label} (${w.address})` : w.address,
          dataType: w.dataType,
          numeric: isNumericType(w.dataType),
          writable: true
        }))
      ]
    },

    read(ids) {
      const values = server.server ? server.values() : {}
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
      if (!watch) throw new Error(t('s7.errors.unknownWatch'))
      return client.writeValue(watch.address, watch.dataType, value, watch.length)
    },

    faultTypes() {
      return [
        { type: 'delay' },
        { type: 'noResponse' },
        { type: 'cut' },
        { type: 'exception', codes: FAULT_CODES, scope: true },
        { type: 'freeze', points: true }
      ]
    },

    /** Les défauts portent sur l'automate simulé (points `server:<id>`). */
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
