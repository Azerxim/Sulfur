import { useEffect, useState } from 'react'
import { MonitorSmartphone, Server } from 'lucide-react'
import { Tabs } from '@renderer/components/ui'
import { modbusApi } from './api'
import ServerPanel from './ServerPanel'
import ClientPanel from './ClientPanel'
import { t } from '../shared/i18n'

const dot = (on) => <span className={`size-1.5 rounded-full ${on ? 'bg-emerald-400' : 'bg-slate-600'}`} />

export default function ModbusView() {
  const [tab, setTab] = useState('server')
  const [serverStatus, setServerStatus] = useState({ running: false, connections: [] })
  const [clientStatus, setClientStatus] = useState({ connected: false, watches: [] })

  useEffect(() => {
    modbusApi.server.status().then(setServerStatus)
    modbusApi.client.status().then(setClientStatus)
    const offs = [modbusApi.server.onStatus(setServerStatus), modbusApi.client.onStatus(setClientStatus)]
    return () => offs.forEach((off) => off())
  }, [])

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'server', label: t('ui.server'), icon: Server, badge: dot(serverStatus.running) },
          { id: 'client', label: t('ui.client'), icon: MonitorSmartphone, badge: dot(clientStatus.connected) }
        ]}
      />
      {/* Les deux panneaux restent montés pour conserver leur état local. */}
      <div className={tab === 'server' ? 'contents' : 'hidden'}>
        <ServerPanel status={serverStatus} />
      </div>
      <div className={tab === 'client' ? 'contents' : 'hidden'}>
        <ClientPanel status={clientStatus} serverPort={serverStatus.running ? serverStatus.config?.port : null} serverMode={serverStatus.config?.security?.mode} />
      </div>
    </div>
  )
}
