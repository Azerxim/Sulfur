import { useEffect, useState } from 'react'
import { faComputer, faServer } from '@fortawesome/free-solid-svg-icons'
import { TabbedPage, useStoredState } from '@azerxim/sulfur-sdk/ui'
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
    <TabbedPage
      value={tab}
      onChange={setTab}
      tabs={[
        { id: 'server', label: t('ui.server'), icon: faServer, badge: dot(serverStatus.running) },
        { id: 'client', label: t('ui.client'), icon: faComputer }
      ]}
    >
      {/* Les deux panneaux restent montés pour conserver leur état local. */}
      <div className={tab === 'server' ? 'contents' : 'hidden'}>
        <ServerPanel status={serverStatus} />
      </div>
      <div className={tab === 'client' ? 'contents' : 'hidden'}>
        <ClientPanel serverPort={serverStatus.running ? serverStatus.config?.port : null} />
      </div>
    </TabbedPage>
  )
}
