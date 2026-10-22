import { useEffect, useState } from 'react'
import { MonitorSmartphone, Server } from 'lucide-react'
import { Tabs, useStoredState } from '@azerxim/sulfur-sdk/ui'
import { tftpApi } from './api'
import ServerPanel from './ServerPanel'
import ClientPanel from './ClientPanel'
import { t } from '../shared/i18n'

const dot = (on) => <span className={`size-1.5 rounded-full ${on ? 'bg-emerald-400' : 'bg-slate-600'}`} />

export default function TftpView() {
  const [tab, setTab] = useStoredState('sulfur:tab:tftp', 'server', ['server', 'client'])
  const [serverStatus, setServerStatus] = useState({ running: false })

  useEffect(() => {
    tftpApi.server.status().then(setServerStatus)
    return tftpApi.server.onStatus(setServerStatus)
  }, [])

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'server', label: t('ui.server'), icon: Server, badge: dot(serverStatus.running) },
          { id: 'client', label: t('ui.client'), icon: MonitorSmartphone }
        ]}
      />
      {/* Les deux panneaux restent montés pour conserver leur état local. */}
      <div className={tab === 'server' ? 'contents' : 'hidden'}>
        <ServerPanel status={serverStatus} />
      </div>
      <div className={tab === 'client' ? 'contents' : 'hidden'}>
        <ClientPanel serverPort={serverStatus.running ? serverStatus.config?.port : null} />
      </div>
    </div>
  )
}
