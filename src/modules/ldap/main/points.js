import { FORCED_RESULTS } from '../shared/constants'
import { t } from '../shared/i18n'

const SERVER_POINTS = [
  { id: 'server:binds', name: 'binds' },
  { id: 'server:bindFailures', name: 'failed binds' },
  { id: 'server:searches', name: 'searches' },
  { id: 'server:sessions', name: 'connections' }
]

const RADIUS_POINTS = [
  { id: 'radius:requests', name: 'RADIUS requests' },
  { id: 'radius:accepts', name: 'RADIUS accepts' },
  { id: 'radius:rejects', name: 'RADIUS rejects' },
  { id: 'radius:dropped', name: 'RADIUS dropped requests' },
  { id: 'radius:accounting', name: 'RADIUS accounting requests' },
  { id: 'radius:sessions', name: 'RADIUS accounting sessions' }
]

/**
 * Points de données du module LDAP / RADIUS (contrat : `@shared/points`) : compteurs des deux
 * serveurs. Les défauts s'appliquent aux deux serveurs (RADIUS : une réponse forcée est un
 * Access-Reject).
 */
export function createPointsApi({ server, radiusServer }) {
  return {
    name: 'LDAP / RADIUS',

    points() {
      return [...SERVER_POINTS, ...RADIUS_POINTS].map((p) => ({
        ...p,
        group: 'server',
        dataType: 'Int32',
        numeric: true,
        writable: false
      }))
    },

    read(ids) {
      const ldap = server.running
      const radius = radiusServer.running
      const values = {
        'server:binds': ldap ? server.counters.binds : undefined,
        'server:bindFailures': ldap ? server.counters.bindFailures : undefined,
        'server:searches': ldap ? server.counters.searches : undefined,
        'server:sessions': ldap ? server.sessions.size : undefined,
        ...(radius
          ? {
              ...Object.fromEntries(Object.entries(radiusServer.counters).map(([k, v]) => [`radius:${k}`, v])),
              'radius:sessions': radiusServer.sessions.size
            }
          : {})
      }
      return Object.fromEntries(ids.map((id) => [id, values[id]]))
    },

    async write(id) {
      throw new Error(t('ldap.errors.readOnlyPoint', { id }))
    },

    faultTypes() {
      return [{ type: 'delay' }, { type: 'noResponse' }, { type: 'exception', codes: FORCED_RESULTS }]
    },

    setFaults(faults) {
      server.setFaults(faults)
      radiusServer.setFaults(faults)
    }
  }
}
