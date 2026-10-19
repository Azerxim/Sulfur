import { useEffect, useState } from 'react'
import { Eraser, Play, Plus, Power, PowerOff, Square, Trash2 } from 'lucide-react'
import { Button, Card, ErrorBanner, Field, Input, Select } from '@renderer/components/ui'
import { usePersistentState } from '@renderer/module-config'
import { DEFAULT_NEW_INSTANCE } from '../shared/constants'
import { plcsimApi } from './api'
import { t } from '../shared/i18n'

const STATE_STYLES = {
  Run: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  Stop: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  Off: 'border-ink-700 text-slate-500'
}

export function StateBadge({ state }) {
  return (
    <span
      className={`inline-flex h-6 items-center rounded border px-2 text-xs whitespace-nowrap ${
        STATE_STYLES[state] ?? 'border-sky-500/40 bg-sky-500/10 text-sky-300'
      }`}
    >
      {t(`plcsim.states.${state}`, null, state || '—')}
    </span>
  )
}

/** Opérations proposées selon l'état de l'instance. */
function operations(state) {
  if (state === 'Off') return ['powerOn', 'unregister']
  if (state === 'Run') return ['stop', 'powerOff']
  if (state === 'Stop') return ['run', 'memoryReset', 'powerOff']
  return ['powerOff']
}

const ICONS = { powerOn: Power, powerOff: PowerOff, run: Play, stop: Square, memoryReset: Eraser, unregister: Trash2 }
/** Opérations à confirmer par un second clic. */
const CONFIRM = ['memoryReset', 'unregister', 'powerOff']

/** Instances enregistrées dans PLCSim Advanced : création, mise sous tension, RUN / STOP, adresse IP. */
export default function InstancesCard({ status, selected, onSelect }) {
  const [draft, setDraft] = usePersistentState('plcsim', 'newInstance', DEFAULT_NEW_INSTANCE)
  const [ip, setIp] = useState({ interface: 0, ip: '', mask: '255.255.255.0', gateway: '' })
  const [pending, setPending] = useState({})
  const [armed, setArmed] = useState(null)
  const [error, setError] = useState(null)
  const [warning, setWarning] = useState(null)
  const connected = status.connected
  const instances = status.instances ?? []
  const cpuTypes = status.info?.cpuTypes ?? []

  // Formulaire d'adresse IP prérempli avec l'adresse de l'interface choisie (connue une fois l'instance
  // sous tension).
  const currentIp = selected?.ip?.[ip.interface]
  useEffect(() => {
    if (currentIp && currentIp !== '0.0.0.0') setIp((s) => ({ ...s, ip: currentIp }))
  }, [selected?.name, currentIp])

  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(null), 3000)
    return () => clearTimeout(timer)
  }, [armed])

  async function operate(name, operation) {
    const key = `${name}:${operation}`
    if (CONFIRM.includes(operation) && armed !== key) return setArmed(key)
    setArmed(null)
    setError(null)
    setWarning(null)
    setPending((p) => ({ ...p, [name]: operation }))
    try {
      const result = await plcsimApi.operate(name, operation)
      if (result?.warning) setWarning(result.warning)
    } catch (err) {
      setError(err.message)
    } finally {
      setPending((p) => ({ ...p, [name]: null }))
    }
  }

  async function run(action) {
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err.message)
    }
  }

  const create = () =>
    run(async () => {
      await plcsimApi.createInstance(draft)
      onSelect(draft.name.trim())
    })

  return (
    <Card id="plcsim.instances" title={t('plcsim.instances.title', { count: instances.length })} className="shrink-0">
      <div className="flex flex-col gap-4">
        {!connected ? (
          <p className="text-sm text-slate-500">{t('plcsim.instances.notConnected')}</p>
        ) : instances.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="pb-2 font-medium">{t('ui.name')}</th>
                  <th className="pb-2 font-medium">{t('plcsim.instances.cpu')}</th>
                  <th className="pb-2 font-medium">{t('ui.status')}</th>
                  <th className="pb-2 font-medium">{t('plcsim.instances.ip')}</th>
                  <th className="pb-2 text-right font-medium">{t('plcsim.instances.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {instances.map((inst) => {
                  const active = selected?.name === inst.name
                  const busy = pending[inst.name]
                  return (
                    <tr
                      key={inst.id}
                      onClick={() => onSelect(inst.name)}
                      className={`cursor-pointer border-t border-ink-800 ${active ? 'bg-ink-800/60' : 'hover:bg-ink-800/30'}`}
                    >
                      <td className="py-1.5 pr-3 pl-2">
                        <div className="font-medium text-slate-200">{inst.name}</div>
                        {inst.storagePath && (
                          <div className="max-w-72 truncate text-[11px] text-slate-500" title={inst.storagePath}>
                            {inst.storagePath}
                          </div>
                        )}
                      </td>
                      <td className="py-1.5 pr-3">
                        <div className="text-slate-300">{inst.cpuType || '—'}</div>
                        <div className="font-mono text-[11px] text-slate-500">{inst.articleNumber}</div>
                      </td>
                      <td className="py-1.5 pr-3">
                        <StateBadge state={busy ? null : inst.state} />
                        {busy && <span className="text-xs text-sky-300">{t(`plcsim.operations.${busy}`)}…</span>}
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-xs text-slate-400">
                        {(inst.ip ?? []).filter((a) => a && a !== '0.0.0.0').join(', ') || '—'}
                      </td>
                      <td className="py-1.5 pr-2 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex gap-1">
                          {operations(inst.state).map((op) => {
                            const Icon = ICONS[op]
                            const confirming = armed === `${inst.name}:${op}`
                            return (
                              <Button
                                key={op}
                                size="sm"
                                variant={confirming ? 'danger' : 'secondary'}
                                disabled={!!busy}
                                onClick={() => operate(inst.name, op)}
                              >
                                <Icon className="size-3.5" />
                                {confirming ? t('plcsim.instances.confirm') : t(`plcsim.operations.${op}`)}
                              </Button>
                            )
                          })}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">{t('plcsim.instances.none')}</p>
        )}

        <div className="grid grid-cols-[1.4fr_1fr_auto] items-end gap-3">
          <Field label={t('plcsim.instances.newName')}>
            <Input
              value={draft.name}
              disabled={!connected}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && connected && create()}
            />
          </Field>
          <Field label={t('plcsim.instances.cpuType')}>
            <Select
              value={draft.cpuType}
              disabled={!connected}
              onChange={(e) => setDraft((d) => ({ ...d, cpuType: e.target.value }))}
            >
              {(cpuTypes.length ? cpuTypes : [draft.cpuType]).map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
          </Field>
          <Button variant="primary" disabled={!connected || !draft.name.trim()} onClick={create}>
            <Plus className="size-4" /> {t('plcsim.instances.create')}
          </Button>
        </div>
        <p className="text-xs text-slate-500">{t('plcsim.instances.hint')}</p>

        {connected && selected && (
          <div className="flex flex-col gap-2 rounded-md border border-ink-800 p-3">
            <span className="text-xs font-medium text-slate-300">
              {t('plcsim.instances.ipTitle', { name: selected.name })}
            </span>
            <div className="grid grid-cols-[0.8fr_1fr_1fr_1fr_auto] items-end gap-3">
              <Field label={t('plcsim.instances.interface')}>
                <Select
                  value={ip.interface}
                  onChange={(e) => setIp((s) => ({ ...s, interface: Number(e.target.value) }))}
                >
                  {[0, 1, 2].map((i) => (
                    <option key={i} value={i}>
                      X{i + 1} (IE{i + 1})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('plcsim.instances.address')}>
                <Input
                  className="font-mono"
                  value={ip.ip}
                  placeholder="192.168.0.1"
                  onChange={(e) => setIp((s) => ({ ...s, ip: e.target.value }))}
                />
              </Field>
              <Field label={t('plcsim.instances.mask')}>
                <Input
                  className="font-mono"
                  value={ip.mask}
                  onChange={(e) => setIp((s) => ({ ...s, mask: e.target.value }))}
                />
              </Field>
              <Field label={t('plcsim.instances.gateway')}>
                <Input
                  className="font-mono"
                  value={ip.gateway}
                  placeholder="0.0.0.0"
                  onChange={(e) => setIp((s) => ({ ...s, gateway: e.target.value }))}
                />
              </Field>
              <Button
                disabled={!ip.ip.trim() || selected.state === 'Off'}
                title={selected.state === 'Off' ? t('plcsim.instances.ipNeedsPower') : undefined}
                onClick={() => run(() => plcsimApi.setIp(selected.name, ip))}
              >
                {t('plcsim.instances.applyIp')}
              </Button>
            </div>
          </div>
        )}
        {warning && <p className="text-xs text-amber-300">{warning}</p>}
        <ErrorBanner error={error} onClose={() => setError(null)} />
      </div>
    </Card>
  )
}
