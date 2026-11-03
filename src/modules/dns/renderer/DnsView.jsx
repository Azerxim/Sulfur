import { faMagnifyingGlass, faServer } from '@fortawesome/free-solid-svg-icons'
import { InstancesPage, useInstanceStatuses } from '@azerxim/sulfur-sdk/ui'
import ServerPanel from './ServerPanel'
import ClientPanel from './ClientPanel'
import { t } from '../shared/i18n'

/** États au repos, avant la première lecture. */
const IDLE = {
  server: { running: false },
  client: {}
}

/** Page du module : un onglet par instance (aucune par défaut). */
export default function DnsView() {
  const serverStatuses = useInstanceStatuses('dns', 'server')
  const clientStatuses = useInstanceStatuses('dns', 'client')
  const statuses = { ...serverStatuses, ...clientStatuses }
  const roles = [
    { role: 'server', label: t('ui.server'), icon: faServer },
    { role: 'client', label: t('ui.client'), icon: faMagnifyingGlass }
  ]
  return (
    <InstancesPage moduleId="dns" roles={roles} statuses={statuses}>
      {(instance) => {
        const status = statuses[instance.id] ?? IDLE[instance.role]
        switch (instance.role) {
          case 'server':
            return <ServerPanel instance={instance} status={status} />
          default:
            return <ClientPanel instance={instance} status={status} />
        }
      }}
    </InstancesPage>
  )
}
