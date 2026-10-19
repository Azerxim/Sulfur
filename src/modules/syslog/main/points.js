import { DEFAULT_CLIENT_CONFIG } from '../shared/constants'
import { t } from '../shared/i18n'

const SERVER_POINTS = [
  { id: 'server:messages', name: 'messages', dataType: 'Int32', numeric: true },
  { id: 'server:errors', name: 'errors (severity ≤ 3)', dataType: 'Int32', numeric: true },
  { id: 'server:lastSeverity', name: 'last severity', dataType: 'Int32', numeric: true },
  { id: 'server:lastMessage', name: 'last message', dataType: 'String', numeric: false },
  { id: 'server:connections', name: 'connections', dataType: 'Int32', numeric: true }
]

const CLIENT_POINTS = [
  { id: 'client:sent', name: 'sent', dataType: 'Int32', numeric: true, writable: false },
  { id: 'client:message', name: 'send message', dataType: 'String', numeric: false, writable: true }
]

/**
 * Points de données du module Syslog (contrat : `@shared/points`). Écrire `client:message` envoie un
 * message de ce texte avec les réglages de l'émetteur : un flux du simulateur peut ainsi produire
 * des messages Syslog.
 */
export function createPointsApi({ server, client, savedConfig = () => ({}) }) {
  return {
    name: 'Syslog',

    points() {
      return [
        ...SERVER_POINTS.map((p) => ({ ...p, group: 'server', writable: false })),
        ...CLIENT_POINTS.map((p) => ({ ...p, group: 'client' }))
      ]
    },

    read(ids) {
      const running = server.running
      const last = server.messages.at(-1)
      const values = {
        'server:messages': running ? server.total : undefined,
        'server:errors': running ? server.counts.slice(0, 4).reduce((a, b) => a + b, 0) : undefined,
        'server:lastSeverity': running ? last?.severity : undefined,
        'server:lastMessage': running ? last?.message : undefined,
        'server:connections': running ? server.connections.size : undefined,
        'client:sent': client.sent,
        'client:message': client.history.findLast((h) => !h.error)?.text
      }
      return Object.fromEntries(ids.map((id) => [id, values[id]]))
    },

    async write(id, value) {
      if (id !== 'client:message') throw new Error(t('syslog.errors.readOnlyPoint', { id }))
      const config = client.lastConfig ?? { ...DEFAULT_CLIENT_CONFIG, ...savedConfig().client }
      return client.send({ ...config, count: 1 }, String(value ?? ''))
    },

    faultTypes() {
      return [{ type: 'cut' }]
    },

    setFaults(faults) {
      server.setFaults(faults)
    }
  }
}
