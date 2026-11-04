import { faComputer, faServer } from '@fortawesome/free-solid-svg-icons'
import { InstancesPage, useInstanceStatuses } from '@azerxim/sulfur-sdk/ui'
import ServerPanel from './ServerPanel'
import ClientPanel from './ClientPanel'
import { t } from '../shared/i18n'

/** États au repos, avant la première lecture. */
const IDLE = {
  server: { running: false },
  client: { connected: false, watches: [] }
}

/** Page du module : un onglet par instance (aucune par défaut). */
export default function S7View() {
  const serverStatuses = useInstanceStatuses('s7', 'server')
  const clientStatuses = useInstanceStatuses('s7', 'client')
  const statuses = { ...serverStatuses, ...clientStatuses }
  const roles = [
    { role: 'server', label: t('s7.tabs.server'), icon: faServer },
    { role: 'client', label: t('ui.client'), icon: faComputer }
  ]
  return (
    <InstancesPage moduleId="s7" roles={roles} statuses={statuses}>
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
