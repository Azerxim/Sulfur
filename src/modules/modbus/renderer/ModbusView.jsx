import { faComputer, faServer } from '@fortawesome/free-solid-svg-icons'
import { InstancesPage, useInstanceStatuses } from '@azerxim/sulfur-sdk/ui'
import ServerPanel from './ServerPanel'
import ClientPanel from './ClientPanel'
import { t } from '../shared/i18n'

const IDLE = { server: { running: false, connections: [] }, client: { connected: false, watches: [] } }

/** Page du module : un onglet par serveur ou client (aucun par défaut). */
export default function ModbusView() {
  const statuses = { ...useInstanceStatuses('modbus', 'server'), ...useInstanceStatuses('modbus', 'client') }
  const roles = [
    { role: 'server', label: t('ui.server'), icon: faServer },
    { role: 'client', label: t('ui.client'), icon: faComputer }
  ]
  return (
    <InstancesPage moduleId="modbus" roles={roles} statuses={statuses}>
      {(instance) => {
        const status = statuses[instance.id] ?? IDLE[instance.role]
        return instance.role === 'server' ? (
          <ServerPanel instance={instance} status={status} />
        ) : (
          <ClientPanel instance={instance} status={status} />
        )
      }}
    </InstancesPage>
  )
}
