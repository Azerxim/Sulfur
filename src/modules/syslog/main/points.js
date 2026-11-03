import { instanceSection, instancesPointsApi } from '@azerxim/sulfur-sdk'
import { DEFAULT_CLIENT_CONFIG } from '../shared/constants'
import { t } from '../shared/i18n'

const SERVER_POINTS = [
  { id: 'messages', name: 'messages', dataType: 'Int32', numeric: true },
  { id: 'errors', name: 'errors (severity ≤ 3)', dataType: 'Int32', numeric: true },
  { id: 'lastSeverity', name: 'last severity', dataType: 'Int32', numeric: true },
  { id: 'lastMessage', name: 'last message', dataType: 'String', numeric: false },
  { id: 'connections', name: 'connections', dataType: 'Int32', numeric: true }
]

const CLIENT_POINTS = [
  { id: 'sent', name: 'sent', dataType: 'Int32', numeric: true, writable: false },
  { id: 'message', name: 'send message', dataType: 'String', numeric: false, writable: true }
]

/** Points d'un serveur Syslog : compteurs et dernier message reçu. */
export function serverPoints(server) {
  return {
    points: () => SERVER_POINTS.map((p) => ({ ...p, writable: false })),
    read(ids) {
      if (!server.running) return {}
      const last = server.messages.at(-1)
      const values = {
        messages: server.total,
        errors: server.counts.slice(0, 4).reduce((a, b) => a + b, 0),
        lastSeverity: last?.severity,
        lastMessage: last?.message,
        connections: server.connections.size
      }
      return Object.fromEntries(ids.map((id) => [id, values[id]]))
    },
    async write(id) {
      throw new Error(t('syslog.errors.readOnlyPoint', { id }))
    },
    setFaults: (faults) => server.setFaults(faults)
  }
}

/** Points d'un émetteur : écrire `message` envoie un message de ce texte avec ses réglages. */
export function clientPoints(client, instance, savedConfig = () => ({})) {
  return {
    points: () => CLIENT_POINTS,
    read(ids) {
      const values = { sent: client.sent, message: client.history.findLast((h) => !h.error)?.text }
      return Object.fromEntries(ids.map((id) => [id, values[id]]))
    },
    async write(id, value) {
      if (id !== 'message') throw new Error(t('syslog.errors.readOnlyPoint', { id }))
      const saved = savedConfig()[instanceSection('client', instance.id)]
      const config = client.lastConfig ?? { ...DEFAULT_CLIENT_CONFIG, ...saved }
      return client.send({ ...config, count: 1 }, String(value ?? ''))
    }
  }
}

/**
 * Points de données du module Syslog (contrat : `points.js` du SDK) : ceux de chaque serveur et de
 * chaque émetteur, `<id instance>:<id>`. Écrire le message d'un émetteur l'envoie : un flux du
 * simulateur peut ainsi produire des messages Syslog.
 */
export function createPointsApi({ instances, savedConfig = () => ({}) }) {
  return instancesPointsApi({
    name: 'Syslog',
    instances,
    roles: { server: serverPoints, client: (client, instance) => clientPoints(client, instance, savedConfig) },
    faultTypes: [{ type: 'cut' }]
  })
}
