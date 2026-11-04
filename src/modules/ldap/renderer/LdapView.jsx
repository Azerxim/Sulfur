import { faComputer, faServer } from '@fortawesome/free-solid-svg-icons'
import { InstancesPage, useInstanceStatuses } from '@azerxim/sulfur-sdk/ui'
import ServerPanel from './ServerPanel'
import ClientPanel from './ClientPanel'
import RadiusServerPanel from './radius/ServerPanel'
import RadiusClientPanel from './radius/ClientPanel'
import { t } from '../shared/i18n'

/** États au repos, avant la première lecture. */
const IDLE = {
  server: { running: false },
  client: {},
  radiusServer: { running: false },
  radiusClient: {}
}

/** Page du module : un onglet par instance (aucune par défaut). */
export default function LdapView() {
  const serverStatuses = useInstanceStatuses('ldap', 'server')
  const clientStatuses = useInstanceStatuses('ldap', 'client')
  const radiusServerStatuses = useInstanceStatuses('ldap', 'radiusServer')
  const radiusClientStatuses = useInstanceStatuses('ldap', 'radiusClient')
  const statuses = { ...serverStatuses, ...clientStatuses, ...radiusServerStatuses, ...radiusClientStatuses }
  const roles = [
    { role: 'server', label: t('ldap.tabs.server'), icon: faServer },
    { role: 'client', label: t('ldap.tabs.client'), icon: faComputer },
    { role: 'radiusServer', label: t('ldap.tabs.radiusServer'), icon: faServer },
    { role: 'radiusClient', label: t('ldap.tabs.radiusClient'), icon: faComputer }
  ]
  return (
    <InstancesPage moduleId="ldap" roles={roles} statuses={statuses}>
      {(instance) => {
        const status = statuses[instance.id] ?? IDLE[instance.role]
        switch (instance.role) {
          case 'server':
            return <ServerPanel instance={instance} status={status} />
          case 'client':
            return <ClientPanel instance={instance} status={status} />
          case 'radiusServer':
            return <RadiusServerPanel instance={instance} status={status} />
          default:
            return <RadiusClientPanel instance={instance} status={status} />
        }
      }}
    </InstancesPage>
  )
}
