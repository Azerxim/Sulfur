import { useEffect, useRef, useState } from 'react'
import { BellRing, Copy, Play, Plus, Square, Trash2, X } from 'lucide-react'
import {
  Button,
  Card,
  Checkbox,
  CommitInput,
  ErrorBanner,
  Field,
  Input,
  Select,
  StatusDot,
  usePersistentState
} from '@azerxim/sulfur-sdk/ui'
import { formatTime } from '@azerxim/sulfur-sdk'
import {
  DEFAULT_AGENT_CONFIG,
  DEFAULT_USER,
  ENTERPRISE_OID,
  MAX_LOG,
  NUMERIC_TYPES,
  OBJECT_TYPES,
  SIMULATIONS,
  SYSTEM_OID,
  VERSIONS
} from '../shared/constants'
import { snmpApi } from './api'
import UserFields from './UserFields'
import { t } from '../shared/i18n'

/** Délai avant d'envoyer à l'agent les réglages modifiés pendant qu'il tourne. */
const LIVE_DEBOUNCE = 400

const OID_PATTERN = /^[0-2](\.\d+)+$/

const formatValue = (v) => (v === null || v === undefined ? '—' : String(v))

/** OID invalides, du groupe système ou qui se chevauchent. */
function badOids(objects) {
  const bad = new Set()
  const oids = objects.map((d) => String(d.oid).trim().replace(/^\./, ''))
  oids.forEach((oid, i) => {
    if (!OID_PATTERN.test(oid) || oid === SYSTEM_OID || oid.startsWith(`${SYSTEM_OID}.`)) bad.add(objects[i].id)
    oids.forEach((other, j) => {
      if (i !== j && (other === oid || other.startsWith(`${oid}.`) || oid.startsWith(`${other}.`)))
        bad.add(objects[i].id)
    })
  })
  return bad
}

function newObject(objects) {
  const used = new Set(objects.map((d) => d.oid))
  let i = objects.length + 1
  while (used.has(`${ENTERPRISE_OID}.1.${i}`)) i++
  return {
    id: crypto.randomUUID(),
    name: `object${i}`,
    oid: `${ENTERPRISE_OID}.1.${i}`,
    type: 'Integer',
    initialValue: 0,
    simulation: 'none',
    period: 1000,
    min: 0,
    max: 100,
    writable: true
  }
}

function UsersCard({ users, locked, onChange }) {
  const set = (i, patch) => onChange(users.map((u, j) => (j === i ? { ...u, ...patch } : u)))
  return (
    <Card
      id="snmp.agent.users"
      title={t('snmp.users.title', { count: users.length })}
      className="shrink-0"
      defaultCollapsed
      actions={
        <Button
          size="sm"
          disabled={locked}
          onClick={() => onChange([...users, { ...DEFAULT_USER, name: `user${users.length + 1}` }])}
        >
          <Plus className="size-3.5" /> {t('ui.add')}
        </Button>
      }
    >
      {users.length ? (
        <div className="flex flex-col gap-2">
          {users.map((u, i) => (
            <div key={i} className="grid grid-cols-[1fr_1.4fr_6rem_1fr_6rem_1fr_auto] gap-2">
              <UserFields user={u} disabled={locked} onChange={(patch) => set(i, patch)} />
              <Button
                variant="ghost"
                size="icon"
                disabled={locked}
                title={t('ui.remove')}
                onClick={() => onChange(users.filter((_, j) => j !== i))}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ))}
          <p className="text-xs text-slate-500">{t('snmp.users.keyHint')}</p>
        </div>
      ) : (
        <p className="text-sm text-slate-500">{t('snmp.users.none')}</p>
      )}
    </Card>
  )
}

function SystemCard({ system, locked, onChange }) {
  const fields = ['descr', 'objectId', 'contact', 'name', 'location']
  return (
    <Card id="snmp.agent.system" title={t('snmp.system.title')} className="shrink-0" defaultCollapsed>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          {fields.map((key) => (
            <Field key={key} label={t(`snmp.system.${key}`)} className={key === 'descr' ? 'col-span-2' : ''}>
              <Input
                className={key === 'objectId' ? 'font-mono' : ''}
                value={system[key] ?? ''}
                disabled={locked}
                onChange={(e) => onChange({ ...system, [key]: e.target.value })}
              />
            </Field>
          ))}
        </div>
        <p className="text-xs text-slate-500">{t('snmp.system.hint')}</p>
      </div>
    </Card>
  )
}

function TrapsCard({ traps, objects, users, status, running, onChange, onError }) {
  const [results, setResults] = useState(null)
  const [sending, setSending] = useState(false)
  const set = (patch) => onChange({ ...traps, ...patch })
  const setTarget = (id, patch) =>
    set({ targets: traps.targets.map((tg) => (tg.id === id ? { ...tg, ...patch } : tg)) })
  const selected = new Set(traps.objects ?? [])

  async function send() {
    setSending(true)
    try {
      setResults(await snmpApi.agent.sendTrap())
    } catch (err) {
      onError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <Card
      id="snmp.agent.traps"
      title={t('snmp.traps.title', { count: status.trapsSent ?? 0 })}
      className="shrink-0"
      actions={
        <Button size="sm" variant="primary" disabled={!running || sending} onClick={send}>
          <BellRing className="size-3.5" /> {t('snmp.traps.send')}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label={t('snmp.traps.oid')}>
          <Input className="font-mono" value={traps.oid} onChange={(e) => set({ oid: e.target.value })} />
        </Field>
        <div>
          <div className="mb-1.5 text-xs text-slate-400">{t('snmp.traps.objects')}</div>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {objects.map((d) => (
              <Checkbox
                key={d.id}
                label={d.name || d.oid}
                checked={selected.has(d.id)}
                onChange={(e) =>
                  set({ objects: e.target.checked ? [...selected, d.id] : [...selected].filter((id) => id !== d.id) })
                }
              />
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
            {t('snmp.traps.targets')}
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                set({
                  targets: [
                    ...traps.targets,
                    {
                      id: crypto.randomUUID(),
                      host: '127.0.0.1',
                      port: 1162,
                      version: 'v3',
                      community: 'public',
                      user: users[0]?.name ?? '',
                      inform: false
                    }
                  ]
                })
              }
            >
              <Plus className="size-3.5" /> {t('ui.add')}
            </Button>
          </div>
          {traps.targets.length ? (
            traps.targets.map((tg) => (
              <div key={tg.id} className="mb-2 grid grid-cols-[2fr_6rem_8rem_1fr_auto_auto] items-center gap-2">
                <Input
                  className="font-mono"
                  placeholder={t('snmp.traps.host')}
                  value={tg.host}
                  onChange={(e) => setTarget(tg.id, { host: e.target.value })}
                />
                <Input
                  type="number"
                  title={t('snmp.traps.port')}
                  value={tg.port}
                  onChange={(e) => setTarget(tg.id, { port: Number(e.target.value) })}
                />
                <Select
                  value={tg.version}
                  title={t('snmp.traps.version')}
                  onChange={(e) => setTarget(tg.id, { version: e.target.value })}
                >
                  {VERSIONS.map((v) => (
                    <option key={v} value={v}>
                      {t(`snmp.versions.${v}`)}
                    </option>
                  ))}
                </Select>
                {tg.version === 'v3' ? (
                  <Select
                    value={tg.user ?? ''}
                    title={t('snmp.traps.user')}
                    className={users.some((u) => u.name === tg.user) ? '' : 'border-red-500/60'}
                    onChange={(e) => setTarget(tg.id, { user: e.target.value })}
                  >
                    {!users.some((u) => u.name === tg.user) && <option value={tg.user ?? ''}>{tg.user || '—'}</option>}
                    {users.map((u) => (
                      <option key={u.name} value={u.name}>
                        {u.name}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    placeholder={t('snmp.traps.community')}
                    title={t('snmp.traps.community')}
                    value={tg.community}
                    onChange={(e) => setTarget(tg.id, { community: e.target.value })}
                  />
                )}
                <span title={t('snmp.traps.informHint')}>
                  <Checkbox
                    label={t('snmp.traps.inform')}
                    checked={!!tg.inform}
                    disabled={tg.version === 'v1'}
                    onChange={(e) => setTarget(tg.id, { inform: e.target.checked })}
                  />
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  title={t('ui.remove')}
                  onClick={() => set({ targets: traps.targets.filter((x) => x.id !== tg.id) })}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">{t('snmp.traps.noTarget')}</p>
          )}
        </div>
        {results && (
          <div className="flex flex-col gap-1 text-xs">
            {results.map((r) => (
              <span key={r.destination} className={r.ok ? 'text-emerald-300' : 'text-red-300'}>
                {r.ok
                  ? t('snmp.traps.sent', { destination: r.destination })
                  : t('snmp.traps.failed', { destination: r.destination, error: r.error })}
              </span>
            ))}
          </div>
        )}
        <p className="text-xs text-slate-500">{t('snmp.traps.hint')}</p>
      </div>
    </Card>
  )
}

function RequestLog() {
  const [logs, setLogs] = useState([])
  useEffect(() => {
    snmpApi.agent.logs().then(setLogs)
    return snmpApi.agent.onLog((batch) => setLogs((l) => [...l, ...batch].slice(-MAX_LOG)))
  }, [])
  return (
    <Card
      id="snmp.agent.log"
      title={t('snmp.log.title', { count: logs.length })}
      className="min-h-48 shrink-0"
      actions={
        <Button
          variant="ghost"
          size="icon"
          title={t('snmp.log.clear')}
          onClick={() => snmpApi.agent.clearLogs().then(setLogs)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      }
    >
      {logs.length ? (
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-ink-900 text-left text-xs text-slate-500">
              <tr>
                <th className="pb-2 font-medium">{t('snmp.log.time')}</th>
                <th className="pb-2 font-medium">{t('snmp.log.source')}</th>
                <th className="pb-2 font-medium">{t('snmp.log.operation')}</th>
                <th className="pb-2 font-medium">{t('snmp.log.oids')}</th>
                <th className="pb-2 font-medium">{t('snmp.log.result')}</th>
              </tr>
            </thead>
            <tbody className="font-mono text-[13px]">
              {logs
                .slice()
                .reverse()
                .map((e) => (
                  <tr key={e.id} className="border-t border-ink-800 align-top">
                    <td className="py-1 pr-3 text-slate-500 tabular-nums">{formatTime(e.time)}</td>
                    <td className="py-1 pr-3 whitespace-nowrap text-slate-400">
                      {e.address} {e.version && <span className="text-slate-600">{e.version}</span>}
                    </td>
                    <td className="py-1 pr-3 text-slate-300">{e.operation ?? '—'}</td>
                    <td className="py-1 pr-3 break-all text-sulfur-300">{e.oids?.join(' ') ?? ''}</td>
                    <td
                      className={`py-1 font-sans text-xs ${
                        e.level === 'error'
                          ? 'text-red-300'
                          : e.level === 'warn' || e.dropped
                            ? 'text-amber-300'
                            : 'text-emerald-300'
                      }`}
                    >
                      {e.message ??
                        (e.dropped
                          ? t('snmp.log.dropped')
                          : e.errorStatus
                            ? `errorStatus ${e.errorStatus}`
                            : t('snmp.log.ok'))}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-500">{t('snmp.log.empty')}</p>
      )}
    </Card>
  )
}

/** Valeur courante modifiable d'un objet de l'agent. */
function LiveValue({ value, onSet }) {
  return <CommitInput className="font-mono text-sulfur-300" value={formatValue(value)} onCommit={onSet} />
}

export default function AgentPanel({ status }) {
  const [config, setConfig] = usePersistentState('snmp', 'agent', status.config ?? DEFAULT_AGENT_CONFIG)
  const [values, setValues] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const timers = useRef({})
  const running = status.running
  const locked = running || busy

  // L'agent est la source de vérité quand il tourne : on reprend sa configuration au démarrage.
  useEffect(() => {
    if (running && status.config) setConfig(status.config)
    if (!running) setValues({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  useEffect(() => {
    snmpApi.agent.values().then(setValues)
    return snmpApi.agent.onValues(setValues)
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
  const debounce = (key, send, immediate = false) => {
    clearTimeout(timers.current[key])
    if (immediate) send()
    else timers.current[key] = setTimeout(send, LIVE_DEBOUNCE)
  }

  const bad = badOids(config.objects)
  const traps = { ...DEFAULT_AGENT_CONFIG.traps, ...config.traps }

  function updateObject(id, patch, { immediate = false } = {}) {
    const next = { ...config.objects.find((d) => d.id === id), ...patch }
    const objects = config.objects.map((d) => (d.id === id ? next : d))
    setConfig((c) => ({ ...c, objects }))
    if (running && !badOids(objects).has(id))
      debounce(id, () => live(() => snmpApi.agent.upsertObject(next)), immediate)
  }

  function addObject() {
    const def = newObject(config.objects)
    setConfig((c) => ({ ...c, objects: [...c.objects, def] }))
    if (running) live(() => snmpApi.agent.upsertObject(def))
  }

  function removeObject(id) {
    clearTimeout(timers.current[id])
    setConfig((c) => ({ ...c, objects: c.objects.filter((d) => d.id !== id) }))
    if (running) live(() => snmpApi.agent.deleteObject(id))
  }

  function setTraps(next) {
    update({ traps: next })
    if (running) debounce('traps', () => live(() => snmpApi.agent.setTraps(next)))
  }

  return (
    <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-2">
      <Card
        id="snmp.agent.config"
        title={t('snmp.agent.title')}
        className="shrink-0"
        actions={
          <>
            <StatusDot
              on={running}
              label={running ? t('snmp.agent.running', { count: status.requests ?? 0 }) : t('ui.stopped')}
            />
            {running ? (
              <Button variant="danger" size="sm" disabled={busy} onClick={() => run(snmpApi.agent.stop)}>
                <Square className="size-3.5" /> {t('ui.stop')}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                disabled={busy || bad.size > 0}
                onClick={() => run(() => snmpApi.agent.start(config))}
              >
                <Play className="size-3.5" /> {busy ? t('ui.starting') : t('ui.start')}
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[2fr_1fr_1.2fr] gap-4">
            <Field label={t('snmp.agent.host')}>
              <Input value={config.host} disabled={locked} onChange={(e) => update({ host: e.target.value })} />
            </Field>
            <Field label={t('snmp.agent.port')}>
              <Input
                type="number"
                value={config.port}
                disabled={locked}
                onChange={(e) => update({ port: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('ui.simulationRate')}>
              <CommitInput
                type="number"
                min={10}
                value={config.updateRate}
                disabled={busy}
                onCommit={(raw) => {
                  update({ updateRate: Number(raw) })
                  if (running) live(() => snmpApi.agent.setUpdateRate(Number(raw)))
                }}
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field label={t('snmp.agent.readCommunity')}>
              <Input
                placeholder={t('snmp.agent.communityHint')}
                value={config.readCommunity}
                disabled={locked}
                onChange={(e) => update({ readCommunity: e.target.value })}
              />
            </Field>
            <Field label={t('snmp.agent.writeCommunity')}>
              <Input
                placeholder={t('snmp.agent.communityHint')}
                value={config.writeCommunity}
                disabled={locked}
                onChange={(e) => update({ writeCommunity: e.target.value })}
              />
            </Field>
            <Field label={t('snmp.agent.engineId')}>
              <Input
                className="font-mono"
                placeholder={t('snmp.agent.engineIdHint')}
                value={config.engineId}
                disabled={locked}
                onChange={(e) => update({ engineId: e.target.value })}
              />
            </Field>
          </div>
          <p className="text-xs text-slate-500">{t('snmp.agent.portsHint')}</p>
          {status.endpoint && (
            <div className="flex items-center gap-2 rounded-md bg-ink-950 px-3 py-2 font-mono text-sm text-sulfur-300">
              {status.endpoint}
              <span className="font-sans text-xs text-slate-500">
                · {t('snmp.agent.currentEngineId', { id: status.engineId })}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto"
                title={t('ui.copy')}
                onClick={() => navigator.clipboard.writeText(status.endpoint)}
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
          )}
          <ErrorBanner error={error} onClose={() => setError(null)} />
        </div>
      </Card>

      <UsersCard users={config.users ?? []} locked={locked} onChange={(users) => update({ users })} />
      <SystemCard
        system={{ ...DEFAULT_AGENT_CONFIG.system, ...config.system }}
        locked={locked}
        onChange={(system) => update({ system })}
      />

      <Card
        id="snmp.agent.objects"
        title={t('snmp.objects.title', { count: config.objects.length })}
        className="shrink-0"
        actions={
          <>
            {running && <span className="text-xs text-slate-500">{t('ui.liveApplied')}</span>}
            <Button size="sm" disabled={busy} onClick={addObject}>
              <Plus className="size-3.5" /> {t('ui.add')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="overflow-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  {[
                    t('snmp.objects.name'),
                    t('snmp.objects.oid'),
                    t('ui.type'),
                    running ? t('ui.currentValue') : t('ui.initialValue'),
                    t('ui.simulation'),
                    t('ui.periodMs'),
                    t('ui.min'),
                    t('ui.max'),
                    t('ui.write'),
                    ''
                  ].map((h, i) => (
                    <th key={i} className="px-1.5 pb-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {config.objects.map((d) => {
                  const numeric = NUMERIC_TYPES.includes(d.type)
                  return (
                    <tr key={d.id} className="align-middle">
                      <td className="w-36 p-1.5">
                        <Input
                          value={d.name}
                          disabled={busy}
                          onChange={(e) => updateObject(d.id, { name: e.target.value })}
                        />
                      </td>
                      <td className="min-w-56 p-1.5">
                        <CommitInput
                          className={`font-mono ${bad.has(d.id) ? 'border-red-500/60' : ''}`}
                          value={d.oid}
                          disabled={busy}
                          title={bad.has(d.id) ? t('snmp.objects.invalid') : `${d.oid}.0`}
                          onCommit={(oid) => updateObject(d.id, { oid: oid.trim() }, { immediate: true })}
                        />
                      </td>
                      <td className="w-32 p-1.5">
                        <Select
                          value={d.type}
                          disabled={busy}
                          onChange={(e) =>
                            updateObject(
                              d.id,
                              {
                                type: e.target.value,
                                simulation: NUMERIC_TYPES.includes(e.target.value) ? d.simulation : 'none'
                              },
                              { immediate: true }
                            )
                          }
                        >
                          {OBJECT_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="w-36 p-1.5">
                        {running ? (
                          <LiveValue
                            value={values[d.id]}
                            onSet={(raw) => live(() => snmpApi.agent.setValue(d.id, raw))}
                          />
                        ) : (
                          <Input
                            className="font-mono"
                            value={formatValue(d.initialValue)}
                            disabled={busy}
                            onChange={(e) => updateObject(d.id, { initialValue: e.target.value })}
                          />
                        )}
                      </td>
                      <td className="w-28 p-1.5">
                        <Select
                          value={d.simulation}
                          disabled={busy || !numeric}
                          onChange={(e) => updateObject(d.id, { simulation: e.target.value }, { immediate: true })}
                        >
                          {SIMULATIONS.map((k) => (
                            <option key={k} value={k}>
                              {t(`simulations.${k}`)}
                            </option>
                          ))}
                        </Select>
                      </td>
                      {['period', 'min', 'max'].map((key) => (
                        <td key={key} className="w-20 min-w-20 p-1.5">
                          <Input
                            type="number"
                            value={d[key]}
                            disabled={busy || d.simulation === 'none' || !numeric}
                            onChange={(e) => updateObject(d.id, { [key]: Number(e.target.value) })}
                          />
                        </td>
                      ))}
                      <td className="p-1.5 text-center">
                        <input
                          type="checkbox"
                          className="size-4 accent-sulfur-400"
                          title={t('snmp.objects.writableHint')}
                          checked={!!d.writable}
                          disabled={busy}
                          onChange={(e) => updateObject(d.id, { writable: e.target.checked }, { immediate: true })}
                        />
                      </td>
                      <td className="p-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={busy}
                          title={t('ui.remove')}
                          onClick={() => removeObject(d.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">{t('snmp.objects.hint')}</p>
        </div>
      </Card>

      <TrapsCard
        traps={traps}
        objects={config.objects}
        users={config.users ?? []}
        status={status}
        running={running}
        onChange={setTraps}
        onError={setError}
      />
      <RequestLog />
    </div>
  )
}
