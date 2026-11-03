import { instancesPointsApi } from '@azerxim/sulfur-sdk'
import { FORCED_RCODES } from '../shared/constants'
import { t } from '../shared/i18n'

const SERVER_POINTS = [
  { id: 'total', name: 'queries', dataType: 'Int32', numeric: true },
  { id: 'answered', name: 'answered (NOERROR)', dataType: 'Int32', numeric: true },
  { id: 'nxdomain', name: 'NXDOMAIN', dataType: 'Int32', numeric: true },
  { id: 'forwarded', name: 'forwarded', dataType: 'Int32', numeric: true },
  { id: 'lastName', name: 'last queried name', dataType: 'String', numeric: false }
]

/** Points d'un serveur DNS : ses compteurs. */
export function serverPoints(server) {
  return {
    points: () => SERVER_POINTS.map((p) => ({ ...p, writable: false })),
    read(ids) {
      if (!server.running) return {}
      const values = {
        total: server.counters.total,
        answered: server.counters.answered,
        nxdomain: server.counters.nxdomain,
        forwarded: server.counters.forwarded,
        lastName: server.queries.at(-1)?.name
      }
      return Object.fromEntries(ids.map((id) => [id, values[id]]))
    },
    async write(id) {
      throw new Error(t('dns.errors.readOnlyPoint', { id }))
    },
    setFaults: (faults) => server.setFaults(faults)
  }
}

/** Points de données du module DNS (contrat : `points.js` du SDK) : compteurs de chaque serveur. */
export function createPointsApi({ instances }) {
  return instancesPointsApi({
    name: 'DNS',
    instances,
    roles: { server: serverPoints },
    faultTypes: [
      { type: 'delay' },
      { type: 'noResponse' },
      { type: 'exception', codes: FORCED_RCODES.map((code) => ({ value: code, label: code })) }
    ]
  })
}
