import { t } from '../shared/i18n'

const SERVER_POINTS = [
  { id: 'server:sessions', name: 'sessions', dataType: 'Int32', numeric: true },
  { id: 'server:uploads', name: 'uploads', dataType: 'Int32', numeric: true },
  { id: 'server:downloads', name: 'downloads', dataType: 'Int32', numeric: true },
  { id: 'server:bytesIn', name: 'bytes received', dataType: 'Int32', numeric: true },
  { id: 'server:bytesOut', name: 'bytes sent', dataType: 'Int32', numeric: true },
  { id: 'server:failures', name: 'failed logins', dataType: 'Int32', numeric: true }
]

/** Points de données du module SFTP (contrat : `@shared/points`) : compteurs du serveur. */
export function createPointsApi({ server }) {
  return {
    name: 'SFTP',

    points() {
      return SERVER_POINTS.map((p) => ({ ...p, group: 'server', writable: false }))
    },

    read(ids) {
      const running = server.running
      const values = { 'server:sessions': server.sessions.size, ...prefixed(server.counters) }
      return Object.fromEntries(ids.map((id) => [id, running ? values[id] : undefined]))
    },

    async write(id) {
      throw new Error(t('sftp.errors.readOnlyPoint', { id }))
    },

    faultTypes() {
      return [{ type: 'delay' }, { type: 'cut' }]
    },

    setFaults(faults) {
      server.setFaults(faults)
    }
  }
}

const prefixed = (counters) => Object.fromEntries(Object.entries(counters).map(([k, v]) => [`server:${k}`, v]))
