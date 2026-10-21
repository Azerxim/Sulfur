import { useEffect, useState } from 'react'
import { DEFAULT_RX_CONFIG } from '../shared/constants'
import { serialApi } from './api'
import PortCard from './PortCard'
import SendCard from './SendCard'
import GatewayCard from './GatewayCard'
import TrafficLog from './TrafficLog'

export default function SerialView() {
  const [status, setStatus] = useState({
    open: false,
    rx: DEFAULT_RX_CONFIG,
    outputs: {},
    signals: null,
    counters: {},
    repeating: null
  })
  const [gatewayStatus, setGatewayStatus] = useState({ running: false, clients: [] })

  useEffect(() => {
    serialApi.status().then(setStatus)
    serialApi.gateway.status().then(setGatewayStatus)
    const offs = [serialApi.onStatus(setStatus), serialApi.gateway.onStatus(setGatewayStatus)]
    return () => offs.forEach((off) => off())
  }, [])

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-6">
      <PortCard status={status} />
      <SendCard status={status} />
      <GatewayCard status={gatewayStatus} portOpen={status.open} />
      <TrafficLog />
    </div>
  )
}
