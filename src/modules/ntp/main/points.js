import { KISS_CODES } from '../shared/constants'
import { t } from '../shared/i18n'

/** Points du serveur : réglages de l'horloge (modifiables) et grandeurs observées. */
const SERVER_POINTS = [
  { id: 'server:time', name: 'time (ms)', dataType: 'Double', writable: false },
  { id: 'server:offset', name: 'offset (s)', dataType: 'Double', writable: true },
  { id: 'server:drift', name: 'drift (ppm)', dataType: 'Double', writable: true },
  { id: 'server:stratum', name: 'stratum', dataType: 'Int32', writable: true },
  { id: 'server:leap', name: 'leap', dataType: 'Int32', writable: true },
  { id: 'server:requests', name: 'requests', dataType: 'Int32', writable: false }
]

/** Points du client : résultat de la dernière interrogation. */
const CLIENT_POINTS = [
  { id: 'client:offset', name: 'offset (ms)', dataType: 'Double', writable: false },
  { id: 'client:delay', name: 'delay (ms)', dataType: 'Double', writable: false },
  { id: 'client:stratum', name: 'stratum', dataType: 'Int32', writable: false }
]

/**
 * Points de données du module NTP pour les autres modules (contrat : `points.js` du SDK). Écrire
 * `server:offset` décale l'horloge simulée : un flux du simulateur peut ainsi provoquer des sauts
 * d'heure.
 */
export function createPointsApi({ server, client }) {
  function serverValue(name) {
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

  function clientValue(name) {
    const last = client.history.at(-1)
    if (!last || last.error || last.kiss) return undefined
    return last[name]
  }

  return {
    name: 'NTP',

    points() {
      return [
        ...SERVER_POINTS.map((p) => ({ ...p, group: 'server', numeric: true })),
        ...CLIENT_POINTS.map((p) => ({ ...p, group: 'client', numeric: true }))
      ]
    },

    read(ids) {
      return Object.fromEntries(
        ids.map((id) => {
          const [group, name] = id.split(':')
          return [id, group === 'server' ? serverValue(name) : clientValue(name)]
        })
      )
    },

    async write(id, value) {
      switch (id) {
        case 'server:offset':
          return server.setClock({ mode: 'offset', offset: Number(value) })
        case 'server:drift':
          return server.setDrift(value)
        case 'server:stratum':
          return server.setSettings({ stratum: Number(value) })
        case 'server:leap':
          return server.setSettings({ leap: Number(value) })
        default:
          throw new Error(t('ntp.errors.readOnlyPoint', { id }))
      }
    },

    faultTypes() {
      return [
        { type: 'delay' },
        { type: 'noResponse' },
        { type: 'kissOfDeath', codes: KISS_CODES.map((code) => ({ value: code, label: code })) },
        { type: 'freeze' }
      ]
    },

    setFaults(faults) {
      server.setFaults(faults)
    }
  }
}
