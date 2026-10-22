import { useEffect, useRef, useState } from 'react'
import { Copy, Lock, Play, Plus, Square, Trash2, X } from 'lucide-react'
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
  DATA_TYPES,
  DEFAULT_SERVER_AUTH,
  DEFAULT_SERVER_CONFIG,
  MAX_LOG,
  MAX_TOPICS,
  NUMERIC_TYPES,
  PAYLOAD_FORMATS,
  QOS_LEVELS,
  SIMULATIONS
} from '../shared/constants'
import { isValidTopic } from '../shared/topics'
import { mqttApi } from './api'
import MessageLog from './MessageLog'
import { t } from '../shared/i18n'

/** Délai avant d'envoyer au broker les réglages modifiés pendant qu'il tourne. */
const LIVE_DEBOUNCE = 400

const formatValue = (v) => {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number' && !Number.isInteger(v)) return Number(v.toFixed(4)).toString()
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}

function newTopic(topics) {
  const used = new Set(topics.map((d) => d.topic))
  let i = topics.length + 1
  while (used.has(`sulfur/topic${i}`)) i++
  return {
    id: crypto.randomUUID(),
    topic: `sulfur/topic${i}`,
    dataType: 'Number',
    initialValue: 0,
    simulation: 'none',
    period: 1000,
    min: 0,
    max: 100,
    interval: 1000,
    qos: 0,
    retain: false,
    format: 'plain',
    writable: true
  }
}

function LiveValue({ def, value, onSet }) {
  if (def.dataType === 'Boolean') {
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

/** Mot de passe d'un utilisateur : saisi puis haché aussitôt (seule l'empreinte est conservée). */
function PasswordField({ hasHash, disabled, onHash, onError }) {
  const [draft, setDraft] = useState('')
  const commit = async () => {
    if (!draft) return
    try {
      onHash(await mqttApi.server.hashPassword(draft))
      setDraft('')
    } catch (err) {
      onError(err.message)
    }
  }
  return (
    <Input
      type="password"
      autoComplete="new-password"
      placeholder={hasHash ? t('mqtt.auth.passwordSet') : t('mqtt.auth.password')}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}

function AuthCard({ value, locked, onChange, onError }) {
  const auth = { ...DEFAULT_SERVER_AUTH, ...value }
  const set = (patch) => onChange({ ...auth, ...patch })
  const setUser = (i, patch) => set({ users: auth.users.map((u, j) => (j === i ? { ...u, ...patch } : u)) })
  return (
    <Card
      id="mqtt.server.auth"
      title={t('mqtt.auth.title', { count: auth.users.length })}
      className="shrink-0"
      defaultCollapsed
      actions={
        <Button
          size="sm"
          disabled={locked}
          onClick={() =>
            set({ users: [...auth.users, { username: `user${auth.users.length + 1}`, passwordHash: '' }] })
          }
        >
          <Plus className="size-3.5" /> {t('ui.add')}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <div>
          <Checkbox
            label={t('mqtt.auth.anonymous')}
            checked={!!auth.anonymous}
            disabled={locked}
            onChange={(e) => set({ anonymous: e.target.checked })}
          />
          <p className="mt-1 text-xs text-slate-500">{t('mqtt.auth.anonymousHint')}</p>
        </div>
        {auth.users.length ? (
          auth.users.map((u, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <Input
                className="font-mono"
                placeholder={t('mqtt.auth.username')}
                value={u.username}
                disabled={locked}
                onChange={(e) => setUser(i, { username: e.target.value })}
              />
              <PasswordField
                hasHash={!!u.passwordHash}
                disabled={locked}
                onHash={(passwordHash) => setUser(i, { passwordHash })}
                onError={onError}
              />
              <Button
                variant="ghost"
                size="icon"
                disabled={locked}
                title={t('ui.remove')}
                onClick={() => set({ users: auth.users.filter((_, j) => j !== i) })}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">{t('mqtt.auth.noUser')}</p>
        )}
      </div>
    </Card>
  )
}

function ClientsCard({ status }) {
  const clients = status.clients ?? []
  return (
    <Card id="mqtt.server.clients" title={t('mqtt.clients.title', { count: clients.length })} className="shrink-0">
      {clients.length ? (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="pb-2 font-medium">{t('mqtt.clients.id')}</th>
                <th className="pb-2 font-medium">{t('mqtt.clients.address')}</th>
                <th className="pb-2 font-medium">{t('mqtt.clients.user')}</th>
                <th className="pb-2 font-medium">{t('mqtt.clients.version')}</th>
                <th className="pb-2 font-medium">{t('mqtt.clients.subscriptions')}</th>
                <th className="pb-2 text-right font-medium">{t('mqtt.clients.since')}</th>
              </tr>
            </thead>
            <tbody className="font-mono text-[13px]">
              {clients.map((c) => (
                <tr key={c.id} className="border-t border-ink-800 align-top">
                  <td className="py-1.5 pr-3 break-all text-slate-200">{c.id}</td>
                  <td className="py-1.5 pr-3 text-slate-400">{c.address}</td>
                  <td className="py-1.5 pr-3 text-slate-400">{c.username || '—'}</td>
                  <td className="py-1.5 pr-3 text-slate-400">{t(`mqtt.versions.${c.version}`)}</td>
                  <td className="py-1.5 pr-3 break-all text-sulfur-300">
                    {c.subscriptions.map((s) => `${s.topic} (${s.qos})`).join(', ') || '—'}
                  </td>
                  <td className="py-1.5 text-right text-slate-400 tabular-nums">{formatTime(c.connectedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-500">{status.running ? t('mqtt.clients.none') : t('mqtt.clients.stopped')}</p>
      )}
    </Card>
  )
}

function Activity({ status }) {
  const [logs, setLogs] = useState([])
  const [topics, setTopics] = useState([])

  useEffect(() => {
    mqttApi.server.logs().then(setLogs)
    mqttApi.server.topics().then(setTopics)
    return mqttApi.server.onLog((batch) => {
      setLogs((l) => [...l, ...batch].slice(-MAX_LOG))
      setTopics((list) => {
        const map = new Map(list.map((s) => [s.topic, s]))
        for (const e of batch) {
          if (e.type !== 'publish') continue
          const prev = map.get(e.topic)
          map.delete(e.topic)
          map.set(e.topic, { ...e, count: (prev?.count ?? 0) + 1 })
        }
        return [...map.values()].slice(-MAX_TOPICS)
      })
    })
  }, [])

  const sorted = [...topics].sort((a, b) => a.topic.localeCompare(b.topic))
  return (
    <>
      <Card id="mqtt.server.explorer" title={t('mqtt.explorer.title', { count: topics.length })} className="shrink-0">
        {sorted.length ? (
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-ink-900 text-left text-xs text-slate-500">
                <tr>
                  <th className="pb-2 font-medium">{t('mqtt.explorer.topic')}</th>
                  <th className="pb-2 font-medium">{t('mqtt.explorer.last')}</th>
                  <th className="pb-2 text-right font-medium">{t('mqtt.explorer.count')}</th>
                  <th className="pb-2 pl-3 text-right font-medium">{t('mqtt.explorer.time')}</th>
                </tr>
              </thead>
              <tbody className="font-mono text-[13px]">
                {sorted.map((s) => (
                  <tr key={s.topic} className="border-t border-ink-800 align-top">
                    <td className="py-1 pr-3 break-all text-sulfur-300">
                      {s.topic}
                      {s.retain && <span className="ml-1 text-amber-300">R</span>}
                    </td>
                    <td className="py-1 pr-3 break-all text-slate-200 select-text">{s.payload}</td>
                    <td className="py-1 text-right text-slate-300 tabular-nums">{s.count}</td>
                    <td className="py-1 pl-3 text-right text-slate-500 tabular-nums">{formatTime(s.time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">{t('mqtt.explorer.empty')}</p>
        )}
      </Card>
      <MessageLog
        id="mqtt.server.log"
        title={t('mqtt.log.title', { count: status.messages ?? 0 })}
        entries={logs}
        withEvents
        showFrom
        emptyLabel={t('mqtt.log.empty')}
        onClear={() =>
          mqttApi.server.clearLogs().then((list) => {
            setLogs(list)
            setTopics([])
          })
        }
      />
    </>
  )
}

/** Les mots de passe ne sont jamais enregistrés en clair : seules les empreintes le sont. */
const persist = (config) => ({
  ...config,
  auth: {
    ...config.auth,
    users: (config.auth?.users ?? []).map(({ username, passwordHash }) => ({ username, passwordHash }))
  }
})

export default function ServerPanel({ status }) {
  const [config, setConfig] = usePersistentState('mqtt', 'server', status.config ?? DEFAULT_SERVER_CONFIG, { persist })
  const [values, setValues] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const timers = useRef({})
  const running = status.running

  // Le broker est la source de vérité quand il tourne : on reprend sa configuration au démarrage.
  useEffect(() => {
    if (running && status.config) setConfig(status.config)
    if (!running) setValues({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  useEffect(() => {
    mqttApi.server.values().then(setValues)
    return mqttApi.server.onValues(setValues)
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

  const names = config.topics.map((d) => d.topic)
  const badTopics = new Set(names.filter((n, i) => names.indexOf(n) !== i || !isValidTopic(n) || n.startsWith('$')))
  const invalid = badTopics.size > 0

  function updateTopic(id, patch, { immediate = false } = {}) {
    const next = { ...config.topics.find((d) => d.id === id), ...patch }
    setConfig((c) => ({ ...c, topics: c.topics.map((d) => (d.id === id ? next : d)) }))
    if (!running || !isValidTopic(next.topic)) return
    clearTimeout(timers.current[id])
    const send = () => live(() => mqttApi.server.upsertTopic(next))
    if (immediate) send()
    else timers.current[id] = setTimeout(send, LIVE_DEBOUNCE)
  }

  function addTopic() {
    const def = newTopic(config.topics)
    setConfig((c) => ({ ...c, topics: [...c.topics, def] }))
    if (running) live(() => mqttApi.server.upsertTopic(def))
  }

  function removeTopic(id) {
    clearTimeout(timers.current[id])
    setConfig((c) => ({ ...c, topics: c.topics.filter((d) => d.id !== id) }))
    if (running) live(() => mqttApi.server.removeTopic(id))
  }

  return (
    <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-2">
      <Card
        id="mqtt.server.config"
        title={t('mqtt.server.title')}
        className="shrink-0"
        actions={
          <>
            <StatusDot
              on={running}
              label={
                running
                  ? t('mqtt.server.running', { clients: status.clients?.length ?? 0, count: status.messages ?? 0 })
                  : t('ui.stopped')
              }
            />
            {running ? (
              <Button variant="danger" size="sm" disabled={busy} onClick={() => run(mqttApi.server.stop)}>
                <Square className="size-3.5" /> {t('ui.stop')}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                disabled={busy || invalid}
                onClick={() => run(() => mqttApi.server.start(config))}
              >
                <Play className="size-3.5" /> {busy ? t('ui.starting') : t('ui.start')}
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[2fr_1fr_1.2fr] gap-4">
            <Field label={t('mqtt.server.host')}>
              <Input
                value={config.host}
                disabled={running || busy}
                onChange={(e) => update({ host: e.target.value })}
              />
            </Field>
            <Field label={t('mqtt.server.port')}>
              <Input
                type="number"
                value={config.port}
                disabled={running || busy}
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
                  if (running) live(() => mqttApi.server.setUpdateRate(Number(raw)))
                }}
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <Checkbox
              label={t('mqtt.server.tls')}
              disabled={running || busy}
              checked={!!config.tls}
              onChange={(e) =>
                update({
                  tls: e.target.checked,
                  port:
                    config.port === 1883 && e.target.checked
                      ? 8883
                      : config.port === 8883 && !e.target.checked
                        ? 1883
                        : config.port
                })
              }
            />
            <span className="text-xs text-slate-500">{t('mqtt.server.portsHint')}</span>
          </div>
          {status.url && (
            <div className="flex items-center gap-2 rounded-md bg-ink-950 px-3 py-2 font-mono text-sm text-sulfur-300">
              {config.tls && <Lock className="size-3.5 text-emerald-400" />}
              {status.url}
              {status.certificate && (
                <span className="font-sans text-xs text-slate-500">
                  · {t('mqtt.server.certificate', { name: status.certificate.commonName })} ·{' '}
                  {status.certificate.thumbprint.slice(0, 16)}…
                </span>
              )}
              {status.cut && <span className="font-sans text-xs text-amber-300">· {t('mqtt.server.cut')}</span>}
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto"
                title={t('ui.copy')}
                onClick={() => navigator.clipboard.writeText(status.url)}
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
          )}
          <ErrorBanner error={error} onClose={() => setError(null)} />
        </div>
      </Card>

      <AuthCard value={config.auth} locked={running || busy} onChange={(auth) => update({ auth })} onError={setError} />

      <Card
        id="mqtt.server.topics"
        title={t('mqtt.topics.title', { count: config.topics.length })}
        className="shrink-0"
        actions={
          <>
            {running && <span className="text-xs text-slate-500">{t('ui.liveApplied')}</span>}
            <Button size="sm" disabled={busy} onClick={addTopic}>
              <Plus className="size-3.5" /> {t('ui.add')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="overflow-auto">
            <table className="w-full min-w-[1250px] text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  {[
                    t('mqtt.topics.topic'),
                    t('ui.type'),
                    running ? t('ui.currentValue') : t('ui.initialValue'),
                    t('ui.simulation'),
                    t('ui.periodMs'),
                    t('ui.min'),
                    t('ui.max'),
                    t('mqtt.topics.interval'),
                    t('mqtt.topics.qos'),
                    t('mqtt.topics.format'),
                    t('mqtt.topics.retain'),
                    t('mqtt.topics.writable'),
                    ''
                  ].map((h, i) => (
                    <th key={i} className="px-1.5 pb-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {config.topics.map((d) => {
                  const numeric = NUMERIC_TYPES.includes(d.dataType)
                  return (
                    <tr key={d.id} className="align-middle">
                      <td className="min-w-56 p-1.5">
                        <CommitInput
                          className={`font-mono ${badTopics.has(d.topic) ? 'border-red-500/60' : ''}`}
                          value={d.topic}
                          disabled={busy}
                          title={badTopics.has(d.topic) ? t('mqtt.topics.invalid') : undefined}
                          onCommit={(topic) => updateTopic(d.id, { topic: topic.trim() }, { immediate: true })}
                        />
                      </td>
                      <td className="w-28 p-1.5">
                        <Select
                          value={d.dataType}
                          disabled={busy}
                          onChange={(e) =>
                            updateTopic(
                              d.id,
                              {
                                dataType: e.target.value,
                                simulation: NUMERIC_TYPES.includes(e.target.value) ? d.simulation : 'none'
                              },
                              { immediate: true }
                            )
                          }
                        >
                          {DATA_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {t(`mqtt.dataTypes.${type}`)}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="w-36 p-1.5">
                        {running ? (
                          <LiveValue
                            def={d}
                            value={values[d.id]}
                            onSet={(raw) => live(() => mqttApi.server.setValue(d.id, raw))}
                          />
                        ) : (
                          <Input
                            className="font-mono"
                            value={formatValue(d.initialValue)}
                            disabled={busy}
                            onChange={(e) => updateTopic(d.id, { initialValue: e.target.value })}
                          />
                        )}
                      </td>
                      <td className="w-28 p-1.5">
                        <Select
                          value={d.simulation}
                          disabled={busy || !numeric}
                          onChange={(e) => updateTopic(d.id, { simulation: e.target.value }, { immediate: true })}
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
                            onChange={(e) => updateTopic(d.id, { [key]: Number(e.target.value) })}
                          />
                        </td>
                      ))}
                      <td className="w-24 p-1.5">
                        <Input
                          type="number"
                          min={0}
                          title={t('mqtt.topics.intervalHint')}
                          value={d.interval}
                          disabled={busy}
                          onChange={(e) => updateTopic(d.id, { interval: Number(e.target.value) })}
                        />
                      </td>
                      <td className="w-16 p-1.5">
                        <Select
                          value={d.qos}
                          disabled={busy}
                          onChange={(e) => updateTopic(d.id, { qos: Number(e.target.value) }, { immediate: true })}
                        >
                          {QOS_LEVELS.map((q) => (
                            <option key={q} value={q}>
                              {q}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="w-24 p-1.5">
                        <Select
                          value={d.format}
                          disabled={busy}
                          onChange={(e) => updateTopic(d.id, { format: e.target.value }, { immediate: true })}
                        >
                          {PAYLOAD_FORMATS.map((f) => (
                            <option key={f} value={f}>
                              {t(`mqtt.formats.${f}`)}
                            </option>
                          ))}
                        </Select>
                      </td>
                      {['retain', 'writable'].map((key) => (
                        <td key={key} className="p-1.5 text-center">
                          <input
                            type="checkbox"
                            className="size-4 accent-sulfur-400"
                            title={t(`mqtt.topics.${key}Hint`)}
                            checked={!!d[key]}
                            disabled={busy}
                            onChange={(e) => updateTopic(d.id, { [key]: e.target.checked }, { immediate: true })}
                          />
                        </td>
                      ))}
                      <td className="p-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={busy}
                          title={t('ui.remove')}
                          onClick={() => removeTopic(d.id)}
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
          <p className="text-xs text-slate-500">{t('mqtt.topics.hint')}</p>
        </div>
      </Card>

      <ClientsCard status={status} />
      <Activity status={status} />
    </div>
  )
}
