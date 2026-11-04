import { instanceSection, instancesPointsApi } from '@azerxim/sulfur-sdk'
import { CODE_LABELS, codeName } from '../shared/codec'
import { DEFAULT_SERVER_CONFIG, FORCED_CODES, NUMERIC_TYPES } from '../shared/constants'
import { t } from '../shared/i18n'

const DEVICE_POINTS = [
  {
    id: 'temperature',
    path: '/3303/0/5700',
    name: 'LwM2M device temperature',
    dataType: 'Number',
    writable: false
  },
  { id: 'light', path: '/3311/0/5850', name: 'LwM2M device light on', dataType: 'Boolean', writable: true },
  { id: 'dimmer', path: '/3311/0/5851', name: 'LwM2M device dimmer', dataType: 'Int32', writable: true }
]

/** Points d'un serveur CoAP : ressources simulées (écrire notifie les observateurs) et `$requests`. */
export function serverPoints(server, instance, savedConfig = () => ({})) {
  const resources = () =>
    server.config?.resources ??
    savedConfig()[instanceSection('server', instance.id)]?.resources ??
    DEFAULT_SERVER_CONFIG.resources
  return {
    points: () => [
      ...resources().map((r) => ({
        id: r.id,
        name: `/${String(r.path).replace(/^\/+/, '')}`,
        dataType: r.dataType,
        numeric: NUMERIC_TYPES.includes(r.dataType),
        writable: true
      })),
      { id: '$requests', name: 'requests', dataType: 'Int32', numeric: true, writable: false }
    ],
    read(ids) {
      const values = server.running ? server.currentValues() : {}
      return Object.fromEntries(
        ids.map((id) => [id, id === '$requests' ? (server.running ? server.requests : undefined) : values[id]])
      )
    },
    async write(id, value) {
      if (id.startsWith('$')) throw new Error(t('coap.errors.readOnlyPoint', { id }))
      return server.setValue(id, value)
    },
    setFaults: (faults) => server.setFaults(faults)
  }
}

/** Points d'un serveur LwM2M : nombre d'appareils enregistrés. */
export function lwm2mServerPoints(server) {
  return {
    points: () => [{ id: '$devices', name: 'LwM2M devices', dataType: 'Int32', numeric: true, writable: false }],
    read: (ids) =>
      Object.fromEntries(
        ids.map((id) => [id, server.running && id === '$devices' ? server.registrations.size : undefined])
      ),
    async write(id) {
      throw new Error(t('coap.errors.readOnlyPoint', { id }))
    }
  }
}

/** Points d'un appareil LwM2M simulé : quelques ressources (température, éclairage). */
export function devicePoints(device) {
  return {
    points: () =>
      DEVICE_POINTS.map(({ id, name, dataType, writable }) => ({ id, name, dataType, numeric: true, writable })),
    read: (ids) =>
      Object.fromEntries(
        ids.map((id) => {
          const point = DEVICE_POINTS.find((p) => p.id === id)
          return [id, point && device.running ? device.values.get(point.path) : undefined]
        })
      ),
    async write(id, value) {
      const point = DEVICE_POINTS.find((p) => p.id === id && p.writable)
      if (point && device.running) return device.setValue(point.path, value)
      throw new Error(t('coap.errors.readOnlyPoint', { id }))
    }
  }
}

/**
 * Points de données du module CoAP / LwM2M (contrat : `points.js` du SDK) : ressources et requêtes
 * de chaque serveur CoAP, appareils enregistrés auprès de chaque serveur LwM2M, ressources de chaque
 * appareil simulé, `<id instance>:<id>`. Défauts injectables sur les serveurs CoAP : délai, absence
 * de réponse, code de réponse forcé.
 */
export function createPointsApi({ instances, savedConfig = () => ({}) }) {
  return instancesPointsApi({
    name: 'CoAP',
    instances,
    roles: {
      server: (server, instance) => serverPoints(server, instance, savedConfig),
      lwm2mServer: lwm2mServerPoints,
      device: devicePoints
    },
    faultTypes: [
      { type: 'delay' },
      { type: 'noResponse' },
      {
        type: 'exception',
        codes: FORCED_CODES.map((value) => ({ value, label: `${codeName(value)} ${CODE_LABELS[value]}` }))
      }
    ]
  })
}
