import { useEffect, useState } from 'react'
import { usePersistentState } from '@azerxim/sulfur-sdk/ui'
import { DEFAULT_RULES } from '../shared/constants'
import { proxyApi } from './api'
import RulesCard from './RulesCard'
import TrafficLog from './TrafficLog'

/** Proxy TCP / UDP : redirections (adresses, défauts, connexions) et journal du trafic. */
export default function ProxyView() {
  const [rules, setRules] = usePersistentState('proxy', 'rules', DEFAULT_RULES)
  const [status, setStatus] = useState({ running: false, rules: null, simulatorFaults: [] })

  useEffect(() => {
    proxyApi.status().then(setStatus)
    return proxyApi.onStatus(setStatus)
  }, [])

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-4">
      <RulesCard status={status} rules={rules} setRules={setRules} />
      <TrafficLog rules={rules} />
    </div>
  )
}
