import { instanceSection, instancesPointsApi } from '@azerxim/sulfur-sdk'
import { DEFAULT_CLIENT_CONFIG, DEFAULT_SERVER_CONFIG, NUMERIC_TYPES } from '../shared/constants'
import { isValidTopic } from '../shared/topics'
import { t } from '../shared/i18n'

/** Points d'un broker : topics simulés (`<id du topic>`), `$clients` et `$messages`. */
export function serverPoints(server, instance, savedConfig = () => ({})) {
  const topics = () =>
    server.config?.topics ??
    savedConfig()[instanceSection('server', instance.id)]?.topics ??
    DEFAULT_SERVER_CONFIG.topics
  return {
    points: () => [
      ...topics().map((d) => ({
        id: d.id,
        name: d.topic,
        dataType: d.dataType,
        numeric: NUMERIC_TYPES.includes(d.dataType),
        writable: true
      })),
      { id: '$clients', name: 'clients', dataType: 'Int32', numeric: true, writable: false },
      { id: '$messages', name: 'messages', dataType: 'Int32', numeric: true, writable: false }
    ],
    read(ids) {
      const values = server.values()
      return Object.fromEntries(
        ids.map((id) => {
          if (id === '$clients') return [id, server.running ? server.clients.size : undefined]
          if (id === '$messages') return [id, server.running ? server.messages : undefined]
          return [id, values[id]]
        })
      )
    },
    async write(id, value) {
      if (id.startsWith('$')) throw new Error(t('mqtt.errors.readOnlyPoint', { id }))
      return server.setValue(id, value)
    },
    setFaults: (faults) => server.setFaults(faults)
  }
}

/** Points d'un client : ses abonnements (écrire publie sur le topic de l'abonnement). */
export function clientPoints(client, instance, savedConfig = () => ({})) {
  const subscriptions = () =>
    client.client
      ? [...client.subscriptions.values()]
      : (savedConfig()[instanceSection('client', instance.id)]?.subscriptions ?? DEFAULT_CLIENT_CONFIG.subscriptions)
  return {
    points: () =>
      subscriptions().map((s) => ({
        id: s.id,
        name: s.field ? `${s.topic} · ${s.field}` : s.topic,
        dataType: 'JSON',
        numeric: true,
        writable: isValidTopic(s.topic)
      })),
    read: (ids) => Object.fromEntries(ids.map((id) => [id, client.last.get(id)?.value])),
    async write(id, value) {
      const sub = client.subscriptions.get(id)
      if (!sub || !isValidTopic(sub.topic)) throw new Error(t('mqtt.errors.readOnlyPoint', { id }))
      return client.publish({ topic: sub.topic, payload: typeof value === 'string' ? value : JSON.stringify(value) })
    }
  }
}

/**
 * Points de données du module MQTT (contrat : `points.js` du SDK) : topics simulés de chaque broker
 * et abonnements de chaque client, `<id instance>:<id>`. Les valeurs figées portent sur les topics.
 */
export function createPointsApi({ instances, savedConfig = () => ({}) }) {
  return instancesPointsApi({
    name: 'MQTT',
    instances,
    roles: {
      server: (server, instance) => serverPoints(server, instance, savedConfig),
      client: (client, instance) => clientPoints(client, instance, savedConfig)
    },
    faultTypes: [{ type: 'delay' }, { type: 'noResponse' }, { type: 'cut' }, { type: 'freeze', points: true }]
  })
}
