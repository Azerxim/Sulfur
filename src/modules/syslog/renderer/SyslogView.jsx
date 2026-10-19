import { useEffect, useState } from 'react'
import { MonitorSmartphone, Server } from 'lucide-react'
import { Tabs, useStoredState } from '@renderer/components/ui'
import { syslogApi } from './api'
import ServerPanel from './ServerPanel'
import ClientPanel from './ClientPanel'
import { t } from '../shared/i18n'

const dot = (on) => <span className={`size-1.5 rounded-full ${on ? 'bg-emerald-400' : 'bg-slate-600'}`} />

export default function SyslogView() {
  const [tab, setTab] = useStoredState('sulfur:tab:syslog', 'server', ['server', 'client'])
  const [serverStatus, setServerStatus] = useState({ running: false, endpoints: [], counts: [] })
  const [clientStatus, setClientStatus] = useState({ repeating: false })

  useEffect(() => {
    syslogApi.server.status().then(setServerStatus)
    syslogApi.client.status().then(setClientStatus)
    const offs = [syslogApi.server.onStatus(setServerStatus), syslogApi.client.onStatus(setClientStatus)]
    return () => offs.forEach((off) => off())
  }, [])

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'server', label: t('ui.server'), icon: Server, badge: dot(serverStatus.running) },
          {
            id: 'client',
            label: t('ui.client'),
            icon: MonitorSmartphone,
            badge: dot(clientStatus.repeating || clientStatus.connected)
          }
        ]}
      />
      <div className={tab === 'server' ? 'contents' : 'hidden'}>
        <ServerPanel status={serverStatus} />
      </div>
      <div className={tab === 'client' ? 'contents' : 'hidden'}>
        <ClientPanel status={clientStatus} server={serverStatus.running ? serverStatus.config : null} />
      </div>
    </div>
  )
}
