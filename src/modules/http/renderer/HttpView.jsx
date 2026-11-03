import { useEffect, useState } from 'react'
import { faComputer, faServer } from '@fortawesome/free-solid-svg-icons'
import { TabbedPage, useStoredState } from '@azerxim/sulfur-sdk/ui'
import { httpApi } from './api'
import ServerPanel from './ServerPanel'
import ClientPanel from './ClientPanel'
import { t } from '../shared/i18n'

const dot = (on) => <span className={`size-1.5 rounded-full ${on ? 'bg-emerald-400' : 'bg-slate-600'}`} />

export default function HttpView() {
  const [tab, setTab] = useStoredState('sulfur:tab:http', 'server', ['server', 'client'])
  const [serverStatus, setServerStatus] = useState({ running: false })
  const [clientStatus, setClientStatus] = useState({ watches: [] })

  useEffect(() => {
    httpApi.server.status().then(setServerStatus)
    httpApi.client.status().then(setClientStatus)
    const offs = [httpApi.server.onStatus(setServerStatus), httpApi.client.onStatus(setClientStatus)]
    return () => offs.forEach((off) => off())
  }, [])

  return (
    <TabbedPage
      value={tab}
      onChange={setTab}
      tabs={[
        { id: 'server', label: t('ui.server'), icon: faServer, badge: dot(serverStatus.running) },
        { id: 'client', label: t('ui.client'), icon: faComputer, badge: dot(clientStatus.watches?.length > 0) }
      ]}
    >
      {/* Les deux panneaux restent montés pour conserver leur état local. */}
      <div className={tab === 'server' ? 'contents' : 'hidden'}>
        <ServerPanel status={serverStatus} />
      </div>
      <div className={tab === 'client' ? 'contents' : 'hidden'}>
        <ClientPanel status={clientStatus} serverUrl={serverStatus.url} />
      </div>
    </TabbedPage>
  )
}
