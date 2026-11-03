import { instancesPointsApi } from '@azerxim/sulfur-sdk'
import { KISS_CODES } from '../shared/constants'
import { t } from '../shared/i18n'

/** Points du serveur : réglages de l'horloge (modifiables) et grandeurs observées. */
const SERVER_POINTS = [
  { id: 'time', name: 'time (ms)', dataType: 'Double', writable: false },
  { id: 'offset', name: 'offset (s)', dataType: 'Double', writable: true },
  { id: 'drift', name: 'drift (ppm)', dataType: 'Double', writable: true },
  { id: 'stratum', name: 'stratum', dataType: 'Int32', writable: true },
  { id: 'leap', name: 'leap', dataType: 'Int32', writable: true },
  { id: 'requests', name: 'requests', dataType: 'Int32', writable: false }
]

/** Points du client : résultat de la dernière interrogation. */
const CLIENT_POINTS = [
  { id: 'offset', name: 'offset (ms)', dataType: 'Double', writable: false },
  { id: 'delay', name: 'delay (ms)', dataType: 'Double', writable: false },
  { id: 'stratum', name: 'stratum', dataType: 'Int32', writable: false }
]

/** Points d'un serveur (identifiants locaux à l'instance). Écrire `offset` décale son horloge. */
export function serverPoints(server) {
  function value(name) {
    if (!server.socket) return undefined
    switch (name) {
      case 'time':
        return server.clock.now()
      case 'offset':
        return server.clock.offset()
      case 'drift':
        return server.clock.drift
      case 'requests':
        return server.requests
      default:
        return server.config[name]
    }
  }
  return {
    points: () => SERVER_POINTS.map((p) => ({ ...p, numeric: true })),
    read: (ids) => Object.fromEntries(ids.map((id) => [id, value(id)])),
    async write(id, value) {
      switch (id) {
        case 'offset':
          return server.setClock({ mode: 'offset', offset: Number(value) })
        case 'drift':
          return server.setDrift(value)
        case 'stratum':
          return server.setSettings({ stratum: Number(value) })
        case 'leap':
          return server.setSettings({ leap: Number(value) })
        default:
          throw new Error(t('ntp.errors.readOnlyPoint', { id }))
      }
    },
    setFaults: (faults) => server.setFaults(faults)
  }
}

/** Points d'un client : résultat de sa dernière interrogation. */
export function clientPoints(client) {
  function value(name) {
    const last = client.history.at(-1)
    if (!last || last.error || last.kiss) return undefined
    return last[name]
  }
  return {
    points: () => CLIENT_POINTS.map((p) => ({ ...p, numeric: true })),
    read: (ids) => Object.fromEntries(ids.map((id) => [id, value(id)]))
  }
}

/**
 * Points de données du module NTP pour les autres modules (contrat : `points.js` du SDK) : ceux de
 * chaque serveur et de chaque client, `<id instance>:<id>`. Écrire l'offset d'un serveur décale son
 * horloge simulée : un flux du simulateur peut ainsi provoquer des sauts d'heure.
 */
export function createPointsApi({ instances }) {
  return instancesPointsApi({
    name: 'NTP',
    instances,
    roles: { server: serverPoints, client: clientPoints },
    faultTypes: [
      { type: 'delay' },
      { type: 'noResponse' },
      { type: 'kissOfDeath', codes: KISS_CODES.map((code) => ({ value: code, label: code })) },
      { type: 'freeze' }
    ]
  })
}
