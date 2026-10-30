import { useEffect, useMemo, useState } from 'react'
import { ShieldAlert, Workflow } from 'lucide-react'
import { ErrorBanner, TabbedPage, usePersistentState, useStoredState } from '@azerxim/sulfur-sdk/ui'
import { pointKey } from '@azerxim/sulfur-sdk'
import { DEFAULT_FAULTS, DEFAULT_FLOWS } from '../shared/constants'
import { simulatorApi } from './api'
import FaultsCard from './FaultsCard'
import FlowsCard from './FlowsCard'
import { t } from '../shared/i18n'

/** Fréquence de rafraîchissement des modules et de leurs points (les surveillances des clients changent). */
const TARGETS_REFRESH = 3000

export default function SimulatorView() {
  const [faults, setFaults] = usePersistentState('simulator', 'faults', DEFAULT_FAULTS)
  const [flows, setFlows] = usePersistentState('simulator', 'flows', DEFAULT_FLOWS)
  const [targets, setTargets] = useState([])
  const [status, setStatus] = useState({ faults: [], recording: null })
  const [error, setError] = useState(null)
  const [tab, setTab] = useStoredState('sulfur:tab:simulator', 'flows', ['flows', 'faults'])

  useEffect(() => {
    const load = () => simulatorApi.targets().then(setTargets, () => {})
    load()
    const timer = setInterval(load, TARGETS_REFRESH)
    simulatorApi.status().then(setStatus)
    const off = simulatorApi.onStatus(setStatus)
    return () => {
      clearInterval(timer)
      off()
    }
  }, [])

  // Tous les points, désignés par leur clé `<module>/<id>`.
  const points = useMemo(
    () =>
      targets.flatMap((m) =>
        m.points.map((p) => ({ ...p, key: pointKey(m.id, p.id), module: m.id, moduleName: m.name }))
      ),
    [targets]
  )

  return (
    <TabbedPage
      value={tab}
      onChange={setTab}
      tabs={[
        { id: 'flows', label: t('simulator.flows.title', { count: flows.length }), icon: Workflow },
        {
          id: 'faults',
          label: t('simulator.faults.title', { count: faults.length }),
          icon: ShieldAlert,
          badge: status.faults?.length > 0 && <span className="size-1.5 rounded-full bg-amber-400" />
        }
      ]}
      // Flux : l'éditeur occupe toute la surface sous les onglets, sans marge.
      className={tab === 'flows' ? 'gap-0! overflow-auto p-0!' : 'overflow-auto'}
    >
      {error && (
        <div className={tab === 'flows' ? 'p-3 pb-0' : ''}>
          <ErrorBanner error={error} onClose={() => setError(null)} />
        </div>
      )}
      {tab === 'faults' ? (
        <FaultsCard faults={faults} onChange={setFaults} targets={targets} status={status} onError={setError} />
      ) : (
        <FlowsCard
          flows={flows}
          onChange={setFlows}
          faults={faults}
          points={points}
          status={status}
          onError={setError}
        />
      )}
    </TabbedPage>
  )
}
