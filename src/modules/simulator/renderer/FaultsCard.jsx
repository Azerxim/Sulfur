import { useEffect, useRef, useState } from 'react'
import { Plus, Power, PowerOff, Trash2 } from 'lucide-react'
import { Button, Card, CommitInput, Input, Select } from '@renderer/components/ui'
import { FAULT_TYPES } from '@shared/points'
import { FAULT_SCOPES } from '../shared/constants'
import { simulatorApi } from './api'
import { PointsPicker } from './PointPickers'
import { t } from '../shared/i18n'

/** Délai avant de réappliquer un défaut actif modifié. */
const LIVE_DEBOUNCE = 300

/** Réglages par défaut d'un type de défaut. */
function defaultParams(type, spec) {
  if (type === 'delay') return { ms: 500 }
  if (type === 'exception') return { code: spec?.codes?.[0]?.value ?? 4, scope: 'all' }
  if (type === 'badStatus') return { code: spec?.codes?.[0]?.value ?? 'BadSensorFailure' }
  if (type === 'kissOfDeath') return { code: spec?.codes?.[0]?.value ?? 'DENY' }
  return {}
}

/** Réglages propres au type de défaut. */
function FaultSettings({ fault, spec, points, onChange }) {
  const params = fault.params ?? {}
  const set = (patch) => onChange({ params: { ...params, ...patch } })
  const codes = spec?.codes ?? []
  const codeSelect = (
    <Select
      value={params.code ?? ''}
      title={t('simulator.faults.code')}
      onChange={(e) => {
        const option = codes.find((c) => String(c.value) === e.target.value)
        set({ code: option ? option.value : e.target.value })
      }}
    >
      {codes.map((c) => (
        <option key={c.value} value={c.value}>
          {c.label}
        </option>
      ))}
    </Select>
  )
  const picker = (
    <PointsPicker
      points={points}
      value={fault.points ?? []}
      idOf={(p) => p.id}
      emptyLabel={t('simulator.faults.allPoints')}
      onChange={(list) => onChange({ points: list })}
    />
  )

  switch (fault.type) {
    case 'delay':
      return (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            className="w-28"
            value={params.ms ?? 0}
            onChange={(e) => set({ ms: Number(e.target.value) })}
          />
          <span className="text-xs text-slate-500">ms</span>
        </div>
      )
    case 'exception':
      return (
        <div className="grid grid-cols-2 gap-2">
          {codeSelect}
          <Select value={params.scope ?? 'all'} onChange={(e) => set({ scope: e.target.value })}>
            {FAULT_SCOPES.map((scope) => (
              <option key={scope} value={scope}>
                {t(`simulator.faults.scopes.${scope}`)}
              </option>
            ))}
          </Select>
        </div>
      )
    case 'badStatus':
      return (
        <div className="grid grid-cols-2 gap-2">
          {codeSelect}
          {picker}
        </div>
      )
    case 'kissOfDeath':
      return codeSelect
    case 'freeze':
      // Défaut sans points (ex. horloge NTP figée) : rien à choisir.
      return spec && !spec.points ? (
        <span className="text-xs text-slate-500">{t(`simulator.faults.typeHints.${fault.type}`)}</span>
      ) : (
        picker
      )
    default:
      return <span className="text-xs text-slate-500">{t(`simulator.faults.typeHints.${fault.type}`)}</span>
  }
}

/** Défauts injectables dans les serveurs des autres modules, activés à la main ou par un flux. */
export default function FaultsCard({ faults, onChange, targets, status, onError }) {
  const [now, setNow] = useState(Date.now())
  const timers = useRef({})
  const active = Object.fromEntries(status.faults.map((f) => [f.id, f]))

  // Compte à rebours des défauts à durée limitée.
  const counting = status.faults.some((f) => f.until)
  useEffect(() => {
    if (!counting) return
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [counting])

  const call = (action) => action().catch((err) => onError(err.message))

  function update(id, patch) {
    const next = { ...faults.find((f) => f.id === id), ...patch }
    onChange(faults.map((f) => (f.id === id ? next : f)))
    // Un défaut actif modifié est réappliqué.
    if (active[id]) {
      clearTimeout(timers.current[id])
      timers.current[id] = setTimeout(() => call(() => simulatorApi.activateFault(next)), LIVE_DEBOUNCE)
    }
  }

  function add() {
    const target = targets[0]
    const type = target?.faultTypes[0]?.type ?? 'delay'
    let n = faults.length + 1
    while (faults.some((f) => f.name === t('simulator.faults.newName', { n }))) n++
    onChange([
      ...faults,
      {
        id: crypto.randomUUID(),
        name: t('simulator.faults.newName', { n }),
        module: target?.id ?? 'opcua',
        type,
        params: defaultParams(type, target?.faultTypes[0]),
        points: [],
        duration: 0
      }
    ])
  }

  function remove(id) {
    clearTimeout(timers.current[id])
    if (active[id]) call(() => simulatorApi.deactivateFault(id))
    onChange(faults.filter((f) => f.id !== id))
  }

  return (
    <Card
      id="simulator.faults"
      title={t('simulator.faults.title', { count: faults.length })}
      fill
      actions={
        <>
          {status.faults.length > 0 && (
            <Button variant="danger" size="sm" onClick={() => call(simulatorApi.clearFaults)}>
              <PowerOff className="size-3.5" /> {t('simulator.faults.clearAll')}
            </Button>
          )}
          <Button size="sm" onClick={add}>
            <Plus className="size-3.5" /> {t('ui.add')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <p className="text-xs text-slate-500">{t('simulator.faults.hint')}</p>
        {faults.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="w-44 px-1.5 pb-2 font-medium">{t('ui.name')}</th>
                <th className="w-36 px-1.5 pb-2 font-medium">{t('simulator.faults.module')}</th>
                <th className="w-52 px-1.5 pb-2 font-medium">{t('simulator.faults.type')}</th>
                <th className="px-1.5 pb-2 font-medium">{t('simulator.faults.settings')}</th>
                <th className="w-24 px-1.5 pb-2 font-medium">{t('simulator.faults.duration')}</th>
                <th className="w-28 px-1.5 pb-2 font-medium">{t('simulator.faults.state')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {faults.map((f) => {
                const target = targets.find((m) => m.id === f.module)
                const types = target?.faultTypes ?? []
                const spec = types.find((x) => x.type === f.type)
                const serverPoints = (target?.points ?? [])
                  .filter((p) => p.group === 'server')
                  .map((p) => ({ ...p, moduleName: target.name }))
                const state = active[f.id]
                return (
                  <tr key={f.id} className="align-middle">
                    <td className="p-1.5">
                      <CommitInput value={f.name} onCommit={(name) => update(f.id, { name })} />
                    </td>
                    <td className="p-1.5">
                      <Select
                        value={f.module}
                        disabled={!!state}
                        onChange={(e) => {
                          const next = targets.find((m) => m.id === e.target.value)
                          const keep = next?.faultTypes.find((x) => x.type === f.type)
                          const type = keep ? f.type : (next?.faultTypes[0]?.type ?? f.type)
                          update(f.id, {
                            module: e.target.value,
                            type,
                            params: keep ? f.params : defaultParams(type, next?.faultTypes[0]),
                            points: []
                          })
                        }}
                      >
                        {targets.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                        {!target && <option value={f.module}>{f.module}</option>}
                      </Select>
                    </td>
                    <td className="p-1.5">
                      <Select
                        value={f.type}
                        disabled={!!state}
                        title={t(`simulator.faults.typeHints.${f.type}`)}
                        onChange={(e) =>
                          update(f.id, {
                            type: e.target.value,
                            params: defaultParams(
                              e.target.value,
                              types.find((x) => x.type === e.target.value)
                            ),
                            points: []
                          })
                        }
                      >
                        {FAULT_TYPES.filter((type) => types.some((x) => x.type === type) || type === f.type).map(
                          (type) => (
                            <option key={type} value={type}>
                              {t(`simulator.faults.types.${type}`)}
                            </option>
                          )
                        )}
                      </Select>
                    </td>
                    <td className="p-1.5">
                      <FaultSettings
                        fault={f}
                        spec={spec}
                        points={serverPoints}
                        onChange={(patch) => update(f.id, patch)}
                      />
                    </td>
                    <td className="p-1.5">
                      <Input
                        type="number"
                        min={0}
                        step={0.5}
                        value={f.duration ?? 0}
                        onChange={(e) => update(f.id, { duration: Number(e.target.value) })}
                      />
                    </td>
                    <td className="p-1.5 text-xs">
                      {state ? (
                        <span className="inline-flex items-center gap-1.5 text-red-300">
                          <span className="size-2 rounded-full bg-red-400 shadow-[0_0_8px] shadow-red-400/60" />
                          {state.until
                            ? t('simulator.faults.remaining', {
                                seconds: Math.max(0, Math.ceil((state.until - now) / 1000))
                              })
                            : t('simulator.faults.active')}
                        </span>
                      ) : (
                        <span className="text-slate-500">{t('simulator.faults.inactive')}</span>
                      )}
                    </td>
                    <td className="w-40 p-1.5 text-right whitespace-nowrap">
                      {state ? (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => call(() => simulatorApi.deactivateFault(f.id))}
                        >
                          <PowerOff className="size-3.5" /> {t('simulator.faults.deactivate')}
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={!spec}
                          onClick={() => call(() => simulatorApi.activateFault(f))}
                        >
                          <Power className="size-3.5" /> {t('simulator.faults.activate')}
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" title={t('ui.remove')} onClick={() => remove(f.id)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  )
}
