import { useEffect, useState } from 'react'
import { Search, Server } from 'lucide-react'
import { Tabs, useStoredState } from '@azerxim/sulfur-sdk/ui'
import { dnsApi } from './api'
import ServerPanel from './ServerPanel'
import ClientPanel from './ClientPanel'
import { t } from '../shared/i18n'

const dot = (on) => <span className={`size-1.5 rounded-full ${on ? 'bg-emerald-400' : 'bg-slate-600'}`} />

export default function DnsView() {
  const [tab, setTab] = useStoredState('sulfur:tab:dns', 'server', ['server', 'client'])
  const [status, setStatus] = useState({ running: false })

  useEffect(() => {
    dnsApi.server.status().then(setStatus)
    return dnsApi.server.onStatus(setStatus)
  }, [])

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'server', label: t('ui.server'), icon: Server, badge: dot(status.running) },
          { id: 'client', label: t('ui.client'), icon: Search }
        ]}
      />
      {/* Les deux panneaux restent montés pour conserver leur état local. */}
      <div className={tab === 'server' ? 'contents' : 'hidden'}>
        <ServerPanel status={status} />
      </div>
      <div className={tab === 'client' ? 'contents' : 'hidden'}>
        <ClientPanel serverPort={status.running ? status.config?.port : null} />
      </div>
    </div>
  )
}
