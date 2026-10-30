import { useEffect, useState } from 'react'
import { Cpu, MonitorSmartphone, Server, ServerCog } from 'lucide-react'
import { TabbedPage, useStoredState } from '@azerxim/sulfur-sdk/ui'
import { coapApi } from './api'
import ServerPanel from './ServerPanel'
import ClientPanel from './ClientPanel'
import Lwm2mServerPanel from './Lwm2mServerPanel'
import DevicePanel from './DevicePanel'
import { t } from '../shared/i18n'

const TABS = ['server', 'client', 'lwm2mServer', 'device']

const dot = (on) => <span className={`size-1.5 rounded-full ${on ? 'bg-emerald-400' : 'bg-slate-600'}`} />

/** CoAP / LwM2M : serveur et client CoAP, serveur LwM2M et appareil LwM2M simulé. */
export default function CoapView() {
  const [tab, setTab] = useStoredState('sulfur:tab:coap', 'server', TABS)
  const [server, setServer] = useState({ running: false })
  const [client, setClient] = useState({ connected: false, observations: [] })
  const [lwm2mServer, setLwm2mServer] = useState({ running: false, registrations: [] })
  const [device, setDevice] = useState({ running: false, state: 'stopped' })

  useEffect(() => {
    coapApi.server.status().then(setServer)
    coapApi.client.status().then(setClient)
    coapApi.lwm2mServer.status().then(setLwm2mServer)
    coapApi.device.status().then(setDevice)
    const offs = [
      coapApi.server.onStatus(setServer),
      coapApi.client.onStatus(setClient),
      coapApi.lwm2mServer.onStatus(setLwm2mServer),
      coapApi.device.onStatus(setDevice)
    ]
    return () => offs.forEach((off) => off())
  }, [])

  return (
    <TabbedPage
      value={tab}
      onChange={setTab}
      tabs={[
        { id: 'server', label: t('coap.tabs.server'), icon: Server, badge: dot(server.running) },
        { id: 'client', label: t('coap.tabs.client'), icon: MonitorSmartphone, badge: dot(client.connected) },
        { id: 'lwm2mServer', label: t('coap.tabs.lwm2mServer'), icon: ServerCog, badge: dot(lwm2mServer.running) },
        { id: 'device', label: t('coap.tabs.device'), icon: Cpu, badge: dot(device.state === 'registered') }
      ]}
    >
      {/* Les panneaux restent montés pour conserver leur état local. */}
      <div className={tab === 'server' ? 'contents' : 'hidden'}>
        <ServerPanel status={server} />
      </div>
      <div className={tab === 'client' ? 'contents' : 'hidden'}>
        <ClientPanel status={client} server={server.running ? server.config : null} />
      </div>
      <div className={tab === 'lwm2mServer' ? 'contents' : 'hidden'}>
        <Lwm2mServerPanel status={lwm2mServer} />
      </div>
      <div className={tab === 'device' ? 'contents' : 'hidden'}>
        <DevicePanel status={device} lwm2mServer={lwm2mServer} />
      </div>
    </TabbedPage>
  )
}
