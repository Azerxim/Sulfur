import { faComputer, faServer } from '@fortawesome/free-solid-svg-icons'
import { InstancesPage, useInstanceStatuses } from '@azerxim/sulfur-sdk/ui'
import AgentPanel from './AgentPanel'
import ManagerPanel from './ManagerPanel'
import { t } from '../shared/i18n'

/** États au repos, avant la première lecture. */
const IDLE = {
  agent: { running: false },
  manager: { polling: false, receiving: false }
}

/** Page du module : un onglet par instance (aucune par défaut). */
export default function SnmpView() {
  const agentStatuses = useInstanceStatuses('snmp', 'agent')
  const managerStatuses = useInstanceStatuses('snmp', 'manager')
  const statuses = { ...agentStatuses, ...managerStatuses }
  // Premier serveur en marche : les clients proposent de s’y connecter.
  const localServer = Object.values(agentStatuses).find((s) => s.running) ?? null
  const roles = [
    { role: 'agent', label: t('snmp.tabs.agent'), icon: faServer },
    { role: 'manager', label: t('snmp.tabs.manager'), icon: faComputer }
  ]
  return (
    <InstancesPage moduleId="snmp" roles={roles} statuses={statuses}>
      {(instance) => {
        const status = statuses[instance.id] ?? IDLE[instance.role]
        switch (instance.role) {
          case 'agent':
            return <AgentPanel instance={instance} status={status} />
          default:
            return <ManagerPanel instance={instance} status={status} agent={localServer?.config ?? null} />
        }
      }}
    </InstancesPage>
  )
}
