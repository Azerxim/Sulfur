import { FORCED_RCODES } from '../shared/constants'
import { t } from '../shared/i18n'

const SERVER_POINTS = [
  { id: 'server:total', name: 'queries', dataType: 'Int32', numeric: true },
  { id: 'server:answered', name: 'answered (NOERROR)', dataType: 'Int32', numeric: true },
  { id: 'server:nxdomain', name: 'NXDOMAIN', dataType: 'Int32', numeric: true },
  { id: 'server:forwarded', name: 'forwarded', dataType: 'Int32', numeric: true },
  { id: 'server:lastName', name: 'last queried name', dataType: 'String', numeric: false }
]

/** Points de données du module DNS (contrat : `@shared/points`) : compteurs du serveur. */
export function createPointsApi({ server }) {
  return {
    name: 'DNS',

    points() {
      return SERVER_POINTS.map((p) => ({ ...p, group: 'server', writable: false }))
    },

    read(ids) {
      const running = server.running
      const values = {
        'server:total': server.counters.total,
        'server:answered': server.counters.answered,
        'server:nxdomain': server.counters.nxdomain,
        'server:forwarded': server.counters.forwarded,
        'server:lastName': server.queries.at(-1)?.name
      }
      return Object.fromEntries(ids.map((id) => [id, running ? values[id] : undefined]))
    },

    async write(id) {
      throw new Error(t('dns.errors.readOnlyPoint', { id }))
    },

    faultTypes() {
      return [
        { type: 'delay' },
        { type: 'noResponse' },
        { type: 'exception', codes: FORCED_RCODES.map((code) => ({ value: code, label: code })) }
      ]
    },

    setFaults(faults) {
      server.setFaults(faults)
    }
  }
}
