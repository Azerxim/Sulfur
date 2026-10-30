import { useEffect, useRef, useState } from 'react'
import { Play, Plus, Square, Trash2 } from 'lucide-react'
import {
  Button,
  Card,
  CommitInput,
  ErrorBanner,
  Field,
  Input,
  Select,
  StatusDot,
  usePersistentState
} from '@azerxim/sulfur-sdk/ui'
import { formatTime } from '@azerxim/sulfur-sdk'
import { formatName } from '../shared/codec'
import { DATA_TYPES, DEFAULT_SERVER_CONFIG, RESOURCE_FORMATS, SIMULATIONS } from '../shared/constants'
import { coapApi } from './api'
import LogCard, { CodeBadge } from './LogCard'
import { t } from '../shared/i18n'

/** Délai avant d'envoyer au serveur les ressources modifiées pendant qu'il tourne. */
const LIVE_DEBOUNCE = 300

const formatValue = (v) => {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number' && !Number.isInteger(v)) return v.toFixed(3)
  return String(v)
}

function newResource(resources) {
  let n = resources.length + 1
  while (resources.some((r) => r.path === `sensors/value${n}`)) n++
  return {
    id: crypto.randomUUID(),
    path: `sensors/value${n}`,
    title: '',
    dataType: 'Number',
    format: 0,
    initialValue: 0,
    simulation: 'none',
    period: 1000,
    min: 0,
    max: 100,
    observable: true,
    writable: true,
    interval: 1000
  }
}

/** Serveur CoAP simulé : adresse, ressources simulées, observateurs et journal des requêtes. */
export default function ServerPanel({ status }) {
  const [config, setConfig] = usePersistentState('coap', 'server', status.config ?? DEFAULT_SERVER_CONFIG)
  const [values, setValues] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const timer = useRef(null)
  const running = status.running

  // Serveur en marche : sa configuration fait foi (fenêtre rechargée).
  useEffect(() => {
    if (running && status.config) setConfig(status.config)
    if (!running) setValues({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  useEffect(() => {
    coapApi.server.values().then(setValues)
    return coapApi.server.onValues(setValues)
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

  /** Ressources modifiées : envoyées au serveur en marche après un court délai. */
  function setResources(resources) {
    const next = { ...config, resources }
    setConfig(next)
    if (!running) return
    clearTimeout(timer.current)
    timer.current = setTimeout(() => coapApi.server.update(next).catch((err) => setError(err.message)), LIVE_DEBOUNCE)
  }

  const updateResource = (id, patch) =>
    setResources(config.resources.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const headers = [
    t('coap.server.path'),
    t('coap.server.resourceTitle'),
    t('ui.type'),
    t('coap.server.format'),
    running ? t('ui.currentValue') : t('ui.initialValue'),
    t('ui.simulation'),
    t('ui.periodMs'),
    t('ui.min'),
    t('ui.max'),
    t('coap.server.observable'),
    t('coap.server.writable'),
    t('coap.server.interval'),
    ''
  ]

  return (
    <>
      <Card id="coap.server" title={t('coap.server.title')} className="shrink-0">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t('coap.address')} className="w-40">
              <Input
                className="font-mono"
                value={config.host}
                disabled={running || busy}
                onChange={(e) => setConfig({ ...config, host: e.target.value })}
              />
            </Field>
            <Field label={t('coap.port')} className="w-28">
              <Input
                className="font-mono"
                type="number"
                value={config.port}
                disabled={running || busy}
                onChange={(e) => setConfig({ ...config, port: Number(e.target.value) })}
              />
            </Field>
            {running ? (
              <Button disabled={busy} onClick={() => run(coapApi.server.stop)}>
                <Square className="size-4" /> {t('ui.stop')}
              </Button>
            ) : (
              <Button variant="primary" disabled={busy} onClick={() => run(() => coapApi.server.start(config))}>
                <Play className="size-4" /> {t('ui.start')}
              </Button>
            )}
            <StatusDot
              on={running}
              label={
                running
                  ? t('coap.server.running', { requests: status.requests ?? 0, observers: status.sessions ?? 0 })
                  : t('ui.stopped')
              }
            />
          </div>
          <p className="text-xs text-slate-500">{t('coap.server.hint')}</p>
          <ErrorBanner error={error} onClose={() => setError(null)} />
        </div>
      </Card>

      <Card
        id="coap.server.resources"
        title={t('coap.server.resources', { count: config.resources.length })}
        className="shrink-0"
        actions={
          <>
            {running && <span className="text-xs text-slate-500">{t('ui.liveApplied')}</span>}
            <Button size="sm" onClick={() => setResources([...config.resources, newResource(config.resources)])}>
              <Plus className="size-3.5" /> {t('ui.add')}
            </Button>
          </>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                {headers.map((h, i) => (
                  <th key={i} className="px-1.5 pb-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {config.resources.map((r) => (
                <tr key={r.id}>
                  <td className="p-1.5">
                    <CommitInput
                      className="font-mono"
                      value={r.path}
                      onCommit={(path) => updateResource(r.id, { path: path.trim().replace(/^\/+/, '') })}
                    />
                  </td>
                  <td className="w-32 p-1.5">
                    <CommitInput value={r.title ?? ''} onCommit={(title) => updateResource(r.id, { title })} />
                  </td>
                  <td className="w-28 p-1.5">
                    <Select value={r.dataType} onChange={(e) => updateResource(r.id, { dataType: e.target.value })}>
                      {DATA_TYPES.map((type) => (
                        <option key={type}>{type}</option>
                      ))}
                    </Select>
                  </td>
                  <td className="w-40 p-1.5">
                    <Select value={r.format} onChange={(e) => updateResource(r.id, { format: Number(e.target.value) })}>
                      {RESOURCE_FORMATS.map((f) => (
                        <option key={f} value={f}>
                          {formatName(f)}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="w-36 p-1.5">
                    {running ? (
                      <CommitInput
                        className="font-mono text-sulfur-300"
                        value={formatValue(values[r.id])}
                        onCommit={(v) => coapApi.server.setValue(r.id, v).catch((err) => setError(err.message))}
                      />
                    ) : (
                      <CommitInput
                        className="font-mono"
                        value={String(r.initialValue)}
                        onCommit={(initialValue) => updateResource(r.id, { initialValue })}
                      />
                    )}
                  </td>
                  <td className="w-32 p-1.5">
                    <Select value={r.simulation} onChange={(e) => updateResource(r.id, { simulation: e.target.value })}>
                      {SIMULATIONS.map((s) => (
                        <option key={s} value={s}>
                          {t(`simulations.${s}`)}
                        </option>
                      ))}
                    </Select>
                  </td>
                  {['period', 'min', 'max'].map((key) => (
                    <td key={key} className="w-24 p-1.5">
                      <CommitInput
                        type="number"
                        value={String(r[key])}
                        disabled={r.simulation === 'none'}
                        onCommit={(v) => updateResource(r.id, { [key]: Number(v) })}
                      />
                    </td>
                  ))}
                  {['observable', 'writable'].map((key) => (
                    <td key={key} className="p-1.5 text-center">
                      <input
                        type="checkbox"
                        className="size-4 accent-sulfur-400"
                        checked={!!r[key]}
                        onChange={(e) => updateResource(r.id, { [key]: e.target.checked })}
                      />
                    </td>
                  ))}
                  <td className="w-24 p-1.5">
                    <CommitInput
                      type="number"
                      value={String(r.interval)}
                      disabled={!r.observable}
                      title={t('coap.server.intervalHint')}
                      onCommit={(v) => updateResource(r.id, { interval: Number(v) })}
                    />
                  </td>
                  <td className="p-1.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      title={t('ui.remove')}
                      onClick={() => setResources(config.resources.filter((x) => x.id !== r.id))}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {running && (
        <Card
          id="coap.server.observers"
          title={t('coap.server.observers', { count: status.observers?.length ?? 0 })}
          className="shrink-0"
        >
          {status.observers?.length ? (
            <table className="w-full text-xs">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="pb-1.5 font-medium">{t('coap.server.path')}</th>
                  <th className="pb-1.5 font-medium">{t('coap.server.observer')}</th>
                  <th className="pb-1.5 font-medium">{t('coap.since')}</th>
                  <th className="pb-1.5 text-right font-medium">{t('coap.server.notifications')}</th>
                </tr>
              </thead>
              <tbody>
                {status.observers.map((o) => (
                  <tr key={`${o.resource}-${o.remote}-${o.since}`} className="border-t border-ink-800/70">
                    <td className="py-1.5 font-mono text-slate-200">
                      /{config.resources.find((r) => r.id === o.resource)?.path}
                    </td>
                    <td className="py-1.5 font-mono text-slate-400">{o.remote}</td>
                    <td className="py-1.5 text-slate-400 tabular-nums">{formatTime(o.since)}</td>
                    <td className="py-1.5 text-right text-slate-400 tabular-nums">{o.sent - 1}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-slate-500">{t('coap.server.noObserver')}</p>
          )}
        </Card>
      )}

      <LogCard
        id="coap.server.log"
        load={coapApi.server.log}
        subscribe={coapApi.server.onLog}
        clear={coapApi.server.clearLog}
        renderEntry={(e) => (
          <>
            <span className="w-36 shrink-0 truncate text-slate-500">{e.remote}</span>
            <span className="w-14 shrink-0 text-sky-300">{e.method}</span>
            <span className="min-w-0 flex-1 truncate text-slate-200">{e.path}</span>
            {e.observe && <span className="font-sans text-violet-300">{t(`coap.server.observe.${e.observe}`)}</span>}
            {e.fault && <span className="font-sans text-amber-300">{t(`coap.server.faults.${e.fault}`)}</span>}
            <CodeBadge code={e.code} />
            <span className="max-w-[30%] truncate text-slate-400" title={e.payload}>
              {e.payload}
            </span>
          </>
        )}
      />
    </>
  )
}
