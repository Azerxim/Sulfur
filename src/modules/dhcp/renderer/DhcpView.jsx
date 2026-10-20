import { useCallback, useEffect, useState } from 'react'
import { MonitorSmartphone, Server } from 'lucide-react'
import { Tabs, useStoredState } from '@renderer/components/ui'
import { dhcpApi } from './api'
import ServerPanel from './ServerPanel'
import ClientPanel from './ClientPanel'
import { t } from '../shared/i18n'

const dot = (on) => <span className={`size-1.5 rounded-full ${on ? 'bg-emerald-400' : 'bg-slate-600'}`} />

export default function DhcpView() {
  const [tab, setTab] = useStoredState('sulfur:tab:dhcp', 'server', ['server', 'client'])
  const [serverStatus, setServerStatus] = useState({ running: false })
  const [network, setNetwork] = useState({ interfaces: [], networks: [] })

  const reload = useCallback(() => {
    dhcpApi
      .interfaces()
      .then(setNetwork)
      .catch(() => {})
  }, [])

  useEffect(() => {
    reload()
    dhcpApi.server.status().then(setServerStatus)
    return dhcpApi.server.onStatus(setServerStatus)
  }, [reload])

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
        <ServerPanel status={serverStatus} network={network} onReload={reload} />
      </div>
      <div className={tab === 'client' ? 'contents' : 'hidden'}>
        <ClientPanel network={network} onReload={reload} />
      </div>
    </div>
  )
}
