import { useEffect, useState } from 'react'
import { MonitorSmartphone, Server } from 'lucide-react'
import { TabbedPage, useStoredState } from '@azerxim/sulfur-sdk/ui'
import { snmpApi } from './api'
import AgentPanel from './AgentPanel'
import ManagerPanel from './ManagerPanel'
import { t } from '../shared/i18n'

const dot = (on) => <span className={`size-1.5 rounded-full ${on ? 'bg-emerald-400' : 'bg-slate-600'}`} />

export default function SnmpView() {
  const [tab, setTab] = useStoredState('sulfur:tab:snmp', 'server', ['server', 'client'])
  const [agentStatus, setAgentStatus] = useState({ running: false })
  const [managerStatus, setManagerStatus] = useState({ polling: false, receiving: false })

  useEffect(() => {
    snmpApi.agent.status().then(setAgentStatus)
    snmpApi.manager.status().then(setManagerStatus)
    const offs = [snmpApi.agent.onStatus(setAgentStatus), snmpApi.manager.onStatus(setManagerStatus)]
    return () => offs.forEach((off) => off())
  }, [])

  return (
    <TabbedPage
      value={tab}
      onChange={setTab}
      tabs={[
        { id: 'server', label: t('snmp.tabs.agent'), icon: Server, badge: dot(agentStatus.running) },
        {
          id: 'client',
          label: t('snmp.tabs.manager'),
          icon: MonitorSmartphone,
          badge: dot(managerStatus.polling || managerStatus.receiving)
        }
      ]}
    >
      <div className={tab === 'server' ? 'contents' : 'hidden'}>
        <AgentPanel status={agentStatus} />
      </div>
      <div className={tab === 'client' ? 'contents' : 'hidden'}>
        <ManagerPanel status={managerStatus} agent={agentStatus.running ? agentStatus.config : null} />
      </div>
    </TabbedPage>
  )
}
