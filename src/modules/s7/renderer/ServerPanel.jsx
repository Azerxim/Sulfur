import { useEffect, useRef, useState } from 'react'
import { Play, Plus, Power, PowerOff, Square, Trash2 } from 'lucide-react'
import {
  Button,
  Card,
  Checkbox,
  CommitInput,
  ErrorBanner,
  Field,
  Input,
  Select,
  StatusDot
} from '@renderer/components/ui'
import {
  DATA_TYPES,
  DEFAULT_IDENTITY,
  DEFAULT_SERVER_CONFIG,
  DEFAULT_STRING_LENGTH,
  PDU_SIZES,
  SIMULATIONS
} from '../shared/constants'
import { defaultType, parseAddress } from '../shared/address'
import { isNumericType } from '../shared/codec'
import { MAX_AREA_SIZE, validateMemory, validatePoint } from '../shared/memory'
import { usePersistentState } from '@renderer/module-config'
import { s7Api } from './api'
import { formatValue } from './format'
import MemoryExplorer from './MemoryExplorer'
import ServerActivity from './ServerActivity'
import { t } from '../shared/i18n'

/** Délai avant d'envoyer au serveur un point modifié pendant qu'il tourne. */
const LIVE_DEBOUNCE = 400

const IDENTITY_FIELDS = ['orderCode', 'moduleName', 'moduleType', 'serialNumber', 'plantId', 'copyright', 'version']

/** Nouveau point : nom libre, premier double mot libre du DB1 (ou des mémentos). */
function newPoint(points, dbs) {
  const names = new Set(points.map((p) => p.name))
  let i = points.length + 1
  while (names.has(`Point${i}`)) i++
  const db = dbs[0]?.number
  const prefix = db ? `DB${db}.DBD` : 'MD'
  const used = points
    .map((p) => {
      try {
        const a = parseAddress(p.address)
        return (db ? a.area === 'DB' && a.db === db : a.area === 'M') ? a.offset + 4 : 0
      } catch {
        return 0
      }
    })
    .reduce((max, end) => Math.max(max, end), 0)
  return {
    id: crypto.randomUUID(),
    name: `Point${i}`,
    address: `${prefix}${Math.ceil(used / 2) * 2}`,
    dataType: 'Real',
    initialValue: 0,
    simulation: 'none',
    period: 1000,
    min: 0,
    max: 100
  }
}

/** Problème de configuration d'un point (message), ou null. */
function pointProblem(point, shape) {
  if (!shape) return null
  try {
    validatePoint(point, shape)
    return null
  } catch (err) {
    return err.message
  }
}

function LiveValue({ point, value, onSet }) {
  if (point.dataType === 'Bool') {
    return (
      <button
        onClick={() => onSet(!value)}
        title={t('ui.toggle')}
        className={`h-9 w-full rounded-md border font-mono text-sm transition-colors ${
          value
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
            : 'border-ink-700 bg-ink-950 text-slate-400'
        }`}
      >
        {formatValue(value)}
      </button>
    )
  }
  return <CommitInput className="font-mono text-sulfur-300" value={formatValue(value)} onCommit={onSet} />
}

export default function ServerPanel({ status }) {
  const [config, setConfig] = usePersistentState('s7', 'server', status.config ?? DEFAULT_SERVER_CONFIG)
  const [values, setValues] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const timers = useRef({})
  const running = status.running

  // L'automate est la source de vérité quand il tourne : on reprend sa configuration au démarrage.
  useEffect(() => {
    if (running && status.config) setConfig(status.config)
    if (!running) setValues({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  useEffect(() => {
    s7Api.server.values().then(setValues)
    return s7Api.server.onValues(setValues)
  }, [])

  async function run(action) {
    setBusy(true)
    setError(null)
    try {
      return await action()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const live = (action) => action().catch((err) => setError(err.message))
  const update = (patch) => setConfig((c) => ({ ...c, ...patch }))

  let shape = null
  let memoryError = null
  try {
    shape = validateMemory(config)
  } catch (err) {
    memoryError = err.message
  }
  const problems = config.points.map((p) => pointProblem(p, shape))
  const firstProblem = memoryError ?? problems.find(Boolean)

  /** Modifie un point ; en marche, il est renvoyé à l'automate après un court délai. */
  function updatePoint(id, patch) {
    let next
    setConfig((c) => ({
      ...c,
      points: c.points.map((p) => {
        if (p.id !== id) return p
        next = { ...p, ...patch }
        return next
      })
    }))
    if (!running) return
    clearTimeout(timers.current[id])
    timers.current[id] = setTimeout(() => {
      if (next && !pointProblem(next, shape)) live(() => s7Api.server.upsertPoint(next))
    }, LIVE_DEBOUNCE)
  }

  function addPoint() {
    const point = newPoint(config.points, config.dbs)
    update({ points: [...config.points, point] })
    if (running && !pointProblem(point, shape)) live(() => s7Api.server.upsertPoint(point))
  }

  function removePoint(id) {
    update({ points: config.points.filter((p) => p.id !== id) })
    if (running) live(() => s7Api.server.removePoint(id))
  }

  /** Adresse saisie : le type suit la taille indiquée (DBX → Bool, DBW → Int…) s'il ne lui correspond plus. */
  function changeAddress(point, address) {
    const patch = { address }
    try {
      const parsed = parseAddress(address)
      const isBit = parsed.size === 'X'
      if (isBit !== (point.dataType === 'Bool')) patch.dataType = defaultType(parsed.size)
    } catch {
      // adresse en cours de saisie
    }
    updatePoint(point.id, patch)
  }

  const updateDb = (index, patch) =>
    update({ dbs: config.dbs.map((db, i) => (i === index ? { ...db, ...patch } : db)) })
  const addDb = () => {
    const used = new Set(config.dbs.map((db) => Number(db.number)))
    let number = 1
    while (used.has(number)) number++
    update({ dbs: [...config.dbs, { number, size: 256, name: '' }] })
  }

  const cpuState = status.cpuState
  const identity = { ...DEFAULT_IDENTITY, ...config.identity }

  return (
    <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-2">
      <Card
        id="s7.server.config"
        title={t('s7.server.title')}
        className="shrink-0"
        actions={
          <StatusDot
            on={running}
            label={running ? t('s7.server.running', { count: status.connections?.length ?? 0 }) : t('ui.stopped')}
          />
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] items-end gap-3">
            <Field label={t('s7.server.host')}>
              <Input
                className="font-mono"
                value={config.host}
                disabled={running || busy}
                onChange={(e) => update({ host: e.target.value })}
              />
            </Field>
            <Field label={t('s7.server.port')}>
              <Input
                type="number"
                value={config.port}
                disabled={running || busy}
                onChange={(e) => update({ port: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('s7.server.pduSize')}>
              <Select
                value={config.pduSize}
                disabled={running || busy}
                onChange={(e) => update({ pduSize: Number(e.target.value) })}
              >
                {PDU_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {t(`s7.pduSizes.${size}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('ui.simulationRate')}>
              <CommitInput
                type="number"
                min={10}
                value={config.updateRate}
                onCommit={(raw) => {
                  update({ updateRate: Number(raw) })
                  if (running) live(() => s7Api.server.setUpdateRate(Number(raw)))
                }}
              />
            </Field>
            {running ? (
              <Button variant="danger" disabled={busy} onClick={() => run(s7Api.server.stop)}>
                <Square className="size-4" /> {t('ui.stop')}
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled={busy || !!firstProblem}
                title={firstProblem ?? undefined}
                onClick={() => run(() => s7Api.server.start(config))}
              >
                <Play className="size-4" /> {busy ? t('ui.starting') : t('ui.start')}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Checkbox
              label={t('s7.server.readOnly')}
              checked={!!config.readOnly}
              onChange={(e) => {
                update({ readOnly: e.target.checked })
                if (running) live(() => s7Api.server.setReadOnly(e.target.checked))
              }}
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">{t('s7.cpu.state')}</span>
              <CpuBadge state={running ? cpuState : null} />
              <Button
                size="sm"
                disabled={!running || cpuState === 'run'}
                onClick={() => live(() => s7Api.server.setCpuState('run'))}
              >
                <Power className="size-3.5" /> RUN
              </Button>
              <Button
                size="sm"
                disabled={!running || cpuState === 'stop'}
                onClick={() => live(() => s7Api.server.setCpuState('stop'))}
              >
                <PowerOff className="size-3.5" /> STOP
              </Button>
            </div>
          </div>
          <p className="text-xs text-slate-500">{t('s7.server.hint')}</p>
          {!running && firstProblem && (
            <p className="text-xs text-amber-300">{t('ui.incomplete', { problems: firstProblem })}</p>
          )}
          <ErrorBanner error={error} onClose={() => setError(null)} />
        </div>
      </Card>

      <Card id="s7.server.memory" title={t('s7.server.memory')} className="shrink-0">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3">
            {['I', 'Q', 'M'].map((area) => (
              <Field key={area} label={t(`s7.areas.${area}`)}>
                <Input
                  type="number"
                  min={1}
                  max={MAX_AREA_SIZE}
                  value={config.sizes[area]}
                  disabled={running}
                  onChange={(e) => update({ sizes: { ...config.sizes, [area]: Number(e.target.value) } })}
                />
              </Field>
            ))}
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="w-32 pb-2 font-medium">{t('s7.server.dbNumber')}</th>
                <th className="pb-2 font-medium">{t('ui.name')}</th>
                <th className="w-40 pb-2 font-medium">{t('s7.server.dbSize')}</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {config.dbs.map((db, i) => (
                <tr key={i} className="border-t border-ink-800">
                  <td className="py-1.5 pr-3">
                    <Input
                      type="number"
                      min={1}
                      max={65535}
                      className="font-mono"
                      value={db.number}
                      disabled={running}
                      onChange={(e) => updateDb(i, { number: Number(e.target.value) })}
                    />
                  </td>
                  <td className="py-1.5 pr-3">
                    <Input
                      value={db.name ?? ''}
                      placeholder={t('s7.server.dbNamePlaceholder')}
                      disabled={running}
                      onChange={(e) => updateDb(i, { name: e.target.value })}
                    />
                  </td>
                  <td className="py-1.5 pr-3">
                    <Input
                      type="number"
                      min={1}
                      max={MAX_AREA_SIZE}
                      value={db.size}
                      disabled={running}
                      onChange={(e) => updateDb(i, { size: Number(e.target.value) })}
                    />
                  </td>
                  <td className="py-1.5 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      title={t('ui.remove')}
                      disabled={running}
                      onClick={() => update({ dbs: config.dbs.filter((_, j) => j !== i) })}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between">
            <Button size="sm" disabled={running} onClick={addDb}>
              <Plus className="size-3.5" /> {t('s7.server.addDb')}
            </Button>
            {running && <span className="text-xs text-slate-500">{t('ui.lockedWhileRunning')}</span>}
          </div>
        </div>
      </Card>

      <Card id="s7.server.identity" title={t('s7.server.identity')} className="shrink-0" defaultCollapsed>
        <div className="flex flex-col gap-3">
          <p className="text-xs text-slate-500">{t('s7.server.identityHint')}</p>
          <div className="grid grid-cols-2 gap-3">
            {IDENTITY_FIELDS.map((key) => (
              <Field key={key} label={t(`s7.identity.${key}`)}>
                <Input
                  className="font-mono"
                  value={identity[key] ?? ''}
                  disabled={running}
                  onChange={(e) => update({ identity: { ...identity, [key]: e.target.value } })}
                />
              </Field>
            ))}
          </div>
        </div>
      </Card>

      <Card
        id="s7.server.points"
        title={t('s7.server.points', { count: config.points.length })}
        className="shrink-0"
        actions={
          <Button size="sm" onClick={addPoint}>
            <Plus className="size-3.5" /> {t('ui.add')}
          </Button>
        }
      >
        {config.points.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="pb-2 font-medium">{t('ui.name')}</th>
                  <th className="pb-2 font-medium">{t('s7.address')}</th>
                  <th className="pb-2 font-medium">{t('ui.type')}</th>
                  <th className="pb-2 font-medium">{running ? t('ui.currentValue') : t('ui.initialValue')}</th>
                  <th className="pb-2 font-medium">{t('ui.simulation')}</th>
                  <th className="pb-2 font-medium">{t('ui.periodMs')}</th>
                  <th className="pb-2 font-medium">{t('ui.min')}</th>
                  <th className="pb-2 font-medium">{t('ui.max')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {config.points.map((p, i) => {
                  const problem = problems[i]
                  const simulated = p.simulation && p.simulation !== 'none'
                  return (
                    <tr key={p.id} className="border-t border-ink-800 align-top">
                      <td className="py-1.5 pr-2">
                        <Input
                          className="min-w-28"
                          value={p.name}
                          onChange={(e) => updatePoint(p.id, { name: e.target.value })}
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <Input
                          className={`min-w-32 font-mono ${problem ? 'border-amber-500/60!' : ''}`}
                          value={p.address}
                          title={problem ?? undefined}
                          onChange={(e) => changeAddress(p, e.target.value)}
                        />
                        {problem && <p className="mt-1 max-w-56 text-[11px] text-amber-300">{problem}</p>}
                      </td>
                      <td className="py-1.5 pr-2">
                        <div className="flex gap-1">
                          <Select
                            className="min-w-24"
                            value={p.dataType}
                            onChange={(e) => updatePoint(p.id, { dataType: e.target.value })}
                          >
                            {Object.keys(DATA_TYPES).map((type) => (
                              <option key={type} value={type}>
                                {type}
                              </option>
                            ))}
                          </Select>
                          {p.dataType === 'String' && (
                            <Input
                              type="number"
                              min={1}
                              max={254}
                              className="w-20"
                              title={t('s7.stringLength')}
                              value={p.length ?? DEFAULT_STRING_LENGTH}
                              onChange={(e) => updatePoint(p.id, { length: Number(e.target.value) })}
                            />
                          )}
                        </div>
                      </td>
                      <td className="w-36 py-1.5 pr-2">
                        {running ? (
                          <LiveValue
                            point={p}
                            value={values[p.id]}
                            onSet={(v) => live(() => s7Api.server.setValue(p.id, v))}
                          />
                        ) : (
                          <Input
                            className="font-mono"
                            value={String(p.initialValue ?? '')}
                            onChange={(e) => updatePoint(p.id, { initialValue: e.target.value })}
                          />
                        )}
                      </td>
                      <td className="py-1.5 pr-2">
                        <Select
                          className="min-w-28"
                          value={p.simulation ?? 'none'}
                          disabled={!isNumericType(p.dataType)}
                          onChange={(e) => updatePoint(p.id, { simulation: e.target.value })}
                        >
                          {SIMULATIONS.map((s) => (
                            <option key={s} value={s}>
                              {t(`simulations.${s}`)}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="w-24 py-1.5 pr-2">
                        <Input
                          type="number"
                          value={p.period}
                          disabled={!simulated}
                          onChange={(e) => updatePoint(p.id, { period: Number(e.target.value) })}
                        />
                      </td>
                      <td className="w-24 py-1.5 pr-2">
                        <Input
                          type="number"
                          value={p.min}
                          disabled={!simulated || p.dataType === 'Bool'}
                          onChange={(e) => updatePoint(p.id, { min: Number(e.target.value) })}
                        />
                      </td>
                      <td className="w-24 py-1.5 pr-2">
                        <Input
                          type="number"
                          value={p.max}
                          disabled={!simulated || p.dataType === 'Bool'}
                          onChange={(e) => updatePoint(p.id, { max: Number(e.target.value) })}
                        />
                      </td>
                      <td className="py-1.5 text-right">
                        <Button variant="ghost" size="icon" title={t('ui.remove')} onClick={() => removePoint(p.id)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">{t('s7.server.noPoint')}</p>
        )}
        {running && <p className="mt-2 text-xs text-slate-500">{t('ui.liveApplied')}</p>}
      </Card>

      <MemoryExplorer running={running} config={status.config ?? config} values={values} />
      <ServerActivity status={status} />
    </div>
  )
}

/** État de la CPU : RUN (vert), STOP (orange) ou inconnu. */
export function CpuBadge({ state }) {
  const styles = {
    run: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    stop: 'border-amber-500/40 bg-amber-500/10 text-amber-300'
  }
  return (
    <span
      className={`inline-flex h-6 items-center rounded border px-2 font-mono text-xs ${
        styles[state] ?? 'border-ink-700 text-slate-500'
      }`}
    >
      {state ? t(`s7.cpu.states.${state}`, null, state.toUpperCase()) : '—'}
    </span>
  )
}
