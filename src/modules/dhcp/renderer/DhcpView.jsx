import { useCallback, useEffect, useState } from 'react'
import { faComputer, faServer } from '@fortawesome/free-solid-svg-icons'
import { InstancesPage, useInstanceStatuses } from '@azerxim/sulfur-sdk/ui'
import { dhcpApi } from './api'
import ServerPanel from './ServerPanel'
import ClientPanel from './ClientPanel'
import { t } from '../shared/i18n'

/** États au repos, avant la première lecture. */
const IDLE = {
  server: { running: false },
  client: {}
}

/** Page du module : un onglet par instance (aucune par défaut). */
export default function DhcpView() {
  const serverStatuses = useInstanceStatuses('dhcp', 'server')
  const clientStatuses = useInstanceStatuses('dhcp', 'client')
  const statuses = { ...serverStatuses, ...clientStatuses }
  // Interfaces réseau du PC, partagées par les serveurs et les clients.
  const [network, setNetwork] = useState({ interfaces: [], networks: [] })
  const reload = useCallback(() => {
    dhcpApi
      .interfaces()
      .then(setNetwork)
      .catch(() => {})
  }, [])
  useEffect(() => reload(), [reload])

  const roles = [
    { role: 'server', label: t('ui.server'), icon: faServer },
    { role: 'client', label: t('ui.client'), icon: faComputer }
  ]
  return (
    <InstancesPage moduleId="dhcp" roles={roles} statuses={statuses}>
      {(instance) => {
        const status = statuses[instance.id] ?? IDLE[instance.role]
        switch (instance.role) {
          case 'server':
            return <ServerPanel instance={instance} status={status} network={network} onReload={reload} />
          default:
            return <ClientPanel instance={instance} status={status} network={network} onReload={reload} />
        }
      }}
    </InstancesPage>
  )
}
