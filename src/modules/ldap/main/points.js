import { instancesPointsApi } from '@azerxim/sulfur-sdk'
import { FORCED_RESULTS } from '../shared/constants'
import { t } from '../shared/i18n'

const SERVER_POINTS = [
  { id: 'binds', name: 'binds' },
  { id: 'bindFailures', name: 'failed binds' },
  { id: 'searches', name: 'searches' },
  { id: 'sessions', name: 'connections' }
]

const RADIUS_POINTS = [
  { id: 'requests', name: 'RADIUS requests' },
  { id: 'accepts', name: 'RADIUS accepts' },
  { id: 'rejects', name: 'RADIUS rejects' },
  { id: 'dropped', name: 'RADIUS dropped requests' },
  { id: 'accounting', name: 'RADIUS accounting requests' },
  { id: 'sessions', name: 'RADIUS accounting sessions' }
]

const counter = (p) => ({ ...p, dataType: 'Int32', numeric: true, writable: false })

/** Points d'un serveur LDAP : ses compteurs. */
export function serverPoints(server) {
  return {
    points: () => SERVER_POINTS.map(counter),
    read(ids) {
      if (!server.running) return {}
      const values = { ...server.counters, sessions: server.sessions.size }
      return Object.fromEntries(ids.map((id) => [id, values[id]]))
    },
    async write(id) {
      throw new Error(t('ldap.errors.readOnlyPoint', { id }))
    },
    setFaults: (faults) => server.setFaults(faults)
  }
}

/** Points d'un serveur RADIUS : ses compteurs. */
export function radiusServerPoints(server) {
  return {
    points: () => RADIUS_POINTS.map(counter),
    read(ids) {
      if (!server.running) return {}
      const values = { ...server.counters, sessions: server.sessions.size }
      return Object.fromEntries(ids.map((id) => [id, values[id]]))
    },
    async write(id) {
      throw new Error(t('ldap.errors.readOnlyPoint', { id }))
    },
    setFaults: (faults) => server.setFaults(faults)
  }
}

/**
 * Points de données du module LDAP / RADIUS (contrat : `points.js` du SDK) : compteurs de chaque
 * serveur, `<id instance>:<id>`. Les défauts s'appliquent aux serveurs (RADIUS : une réponse forcée
 * est un Access-Reject).
 */
export function createPointsApi({ instances }) {
  return instancesPointsApi({
    name: 'LDAP / RADIUS',
    instances,
    roles: { server: serverPoints, radiusServer: radiusServerPoints },
    faultTypes: [{ type: 'delay' }, { type: 'noResponse' }, { type: 'exception', codes: FORCED_RESULTS }]
  })
}
