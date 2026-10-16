import { useEffect, useState } from 'react'
import { MonitorX } from 'lucide-react'
import { Card } from '@renderer/components/ui'
import { usePersistentState } from '@renderer/module-config'
import { plcsimApi } from './api'
import ConnectionCard from './ConnectionCard'
import InstancesCard from './InstancesCard'
import VariablesCard from './VariablesCard'
import WatchesCard from './WatchesCard'
import { t } from '../shared/i18n'

const INITIAL_STATUS = { supported: true, connected: false, instances: [], watches: [] }

export default function PlcsimView() {
  const [status, setStatus] = useState(INITIAL_STATUS)
  const [ui, setUi] = usePersistentState('plcsim', 'ui', { selected: '' })

  useEffect(() => {
    plcsimApi.status().then(setStatus)
    return plcsimApi.onStatus(setStatus)
  }, [])

  const instances = status.instances ?? []
  const selected = instances.find((i) => i.name === ui.selected) ?? instances[0] ?? null
  const select = (name) => setUi((u) => ({ ...u, selected: name }))

  if (!status.supported) {
    return (
      <div className="flex h-full flex-col gap-4 p-6">
        <Card title={t('plcsim.name')} collapsible={false}>
          <p className="flex items-center gap-2 text-sm text-slate-400">
            <MonitorX className="size-4 text-amber-300" /> {t('plcsim.windowsOnly')}
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-2">
        <ConnectionCard status={status} />
        <InstancesCard status={status} selected={selected} onSelect={select} />
        <VariablesCard status={status} instance={selected} />
        <WatchesCard status={status} />
      </div>
    </div>
  )
}
