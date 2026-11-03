import { useEffect, useState } from 'react'
import { faComputer, faServer } from '@fortawesome/free-solid-svg-icons'
import { TabbedPage, useStoredState } from '@azerxim/sulfur-sdk/ui'
import { ntpApi } from './api'
import ServerPanel from './ServerPanel'
import ClientPanel from './ClientPanel'
import { t } from '../shared/i18n'

const dot = (on) => <span className={`size-1.5 rounded-full ${on ? 'bg-emerald-400' : 'bg-slate-600'}`} />

export default function NtpView() {
  const [tab, setTab] = useStoredState('sulfur:tab:ntp', 'server', ['server', 'client'])
  const [serverStatus, setServerStatus] = useState({ running: false, clients: [] })
  const [clientStatus, setClientStatus] = useState({ polling: false })

  useEffect(() => {
    ntpApi.server.status().then(setServerStatus)
    ntpApi.client.status().then(setClientStatus)
    const offs = [ntpApi.server.onStatus(setServerStatus), ntpApi.client.onStatus(setClientStatus)]
    return () => offs.forEach((off) => off())
  }, [])

  return (
    <TabbedPage
      value={tab}
      onChange={setTab}
      tabs={[
        { id: 'server', label: t('ui.server'), icon: faServer, badge: dot(serverStatus.running) },
        { id: 'client', label: t('ui.client'), icon: faComputer, badge: dot(clientStatus.polling) }
      ]}
    >
      <div className={tab === 'server' ? 'contents' : 'hidden'}>
        <ServerPanel status={serverStatus} />
      </div>
      <div className={tab === 'client' ? 'contents' : 'hidden'}>
        <ClientPanel status={clientStatus} serverPort={serverStatus.running ? serverStatus.config?.port : null} />
      </div>
    </TabbedPage>
  )
}
