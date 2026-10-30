import { CODE_LABELS, codeName } from '../shared/codec'
import { DEFAULT_SERVER_CONFIG, FORCED_CODES, NUMERIC_TYPES } from '../shared/constants'
import { t } from '../shared/i18n'

const SERVER = 'server:'

const DEVICE_POINTS = [
  {
    id: 'device:temperature',
    path: '/3303/0/5700',
    name: 'LwM2M device temperature',
    dataType: 'Number',
    writable: false
  },
  { id: 'device:light', path: '/3311/0/5850', name: 'LwM2M device light on', dataType: 'Boolean', writable: true },
  { id: 'device:dimmer', path: '/3311/0/5851', name: 'LwM2M device dimmer', dataType: 'Int32', writable: true }
]

/**
 * Points de données du module CoAP / LwM2M (contrat : `points.js` du SDK) :
 *  - ressources simulées du serveur CoAP (`server:<id>`), modifiables : écrire change la valeur
 *    et notifie les observateurs ;
 *  - requêtes reçues par le serveur CoAP, appareils enregistrés auprès du serveur LwM2M ;
 *  - quelques ressources de l'appareil LwM2M simulé (température, éclairage).
 * Défauts injectables sur le serveur CoAP : délai, absence de réponse, code de réponse forcé.
 */
export function createPointsApi({ server, lwm2mServer, device, savedConfig = () => ({}) }) {
  const resources = () => server.config?.resources ?? savedConfig().server?.resources ?? DEFAULT_SERVER_CONFIG.resources

  return {
    name: 'CoAP',

    points() {
      return [
        ...resources().map((r) => ({
          id: SERVER + r.id,
          group: 'server',
          name: `/${String(r.path).replace(/^\/+/, '')}`,
          dataType: r.dataType,
          numeric: NUMERIC_TYPES.includes(r.dataType),
          writable: true
        })),
        {
          id: 'server:$requests',
          group: 'server',
          name: 'requests',
          dataType: 'Int32',
          numeric: true,
          writable: false
        },
        {
          id: 'lwm2m:$devices',
          group: 'server',
          name: 'LwM2M devices',
          dataType: 'Int32',
          numeric: true,
          writable: false
        },
        ...DEVICE_POINTS.map(({ id, name, dataType, writable }) => ({
          id,
          group: 'client',
          name,
          dataType,
          numeric: true,
          writable
        }))
      ]
    },

    read(ids) {
      const values = server.running ? server.currentValues() : {}
      return Object.fromEntries(
        ids.map((id) => {
          if (id === 'server:$requests') return [id, server.running ? server.requests : undefined]
          if (id === 'lwm2m:$devices') return [id, lwm2mServer.running ? lwm2mServer.registrations.size : undefined]
          const point = DEVICE_POINTS.find((p) => p.id === id)
          if (point) return [id, device.running ? device.values.get(point.path) : undefined]
          return [id, values[id.slice(SERVER.length)]]
        })
      )
    },

    async write(id, value) {
      if (id.startsWith(SERVER) && !id.startsWith('server:$')) return server.setValue(id.slice(SERVER.length), value)
      const point = DEVICE_POINTS.find((p) => p.id === id && p.writable)
      if (point && device.running) return device.setValue(point.path, value)
      throw new Error(t('coap.errors.readOnlyPoint', { id }))
    },

    faultTypes() {
      return [
        { type: 'delay' },
        { type: 'noResponse' },
        {
          type: 'exception',
          codes: FORCED_CODES.map((value) => ({ value, label: `${codeName(value)} ${CODE_LABELS[value]}` }))
        }
      ]
    },

    setFaults(faults) {
      server.setFaults(faults)
    }
  }
}
