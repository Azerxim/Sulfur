import { DEFAULT_CLIENT_CONFIG, DEFAULT_SERVER_CONFIG, NUMERIC_TYPES } from '../shared/constants'
import { isValidTopic } from '../shared/topics'
import { t } from '../shared/i18n'

const SERVER = 'server:'
const CLIENT = 'client:'

/**
 * Points de données du module MQTT (contrat : `@shared/points`) :
 *  - topics simulés du broker (`server:<id>`), modifiables : écrire publie la nouvelle valeur ;
 *  - nombres de clients connectés et de messages du broker ;
 *  - abonnements du client (`client:<id>`) : dernière valeur reçue ; un abonnement sans joker est
 *    modifiable : écrire publie la valeur sur ce topic.
 */
export function createPointsApi({ server, client, savedConfig = () => ({}) }) {
  const topics = () => server.config?.topics ?? savedConfig().server?.topics ?? DEFAULT_SERVER_CONFIG.topics
  const subscriptions = () =>
    client.client
      ? [...client.subscriptions.values()]
      : (savedConfig().client?.subscriptions ?? DEFAULT_CLIENT_CONFIG.subscriptions)

  return {
    name: 'MQTT',

    points() {
      return [
        ...topics().map((d) => ({
          id: SERVER + d.id,
          group: 'server',
          name: d.topic,
          dataType: d.dataType,
          numeric: NUMERIC_TYPES.includes(d.dataType),
          writable: true
        })),
        { id: 'server:$clients', group: 'server', name: 'clients', dataType: 'Int32', numeric: true, writable: false },
        {
          id: 'server:$messages',
          group: 'server',
          name: 'messages',
          dataType: 'Int32',
          numeric: true,
          writable: false
        },
        ...subscriptions().map((s) => ({
          id: CLIENT + s.id,
          group: 'client',
          name: s.field ? `${s.topic} · ${s.field}` : s.topic,
          dataType: 'JSON',
          numeric: true,
          writable: isValidTopic(s.topic)
        }))
      ]
    },

    read(ids) {
      const values = server.values()
      return Object.fromEntries(
        ids.map((id) => {
          if (id === 'server:$clients') return [id, server.running ? server.clients.size : undefined]
          if (id === 'server:$messages') return [id, server.running ? server.messages : undefined]
          if (id.startsWith(SERVER)) return [id, values[id.slice(SERVER.length)]]
          return [id, client.last.get(id.slice(CLIENT.length))?.value]
        })
      )
    },

    async write(id, value) {
      if (id.startsWith(SERVER) && !id.startsWith('server:$')) return server.setValue(id.slice(SERVER.length), value)
      const sub = client.subscriptions.get(id.slice(CLIENT.length))
      if (!id.startsWith(CLIENT) || !sub || !isValidTopic(sub.topic)) {
        throw new Error(t('mqtt.errors.readOnlyPoint', { id }))
      }
      return client.publish({ topic: sub.topic, payload: typeof value === 'string' ? value : JSON.stringify(value) })
    },

    faultTypes() {
      return [{ type: 'delay' }, { type: 'noResponse' }, { type: 'cut' }, { type: 'freeze', points: true }]
    },

    /** Les valeurs figées portent sur les topics simulés (ids `server:<id>`). */
    setFaults(faults) {
      server.setFaults(
        faults.map((f) => ({
          ...f,
          points: (f.points ?? []).filter((p) => p.startsWith(SERVER)).map((p) => p.slice(SERVER.length))
        }))
      )
    }
  }
}
