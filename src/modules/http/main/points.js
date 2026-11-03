import { instanceSection, instancesPointsApi } from '@azerxim/sulfur-sdk'
import { DEFAULT_SERVER_CONFIG, FAULT_STATUSES, NUMERIC_TYPES } from '../shared/constants'
import { t } from '../shared/i18n'

/** Points d'un serveur : ses variables. */
export function serverPoints(server, instance, savedConfig = () => ({})) {
  const variables = () =>
    server.status().config?.variables ??
    savedConfig()[instanceSection('server', instance.id)]?.variables ??
    DEFAULT_SERVER_CONFIG.variables
  return {
    points: () =>
      variables().map((v) => ({
        id: v.id,
        name: v.name,
        dataType: v.dataType,
        numeric: NUMERIC_TYPES.includes(v.dataType),
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

/** Points d'un client : ses surveillances (écrire envoie la requête d'écriture de la surveillance). */
export function clientPoints(client) {
  return {
    points: () =>
      client.status().watches.map((w) => ({
        id: w.id,
        name: w.label || `${w.path}${w.jsonPath ? ` · ${w.jsonPath}` : ''}`,
        dataType: 'JSON',
        // Valeur JSON quelconque : numérique pour les courbes si c'est un nombre ou un booléen.
        numeric: true,
        writable: !!w.writeMethod
      })),
    read: (ids) => Object.fromEntries(ids.map((id) => [id, client.last.get(id)?.value ?? undefined])),
    async write(id, value) {
      if (!client.watches.has(id)) throw new Error(t('http.errors.unknownWatch'))
      return client.writeWatch(id, value)
    }
  }
}

/**
 * Points de données du module HTTP pour les autres modules (contrat : `points.js` du SDK) :
 * variables de chaque serveur et surveillances de chaque client, `<id instance>:<id>`.
 */
export function createPointsApi({ instances, savedConfig = () => ({}) }) {
  return instancesPointsApi({
    name: 'HTTP / REST',
    instances,
    roles: { server: (server, instance) => serverPoints(server, instance, savedConfig), client: clientPoints },
    faultTypes: [
      { type: 'delay' },
      { type: 'noResponse' },
      { type: 'cut' },
      {
        type: 'badStatus',
        codes: FAULT_STATUSES.map((code) => ({ value: code, label: `HTTP ${code}` })),
        points: true
      },
      { type: 'freeze', points: true }
    ]
  })
}
