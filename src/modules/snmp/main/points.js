import { DEFAULT_AGENT_CONFIG, DEFAULT_MANAGER_CONFIG, FAULT_ERRORS, NUMERIC_TYPES } from '../shared/constants'
import { t } from '../shared/i18n'

const SERVER = 'server:'
const CLIENT = 'client:'

/**
 * Points de données du module SNMP (contrat : `points.js` du SDK) :
 *  - objets simulés de l'agent (`server:<id>`), modifiables ;
 *  - `server:$trap` : écrire (n'importe quelle valeur) envoie la notification configurée ;
 *  - OID surveillés par le manager (`client:<id>`) : écrire envoie un SetRequest ;
 *  - nombres de requêtes de l'agent et de notifications reçues.
 */
export function createPointsApi({ agent, manager, savedConfig = () => ({}) }) {
  const objects = () => agent.config?.objects ?? savedConfig().agent?.objects ?? DEFAULT_AGENT_CONFIG.objects
  const monitors = () =>
    manager.pollConfig?.monitors ?? savedConfig().manager?.monitors ?? DEFAULT_MANAGER_CONFIG.monitors

  return {
    name: 'SNMP',

    points() {
      return [
        ...objects().map((d) => ({
          id: SERVER + d.id,
          group: 'server',
          name: `${d.name || d.oid} (${d.oid}.0)`,
          dataType: d.type,
          numeric: NUMERIC_TYPES.includes(d.type),
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
          id: 'server:$trap',
          group: 'server',
          name: 'traps sent (write: send)',
          dataType: 'Int32',
          numeric: true,
          writable: true
        },
        ...monitors().map((m) => ({
          id: CLIENT + m.id,
          group: 'client',
          name: m.label ? `${m.label} (${m.oid})` : m.oid,
          dataType: 'JSON',
          numeric: true,
          writable: true
        })),
        {
          id: 'client:$traps',
          group: 'client',
          name: 'traps received',
          dataType: 'Int32',
          numeric: true,
          writable: false
        }
      ]
    },

    read(ids) {
      const values = agent.values()
      return Object.fromEntries(
        ids.map((id) => {
          if (id === 'server:$requests') return [id, agent.running ? agent.requests : undefined]
          if (id === 'server:$trap') return [id, agent.running ? agent.trapsSent : undefined]
          if (id === 'client:$traps') return [id, manager.trapCount]
          if (id.startsWith(SERVER)) return [id, values[id.slice(SERVER.length)]]
          const last = manager.last.get(id.slice(CLIENT.length))
          return [id, last && !last.error ? last.value : undefined]
        })
      )
    },

    async write(id, value) {
      if (id === 'server:$trap') return agent.sendTrap()
      if (id.startsWith('server:$') || id.startsWith('client:$'))
        throw new Error(t('snmp.errors.readOnlyPoint', { id }))
      if (id.startsWith(SERVER)) return agent.setValue(id.slice(SERVER.length), value)
      return manager.writeMonitor(id.slice(CLIENT.length), value)
    },

    faultTypes() {
      return [
        { type: 'delay' },
        { type: 'noResponse' },
        { type: 'exception', codes: FAULT_ERRORS.map((e) => ({ value: e.code, label: `${e.code} · ${e.name}` })) },
        { type: 'freeze', points: true }
      ]
    },

    /** Les valeurs figées portent sur les objets de l'agent (ids `server:<id>`). */
    setFaults(faults) {
      agent.setFaults(
        faults.map((f) => ({
          ...f,
          points: (f.points ?? []).filter((p) => p.startsWith(SERVER)).map((p) => p.slice(SERVER.length))
        }))
      )
    }
  }
}
