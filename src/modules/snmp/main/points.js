import { instanceSection, instancesPointsApi } from '@azerxim/sulfur-sdk'
import { DEFAULT_AGENT_CONFIG, DEFAULT_MANAGER_CONFIG, FAULT_ERRORS, NUMERIC_TYPES } from '../shared/constants'
import { t } from '../shared/i18n'

/**
 * Points d'un agent : objets simulés (modifiables), `$requests` et `$trap` (écrire, quelle que soit
 * la valeur, envoie la notification configurée).
 */
export function agentPoints(agent, instance, savedConfig = () => ({})) {
  const objects = () =>
    agent.config?.objects ??
    savedConfig()[instanceSection('agent', instance.id)]?.objects ??
    DEFAULT_AGENT_CONFIG.objects
  return {
    points: () => [
      ...objects().map((d) => ({
        id: d.id,
        name: `${d.name || d.oid} (${d.oid}.0)`,
        dataType: d.type,
        numeric: NUMERIC_TYPES.includes(d.type),
        writable: true
      })),
      { id: '$requests', name: 'requests', dataType: 'Int32', numeric: true, writable: false },
      { id: '$trap', name: 'traps sent (write: send)', dataType: 'Int32', numeric: true, writable: true }
    ],
    read(ids) {
      const values = agent.values()
      return Object.fromEntries(
        ids.map((id) => {
          if (id === '$requests') return [id, agent.running ? agent.requests : undefined]
          if (id === '$trap') return [id, agent.running ? agent.trapsSent : undefined]
          return [id, values[id]]
        })
      )
    },
    async write(id, value) {
      if (id === '$trap') return agent.sendTrap()
      if (id.startsWith('$')) throw new Error(t('snmp.errors.readOnlyPoint', { id }))
      return agent.setValue(id, value)
    },
    setFaults: (faults) => agent.setFaults(faults)
  }
}

/** Points d'un manager : OID surveillés (écrire envoie un SetRequest) et `$traps` reçues. */
export function managerPoints(manager, instance, savedConfig = () => ({})) {
  const monitors = () =>
    manager.pollConfig?.monitors ??
    savedConfig()[instanceSection('manager', instance.id)]?.monitors ??
    DEFAULT_MANAGER_CONFIG.monitors
  return {
    points: () => [
      ...monitors().map((m) => ({
        id: m.id,
        name: m.label ? `${m.label} (${m.oid})` : m.oid,
        dataType: 'JSON',
        numeric: true,
        writable: true
      })),
      { id: '$traps', name: 'traps received', dataType: 'Int32', numeric: true, writable: false }
    ],
    read(ids) {
      return Object.fromEntries(
        ids.map((id) => {
          if (id === '$traps') return [id, manager.trapCount]
          const last = manager.last.get(id)
          return [id, last && !last.error ? last.value : undefined]
        })
      )
    },
    async write(id, value) {
      if (id.startsWith('$')) throw new Error(t('snmp.errors.readOnlyPoint', { id }))
      return manager.writeMonitor(id, value)
    }
  }
}

/**
 * Points de données du module SNMP (contrat : `points.js` du SDK) : ceux de chaque agent et de
 * chaque manager, `<id instance>:<id>`. Les valeurs figées portent sur les objets des agents.
 */
export function createPointsApi({ instances, savedConfig = () => ({}) }) {
  return instancesPointsApi({
    name: 'SNMP',
    instances,
    roles: {
      agent: (agent, instance) => agentPoints(agent, instance, savedConfig),
      manager: (manager, instance) => managerPoints(manager, instance, savedConfig)
    },
    faultTypes: [
      { type: 'delay' },
      { type: 'noResponse' },
      { type: 'exception', codes: FAULT_ERRORS.map((e) => ({ value: e.code, label: `${e.code} · ${e.name}` })) },
      { type: 'freeze', points: true }
    ]
  })
}
