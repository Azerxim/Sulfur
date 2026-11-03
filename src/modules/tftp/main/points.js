import { instancesPointsApi } from '@azerxim/sulfur-sdk'
import { FORCED_ERRORS } from '../shared/constants'
import { t } from '../shared/i18n'

const SERVER_POINTS = [
  { id: 'transfers', name: 'active transfers', dataType: 'Int32', numeric: true },
  { id: 'reads', name: 'files sent', dataType: 'Int32', numeric: true },
  { id: 'writes', name: 'files received', dataType: 'Int32', numeric: true },
  { id: 'errors', name: 'failed transfers', dataType: 'Int32', numeric: true },
  { id: 'bytesOut', name: 'bytes sent', dataType: 'Int32', numeric: true },
  { id: 'bytesIn', name: 'bytes received', dataType: 'Int32', numeric: true }
]

/** Points d'un serveur TFTP : ses compteurs. */
export function serverPoints(server) {
  return {
    points: () => SERVER_POINTS.map((p) => ({ ...p, writable: false })),
    read(ids) {
      if (!server.running) return {}
      const values = { transfers: server.transfers.size, ...server.counters }
      return Object.fromEntries(ids.map((id) => [id, values[id]]))
    },
    async write(id) {
      throw new Error(t('tftp.errors.readOnlyPoint', { id }))
    },
    setFaults: (faults) => server.setFaults(faults)
  }
}

/** Points de données du module TFTP (contrat : `points.js` du SDK) : compteurs de chaque serveur. */
export function createPointsApi({ instances }) {
  return instancesPointsApi({
    name: 'TFTP',
    instances,
    roles: { server: serverPoints },
    faultTypes: () => [
      { type: 'delay' },
      { type: 'noResponse' },
      {
        type: 'exception',
        codes: FORCED_ERRORS.map((code) => ({ value: code, label: t(`tftp.errorCodes.${code}`) }))
      }
    ]
  })
}
