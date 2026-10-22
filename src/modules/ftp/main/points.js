import { FORCED_REPLIES } from '../shared/constants'
import { t } from '../shared/i18n'

const COUNTERS = [
  { key: 'uploads', name: 'uploads' },
  { key: 'downloads', name: 'downloads' },
  { key: 'bytesIn', name: 'bytes received' },
  { key: 'bytesOut', name: 'bytes sent' },
  { key: 'failures', name: 'failed logins' }
]

/** Points d'un serveur : sessions ouvertes et compteurs, préfixés par le protocole (ftp:…, sftp:…). */
const serverPoints = (protocol, label) => [
  { id: `${protocol}:sessions`, name: `${label} sessions` },
  ...COUNTERS.map(({ key, name }) => ({ id: `${protocol}:${key}`, name: `${label} ${name}` }))
]

/**
 * Points de données du module FTP / SFTP (contrat : `points.js` du SDK) : compteurs des deux serveurs.
 * Les défauts s'appliquent aux deux serveurs (SFTP : délai et coupure uniquement).
 */
export function createPointsApi({ ftpServer, sftpServer }) {
  const servers = { ftp: ftpServer, sftp: sftpServer }
  return {
    name: 'FTP / SFTP',

    points() {
      return [...serverPoints('ftp', 'FTP'), ...serverPoints('sftp', 'SFTP')].map((p) => ({
        ...p,
        group: 'server',
        dataType: 'Int32',
        numeric: true,
        writable: false
      }))
    },

    read(ids) {
      return Object.fromEntries(
        ids.map((id) => {
          const [protocol, key] = id.split(':')
          const server = servers[protocol]
          if (!server?.running) return [id, undefined]
          return [id, key === 'sessions' ? server.sessions.size : server.counters[key]]
        })
      )
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
      ftpServer.setFaults(faults)
      sftpServer.setFaults(faults)
    }
  }
}
