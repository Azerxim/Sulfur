import { DEFAULT_SERVER_CONFIG, FAULT_STATUSES, NUMERIC_TYPES } from '../shared/constants'
import { t } from '../shared/i18n'

const SERVER = 'server:'
const CLIENT = 'client:'

/**
 * Points de données du module HTTP pour les autres modules (contrat : `@shared/points`) :
 * variables du serveur (`server:<id>`) et surveillances du client (`client:<id>`).
 */
export function createPointsApi({ server, client, savedConfig = () => ({}) }) {
  const variables = () =>
    server.status().config?.variables ?? savedConfig().server?.variables ?? DEFAULT_SERVER_CONFIG.variables

  return {
    name: 'HTTP / REST',

    points() {
      return [
        ...variables().map((v) => ({
          id: SERVER + v.id,
          group: 'server',
          name: v.name,
          dataType: v.dataType,
          numeric: NUMERIC_TYPES.includes(v.dataType),
          writable: true
        })),
        ...client.status().watches.map((w) => ({
          id: CLIENT + w.id,
          group: 'client',
          name: w.label || `${w.path}${w.jsonPath ? ` · ${w.jsonPath}` : ''}`,
          dataType: 'JSON',
          // Valeur JSON quelconque : numérique pour les courbes si c'est un nombre ou un booléen.
          numeric: true,
          writable: !!w.writeMethod
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
            : (client.last.get(id.slice(CLIENT.length))?.value ?? undefined)
        ])
      )
    },

    async write(id, value) {
      if (id.startsWith(SERVER)) return server.setValue(id.slice(SERVER.length), value)
      if (!client.watches.has(id.slice(CLIENT.length))) throw new Error(t('http.errors.unknownWatch'))
      return client.writeWatch(id.slice(CLIENT.length), value)
    },

    faultTypes() {
      return [
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
    },

    /** Les défauts portent sur les variables du serveur (ids `server:<id>`). */
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
