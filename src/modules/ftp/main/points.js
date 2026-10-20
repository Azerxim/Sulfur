import { FORCED_REPLIES } from '../shared/constants'
import { t } from '../shared/i18n'

const SERVER_POINTS = [
  { id: 'server:sessions', name: 'sessions', dataType: 'Int32', numeric: true },
  { id: 'server:uploads', name: 'uploads', dataType: 'Int32', numeric: true },
  { id: 'server:downloads', name: 'downloads', dataType: 'Int32', numeric: true },
  { id: 'server:bytesIn', name: 'bytes received', dataType: 'Int32', numeric: true },
  { id: 'server:bytesOut', name: 'bytes sent', dataType: 'Int32', numeric: true },
  { id: 'server:failures', name: 'failed logins', dataType: 'Int32', numeric: true }
]

/** Points de données du module FTP (contrat : `@shared/points`) : compteurs du serveur. */
export function createPointsApi({ server }) {
  return {
    name: 'FTP',

    points() {
      return SERVER_POINTS.map((p) => ({ ...p, group: 'server', writable: false }))
    },

    read(ids) {
      const running = server.running
      const values = {
        'server:sessions': server.sessions.size,
        ...Object.fromEntries(Object.entries(server.counters).map(([k, v]) => [`server:${k}`, v]))
      }
      return Object.fromEntries(ids.map((id) => [id, running ? values[id] : undefined]))
    },

    async write(id) {
      throw new Error(t('ftp.errors.readOnlyPoint', { id }))
    },

    faultTypes() {
      return [
        { type: 'delay' },
        { type: 'noResponse' },
        { type: 'cut' },
        {
          type: 'exception',
          codes: FORCED_REPLIES.map((code) => ({ value: code, label: t(`ftp.replyCodes.${code}`) }))
        }
      ]
    },

    setFaults(faults) {
      server.setFaults(faults)
    }
  }
}
