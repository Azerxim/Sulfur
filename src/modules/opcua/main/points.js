import { DEFAULT_SERVER_CONFIG, NUMERIC_TYPES } from '../shared/constants'
import { toPlain } from './serialize'

/** Codes d'état proposés pour le défaut « code d'état forcé ». */
export const FAULT_STATUS_CODES = [
  'BadSensorFailure',
  'BadCommunicationError',
  'BadDeviceFailure',
  'BadOutOfService',
  'BadNoCommunication',
  'BadWaitingForInitialData',
  'BadConfigurationError',
  'UncertainLastUsableValue',
  'UncertainSensorNotAccurate'
]

const SERVER = 'server:'
const CLIENT = 'client:'

/**
 * Points de données du module OPC UA pour les autres modules (contrat : `@shared/points`) :
 * variables du serveur (`server:<id>`) et variables surveillées par le client (`client:<nodeId>`).
 * `savedConfig()` : configuration enregistrée du module, pour lister les variables serveur arrêté.
 */
export function createPointsApi({ server, client, savedConfig = () => ({}) }) {
  const variables = () =>
    server.status().config?.variables ?? savedConfig().server?.variables ?? DEFAULT_SERVER_CONFIG.variables

  return {
    name: 'OPC UA',

    points() {
      const isArray = (v) => Number(v.arrayLength) > 0
      return [
        ...variables().map((v) => ({
          id: SERVER + v.id,
          group: 'server',
          name: v.name,
          dataType: `${v.dataType}${isArray(v) ? '[]' : ''}`,
          numeric: !isArray(v) && (NUMERIC_TYPES.includes(v.dataType) || v.dataType === 'Boolean'),
          writable: true
        })),
        ...client.status().monitored.map((nodeId) => ({
          id: CLIENT + nodeId,
          group: 'client',
          name: nodeId,
          dataType: client.last.get(nodeId)?.dataType ?? null,
          numeric: true,
          writable: true
        }))
      ]
    },

    read(ids) {
      const values = server.values()
      return Object.fromEntries(
        ids.map((id) => [
          id,
          id.startsWith(SERVER)
            ? values[id.slice(SERVER.length)]
            : toPlain(client.last.get(id.slice(CLIENT.length))?.value)
        ])
      )
    },

    async write(id, value) {
      if (id.startsWith(SERVER)) return server.setValue(id.slice(SERVER.length), value)
      return client.write(id.slice(CLIENT.length), value)
    },

    faultTypes() {
      return [
        { type: 'delay' },
        { type: 'noResponse' },
        { type: 'cut' },
        { type: 'badStatus', codes: FAULT_STATUS_CODES.map((code) => ({ value: code, label: code })), points: true },
        { type: 'freeze', points: true }
      ]
    },

    /** Les défauts portent sur les variables du serveur (ids `server:<id>`). */
    setFaults(faults) {
      return server.setFaults(
        faults.map((f) => ({
          ...f,
          points: (f.points ?? []).filter((p) => p.startsWith(SERVER)).map((p) => p.slice(SERVER.length))
        }))
      )
    }
  }
}
