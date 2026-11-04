import { instanceSection, instancesPointsApi } from '@azerxim/sulfur-sdk'
import { DEFAULT_SERVER_CONFIG, RETURN_CODES } from '../shared/constants'
import { isNumericType } from '../shared/codec'
import { t } from '../shared/i18n'

/** Codes de retour proposés pour le défaut « exception forcée ». */
export const FAULT_CODES = [
  { value: RETURN_CODES.HARDWARE_FAULT, label: '01 Hardware fault' },
  { value: RETURN_CODES.ACCESS_DENIED, label: '03 Access denied' },
  { value: RETURN_CODES.OUT_OF_RANGE, label: '05 Address out of range' },
  { value: RETURN_CODES.TYPE_NOT_SUPPORTED, label: '06 Data type not supported' },
  { value: RETURN_CODES.NOT_AVAILABLE, label: '0A Object does not exist' }
]

/** Points d'un automate simulé. */
export function serverPoints(server, instance, savedConfig = () => ({})) {
  const points = () =>
    server.status().config?.points ??
    savedConfig()[instanceSection('server', instance.id)]?.points ??
    DEFAULT_SERVER_CONFIG.points
  return {
    points: () =>
      points().map((p) => ({
        id: p.id,
        name: `${p.name} (${p.address})`,
        dataType: p.dataType,
        numeric: isNumericType(p.dataType),
        writable: true
      })),
    read(ids) {
      const values = server.server ? server.values() : {}
      return Object.fromEntries(ids.map((id) => [id, values[id]]))
    },
    write: (id, value) => server.setValue(id, value),
    setFaults: (faults) => server.setFaults(faults)
  }
}

/** Points d'un client : ses surveillances. */
export function clientPoints(client) {
  return {
    points: () =>
      client.status().watches.map((w) => ({
        id: w.id,
        name: w.label ? `${w.label} (${w.address})` : w.address,
        dataType: w.dataType,
        numeric: isNumericType(w.dataType),
        writable: true
      })),
    read: (ids) => Object.fromEntries(ids.map((id) => [id, client.last.get(id)?.value ?? undefined])),
    async write(id, value) {
      const watch = client.watches.get(id)
      if (!watch) throw new Error(t('s7.errors.unknownWatch'))
      return client.writeValue(watch.address, watch.dataType, value, watch.length)
    }
  }
}

/**
 * Points de données du module S7 pour les autres modules (contrat : `points.js` du SDK) : points
 * de chaque automate simulé et surveillances de chaque client, `<id instance>:<id>`.
 */
export function createPointsApi({ instances, savedConfig = () => ({}) }) {
  return instancesPointsApi({
    name: 'Siemens S7',
    instances,
    roles: { server: (server, instance) => serverPoints(server, instance, savedConfig), client: clientPoints },
    faultTypes: [
      { type: 'delay' },
      { type: 'noResponse' },
      { type: 'cut' },
      { type: 'exception', codes: FAULT_CODES, scope: true },
      { type: 'freeze', points: true }
    ]
  })
}
