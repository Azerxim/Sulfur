import { instancesPointsApi } from '@azerxim/sulfur-sdk'
import { FORCED_REPLIES } from '../shared/constants'
import { t } from '../shared/i18n'

const COUNTERS = [
  { key: 'uploads', name: 'uploads' },
  { key: 'downloads', name: 'downloads' },
  { key: 'bytesIn', name: 'bytes received' },
  { key: 'bytesOut', name: 'bytes sent' },
  { key: 'failures', name: 'failed logins' }
]

/** Points d'un serveur FTP ou SFTP : sessions ouvertes et compteurs. */
export function serverPoints(server, label) {
  return {
    points: () =>
      [
        { id: 'sessions', name: `${label} sessions` },
        ...COUNTERS.map(({ key, name }) => ({ id: key, name: `${label} ${name}` }))
      ].map((p) => ({ ...p, dataType: 'Int32', numeric: true, writable: false })),
    read: (ids) =>
      Object.fromEntries(
        ids.map((id) => [
          id,
          !server.running ? undefined : id === 'sessions' ? server.sessions.size : server.counters[id]
        ])
      ),
    async write(id) {
      throw new Error(t('ftp.errors.readOnlyPoint', { id }))
    },
    setFaults: (faults) => server.setFaults(faults)
  }
}

/**
 * Points de données du module FTP / SFTP (contrat : `points.js` du SDK) : compteurs de chaque
 * serveur, `<id instance>:<id>`. Les défauts s'appliquent aux serveurs (SFTP : délai et coupure
 * uniquement).
 */
export function createPointsApi({ instances }) {
  return instancesPointsApi({
    name: 'FTP / SFTP',
    instances,
    roles: {
      server: (server) => serverPoints(server, 'FTP'),
      sftpServer: (server) => serverPoints(server, 'SFTP')
    },
    faultTypes: () => [
      { type: 'delay' },
      { type: 'noResponse' },
      { type: 'cut' },
      {
        type: 'exception',
        codes: FORCED_REPLIES.map((code) => ({ value: code, label: t(`ftp.replyCodes.${code}`) }))
      }
    ]
  })
}
