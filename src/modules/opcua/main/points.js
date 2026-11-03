import { instanceSection, instancesPointsApi } from '@azerxim/sulfur-sdk'
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

/** Points d'un serveur : ses variables. */
export function serverPoints(server, instance, savedConfig = () => ({})) {
  const variables = () =>
    server.status().config?.variables ??
    savedConfig()[instanceSection('server', instance.id)]?.variables ??
    DEFAULT_SERVER_CONFIG.variables
  const isArray = (v) => Number(v.arrayLength) > 0
  return {
    points: () =>
      variables().map((v) => ({
        id: v.id,
        name: v.name,
        dataType: `${v.dataType}${isArray(v) ? '[]' : ''}`,
        numeric: !isArray(v) && (NUMERIC_TYPES.includes(v.dataType) || v.dataType === 'Boolean'),
        writable: true
      })),
    read(ids) {
      const values = server.values()
      return Object.fromEntries(ids.map((id) => [id, values[id]]))
    },
    write: (id, value) => server.setValue(id, value),
    setFaults: (faults) => server.setFaults(faults)
  }
}

/** Points d'un client : nœuds surveillés (identifiant : NodeId). */
export function clientPoints(client) {
  return {
    points: () =>
      client.status().monitored.map((nodeId) => ({
        id: nodeId,
        name: nodeId,
        dataType: client.last.get(nodeId)?.dataType ?? null,
        numeric: true,
        writable: true
      })),
    read: (ids) => Object.fromEntries(ids.map((id) => [id, toPlain(client.last.get(id)?.value)])),
    write: (id, value) => client.write(id, value)
  }
}

/**
 * Points de données du module OPC UA (contrat : `points.js` du SDK) : variables de chaque serveur
 * et nœuds surveillés par chaque client, `<id instance>:<id>`.
 */
export function createPointsApi({ instances, savedConfig = () => ({}) }) {
  return instancesPointsApi({
    name: 'OPC UA',
    instances,
    roles: { server: (server, instance) => serverPoints(server, instance, savedConfig), client: clientPoints },
    faultTypes: [
      { type: 'delay' },
      { type: 'noResponse' },
      { type: 'cut' },
      { type: 'badStatus', codes: FAULT_STATUS_CODES.map((code) => ({ value: code, label: code })), points: true },
      { type: 'freeze', points: true }
    ]
  })
}
