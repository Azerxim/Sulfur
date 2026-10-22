import { FORCED_ERRORS } from '../shared/constants'
import { t } from '../shared/i18n'

const SERVER_POINTS = [
  { id: 'server:transfers', name: 'active transfers', dataType: 'Int32', numeric: true },
  { id: 'server:reads', name: 'files sent', dataType: 'Int32', numeric: true },
  { id: 'server:writes', name: 'files received', dataType: 'Int32', numeric: true },
  { id: 'server:errors', name: 'failed transfers', dataType: 'Int32', numeric: true },
  { id: 'server:bytesOut', name: 'bytes sent', dataType: 'Int32', numeric: true },
  { id: 'server:bytesIn', name: 'bytes received', dataType: 'Int32', numeric: true }
]

/** Points de données du module TFTP (contrat : `points.js` du SDK) : compteurs du serveur. */
export function createPointsApi({ server }) {
  return {
    name: 'TFTP',

    points() {
      return SERVER_POINTS.map((p) => ({ ...p, group: 'server', writable: false }))
    },

    read(ids) {
      const running = server.running
      const values = {
        'server:transfers': server.transfers.size,
        ...Object.fromEntries(Object.entries(server.counters).map(([k, v]) => [`server:${k}`, v]))
      }
      return Object.fromEntries(ids.map((id) => [id, running ? values[id] : undefined]))
    },

    async write(id) {
      throw new Error(t('tftp.errors.readOnlyPoint', { id }))
    },

    faultTypes() {
      return [
        { type: 'delay' },
        { type: 'noResponse' },
        {
          type: 'exception',
          codes: FORCED_ERRORS.map((code) => ({ value: code, label: t(`tftp.errorCodes.${code}`) }))
        }
      ]
    },

    setFaults(faults) {
      server.setFaults(faults)
    }
  }
}
