import { faComputer, faGears, faMicrochip, faServer } from '@fortawesome/free-solid-svg-icons'
import { InstancesPage, useInstanceStatuses } from '@azerxim/sulfur-sdk/ui'
import ServerPanel from './ServerPanel'
import ClientPanel from './ClientPanel'
import Lwm2mServerPanel from './Lwm2mServerPanel'
import DevicePanel from './DevicePanel'
import { t } from '../shared/i18n'

/** États au repos, avant la première lecture. */
const IDLE = {
  server: { running: false },
  client: { connected: false },
  lwm2mServer: { running: false, registrations: [] },
  device: { running: false, state: 'stopped' }
}

/** Page du module : un onglet par instance (aucune par défaut). */
export default function CoapView() {
  const serverStatuses = useInstanceStatuses('coap', 'server')
  const clientStatuses = useInstanceStatuses('coap', 'client')
  const lwm2mServerStatuses = useInstanceStatuses('coap', 'lwm2mServer')
  const deviceStatuses = useInstanceStatuses('coap', 'device')
  const statuses = { ...serverStatuses, ...clientStatuses, ...lwm2mServerStatuses, ...deviceStatuses }
  // Premier serveur en marche : les clients proposent de s’y connecter.
  const localServer = Object.values(serverStatuses).find((s) => s.running) ?? null
  const localLwm2m = Object.values(lwm2mServerStatuses).find((s) => s.running) ?? null
  const roles = [
    { role: 'server', label: t('coap.tabs.server'), icon: faServer },
    { role: 'client', label: t('coap.tabs.client'), icon: faComputer },
    { role: 'lwm2mServer', label: t('coap.tabs.lwm2mServer'), icon: faGears },
    { role: 'device', label: t('coap.tabs.device'), icon: faMicrochip }
  ]
  return (
    <InstancesPage moduleId="coap" roles={roles} statuses={statuses}>
      {(instance) => {
        const status = statuses[instance.id] ?? IDLE[instance.role]
        switch (instance.role) {
          case 'server':
            return <ServerPanel instance={instance} status={status} />
          case 'client':
            return <ClientPanel instance={instance} status={status} server={localServer?.config ?? null} />
          case 'lwm2mServer':
            return <Lwm2mServerPanel instance={instance} status={status} />
          default:
            return <DevicePanel instance={instance} status={status} lwm2mServer={localLwm2m} />
        }
      }}
    </InstancesPage>
  )
}
