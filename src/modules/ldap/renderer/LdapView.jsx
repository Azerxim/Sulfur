import { useEffect, useState } from 'react'
import { MonitorSmartphone, Server } from 'lucide-react'
import { Tabs, useStoredState } from '@renderer/components/ui'
import { ldapApi, radiusApi } from './api'
import ServerPanel from './ServerPanel'
import ClientPanel from './ClientPanel'
import RadiusServerPanel from './radius/ServerPanel'
import RadiusClientPanel from './radius/ClientPanel'
import { t } from '../shared/i18n'

/** Onglets : serveur et client LDAP (identifiants d'origine, onglet mémorisé conservé), puis RADIUS. */
const TABS = ['server', 'client', 'radiusServer', 'radiusClient']

const dot = (on) => <span className={`size-1.5 rounded-full ${on ? 'bg-emerald-400' : 'bg-slate-600'}`} />

/** Statut d'un serveur, suivi en direct. */
function useStatus(api) {
  const [status, setStatus] = useState({ running: false })
  useEffect(() => {
    api.status().then(setStatus)
    return api.onStatus(setStatus)
  }, [api])
  return status
}

export default function LdapView() {
  const [tab, setTab] = useStoredState('sulfur:tab:ldap', 'server', TABS)
  const status = useStatus(ldapApi.server)
  const radius = useStatus(radiusApi.server)

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'server', label: t('ldap.tabs.server'), icon: Server, badge: dot(status.running) },
          { id: 'client', label: t('ldap.tabs.client'), icon: MonitorSmartphone },
          { id: 'radiusServer', label: t('ldap.tabs.radiusServer'), icon: Server, badge: dot(radius.running) },
          { id: 'radiusClient', label: t('ldap.tabs.radiusClient'), icon: MonitorSmartphone }
        ]}
      />
      {/* Les panneaux restent montés pour conserver leur état local. */}
      <div className={tab === 'server' ? 'contents' : 'hidden'}>
        <ServerPanel status={status} />
      </div>
      <div className={tab === 'client' ? 'contents' : 'hidden'}>
        <ClientPanel serverUrl={status.running ? status.endpoint : null} />
      </div>
      <div className={tab === 'radiusServer' ? 'contents' : 'hidden'}>
        <RadiusServerPanel status={radius} />
      </div>
      <div className={tab === 'radiusClient' ? 'contents' : 'hidden'}>
        <RadiusClientPanel server={radius.running ? radius.config : null} />
      </div>
    </div>
  )
}
