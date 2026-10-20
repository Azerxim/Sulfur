import { FORCED_RESULTS } from '../shared/constants'
import { t } from '../shared/i18n'

const SERVER_POINTS = [
  { id: 'server:binds', name: 'binds', dataType: 'Int32', numeric: true },
  { id: 'server:bindFailures', name: 'failed binds', dataType: 'Int32', numeric: true },
  { id: 'server:searches', name: 'searches', dataType: 'Int32', numeric: true },
  { id: 'server:sessions', name: 'connections', dataType: 'Int32', numeric: true }
]

/** Points de données du module LDAP (contrat : `@shared/points`) : compteurs du serveur. */
export function createPointsApi({ server }) {
  return {
    name: 'LDAP',

    points() {
      return SERVER_POINTS.map((p) => ({ ...p, group: 'server', writable: false }))
    },

    read(ids) {
      const running = server.running
      const values = {
        'server:binds': server.counters.binds,
        'server:bindFailures': server.counters.bindFailures,
        'server:searches': server.counters.searches,
        'server:sessions': server.sessions.size
      }
      return Object.fromEntries(ids.map((id) => [id, running ? values[id] : undefined]))
    },

    async write(id) {
      throw new Error(t('ldap.errors.readOnlyPoint', { id }))
    },

    faultTypes() {
      return [{ type: 'delay' }, { type: 'noResponse' }, { type: 'exception', codes: FORCED_RESULTS }]
    },

    setFaults(faults) {
      server.setFaults(faults)
    }
  }
}
