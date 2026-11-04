import { faComputer, faServer } from '@fortawesome/free-solid-svg-icons'
import { InstancesPage, useInstanceStatuses } from '@azerxim/sulfur-sdk/ui'
import ServerPanel from './ServerPanel'
import ClientPanel from './ClientPanel'
import { t } from '../shared/i18n'

/** États au repos, avant la première lecture. */
const IDLE = {
  server: { running: false, endpoints: [], counts: [] },
  client: { repeating: false }
}

/** Page du module : un onglet par instance (aucune par défaut). */
export default function SyslogView() {
  const serverStatuses = useInstanceStatuses('syslog', 'server')
  const clientStatuses = useInstanceStatuses('syslog', 'client')
  const statuses = { ...serverStatuses, ...clientStatuses }
  // Premier serveur en marche : les clients proposent de s’y connecter.
  const localServer = Object.values(serverStatuses).find((s) => s.running) ?? null
  const roles = [
    { role: 'server', label: t('ui.server'), icon: faServer },
    { role: 'client', label: t('ui.client'), icon: faComputer }
  ]
  return (
    <InstancesPage moduleId="syslog" roles={roles} statuses={statuses}>
      {(instance) => {
        const status = statuses[instance.id] ?? IDLE[instance.role]
        switch (instance.role) {
          case 'server':
            return <ServerPanel instance={instance} status={status} />
          default:
            return <ClientPanel instance={instance} status={status} server={localServer?.config ?? null} />
        }
      }}
    </InstancesPage>
  )
}
