import { useEffect, useRef, useState } from 'react'
import { Copy, Play, Plus, Square, Trash2 } from 'lucide-react'
import {
  Button,
  Card,
  Checkbox,
  ErrorBanner,
  Field,
  Input,
  Select,
  StatusDot,
  usePersistentState
} from '@azerxim/sulfur-sdk/ui'
import { formatTime } from '@azerxim/sulfur-sdk'
import { DEFAULT_SERVER_CONFIG, RECORD_TYPES } from '../shared/constants'
import { absoluteName, recordProblem } from '../shared/records'
import { dnsApi } from './api'
import { t } from '../shared/i18n'

/** Délai avant d'envoyer la zone modifiée au serveur en marche. */
const LIVE_DEBOUNCE = 400
const MAX_SHOWN = 300

/** Exemple de valeur par type d'enregistrement. */
const PLACEHOLDERS = {
  A: '192.168.1.10',
  AAAA: 'fd00::10',
  CNAME: 'plc1',
  MX: '10 mail',
  TXT: 'texte',
  SRV: '0 0 4840 plc1',
  PTR: 'plc1.sulfur.local.',
  NS: 'ns1'
}

const RCODE_STYLES = {
  NOERROR: 'text-emerald-300',
  NXDOMAIN: 'text-amber-300',
  REFUSED: 'text-slate-400',
  SERVFAIL: 'text-red-300',
  FORMERR: 'text-red-300'
}

function QueryLog() {
  const [queries, setQueries] = useState([])
  useEffect(() => {
    dnsApi.server.queries().then(setQueries)
    return dnsApi.server.onQuery((entry) => setQueries((list) => [...list.slice(-(MAX_SHOWN - 1)), entry]))
  }, [])
  const clear = () => dnsApi.server.clear().then(setQueries)
  const shown = [...queries].reverse()
  return (
    <Card
      id="dns.server.queries"
      title={t('dns.queries.title', { count: queries.length })}
      className="min-h-64 shrink-0"
      actions={
        <Button size="sm" variant="ghost" onClick={clear} disabled={!queries.length}>
          <Trash2 className="size-3.5" /> {t('dns.queries.clear')}
        </Button>
      }
    >
      {shown.length ? (
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-slate-500">
              {[
                t('ui.timestamp'),
                t('dns.queries.client'),
                t('dns.queries.name'),
                t('ui.type'),
                t('dns.queries.rcode'),
                t('dns.queries.answers')
              ].map((h) => (
                <th key={h} className="px-2 py-1 font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono">
            {shown.map((q) => (
              <tr key={q.id} className="border-t border-ink-800 align-top">
                <td className="px-2 py-1 text-slate-500">{formatTime(q.time)}</td>
                <td className="px-2 py-1 text-slate-400">
                  {q.remote} <span className="text-slate-600">{q.transport}</span>
                </td>
                <td className="px-2 py-1 break-all text-slate-200">{q.name}</td>
                <td className="px-2 py-1 text-slate-300">{q.type}</td>
                <td className={`px-2 py-1 ${RCODE_STYLES[q.rcode] ?? 'text-slate-300'}`}>
                  {q.rcode}
                  {q.forwarded && <span className="ml-1 font-sans text-slate-500">{t('dns.queries.forwarded')}</span>}
                </td>
                <td className="px-2 py-1 break-all text-slate-400">{q.answers.join(' · ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-slate-600">{t('dns.queries.none')}</p>
      )}
    </Card>
  )
}

export default function ServerPanel({ status }) {
  const [config, setConfig] = usePersistentState('dns', 'server', status.config ?? DEFAULT_SERVER_CONFIG)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const timer = useRef(null)
  const running = status.running
  const domain = config.domain

  useEffect(() => {
    if (running && status.config) setConfig((c) => ({ ...c, ...status.config }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  const problems = config.records.map((r) => recordProblem(r, domain))
  const invalid = problems.some(Boolean)

  /** Applique la configuration modifiée ; serveur en marche : zone envoyée après un court délai. */
  function change(next) {
    setConfig(next)
    if (!running) return
    clearTimeout(timer.current)
    const zoneValid = next.records.every((r) => !recordProblem(r, next.domain))
    if (!zoneValid) return
    timer.current = setTimeout(
      () =>
        dnsApi.server
          .update(next)
          .then(() => setError(null))
          .catch((err) => setError(err.message)),
      LIVE_DEBOUNCE
    )
  }
  const update = (patch) => change({ ...config, ...patch })
  const setRecord = (id, patch) =>
    update({ records: config.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) })
  const addRecord = () =>
    update({ records: [...config.records, { id: crypto.randomUUID(), name: '', type: 'A', value: '', ttl: '' }] })
  const removeRecord = (id) => update({ records: config.records.filter((r) => r.id !== id) })

  async function run(action) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-2">
      <Card
        id="dns.server.config"
        title={t('dns.server.title')}
        className="shrink-0"
        actions={
          <>
            <StatusDot
              on={running}
              label={running ? t('dns.server.running', { count: status.counters?.total ?? 0 }) : t('ui.stopped')}
            />
            {running ? (
              <Button variant="danger" size="sm" disabled={busy} onClick={() => run(dnsApi.server.stop)}>
                <Square className="size-3.5" /> {t('ui.stop')}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                disabled={busy || invalid}
                onClick={() => run(() => dnsApi.server.start(config))}
              >
                <Play className="size-3.5" /> {busy ? t('ui.starting') : t('ui.start')}
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-5 gap-4">
            <Field label={t('dns.server.host')}>
              <Input
                value={config.host}
                disabled={running || busy}
                onChange={(e) => update({ host: e.target.value })}
              />
            </Field>
            <Field label={t('dns.server.port')}>
              <Input
                type="number"
                value={config.port}
                disabled={running || busy}
                onChange={(e) => update({ port: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('dns.server.domain')}>
              <Input className="font-mono" value={config.domain} onChange={(e) => update({ domain: e.target.value })} />
            </Field>
            <Field label={t('dns.server.ttl')}>
              <Input
                type="number"
                min={0}
                value={config.ttl}
                onChange={(e) => update({ ttl: Number(e.target.value) })}
              />
            </Field>
            <div className="flex flex-col justify-end gap-2 pb-1">
              <Checkbox
                label={t('dns.server.tcp')}
                disabled={running || busy}
                checked={config.tcp}
                onChange={(e) => update({ tcp: e.target.checked })}
              />
              <Checkbox
                label={t('dns.server.autoPtr')}
                checked={config.autoPtr}
                onChange={(e) => update({ autoPtr: e.target.checked })}
              />
            </div>
          </div>
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-4">
            <Checkbox
              className="mb-2"
              label={t('dns.server.forward')}
              checked={config.forward.enabled}
              onChange={(e) => update({ forward: { ...config.forward, enabled: e.target.checked } })}
            />
            <Field label={t('dns.server.upstreams')}>
              <Input
                className="font-mono"
                disabled={!config.forward.enabled}
                value={config.forward.servers}
                onChange={(e) => update({ forward: { ...config.forward, servers: e.target.value } })}
              />
            </Field>
          </div>
          <p className="text-xs text-slate-500">{t('dns.server.hint')}</p>
          {status.endpoint && (
            <div className="flex items-center gap-2 rounded-md bg-ink-950 px-3 py-2 font-mono text-sm text-sulfur-300">
              {status.endpoint}
              <span className="font-sans text-xs text-slate-500">
                · {config.tcp ? 'UDP + TCP' : 'UDP'} · {t('dns.server.counters', status.counters)}
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

      <Card
        id="dns.server.records"
        title={t('dns.records.title', { count: config.records.length })}
        className="shrink-0"
        actions={
          <>
            {running && <span className="text-xs text-slate-500">{t('ui.liveApplied')}</span>}
            <Button size="sm" onClick={addRecord}>
              <Plus className="size-3.5" /> {t('ui.add')}
            </Button>
          </>
        }
      >
        <p className="mb-3 text-xs text-slate-500">{t('dns.records.hint', { domain: domain || '—' })}</p>
        <div className="grid grid-cols-[minmax(0,1.3fr)_7rem_minmax(0,1.6fr)_6rem_minmax(0,1.3fr)_auto] items-center gap-2">
          {[t('ui.name'), t('ui.type'), t('ui.value'), 'TTL', t('dns.records.fqdn'), ''].map((h, i) => (
            <span key={i} className="text-xs text-slate-500">
              {h}
            </span>
          ))}
          {config.records.map((r, i) => {
            const problem = problems[i]
            return (
              <div key={r.id} className="contents">
                <Input
                  className="font-mono"
                  placeholder="@"
                  value={r.name}
                  onChange={(e) => setRecord(r.id, { name: e.target.value })}
                />
                <Select value={r.type} onChange={(e) => setRecord(r.id, { type: e.target.value })}>
                  {RECORD_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </Select>
                <Input
                  className={`font-mono ${problem ? 'border-red-500/60' : ''}`}
                  title={problem ? t(problem.key, problem.params) : undefined}
                  placeholder={PLACEHOLDERS[r.type]}
                  value={r.value}
                  onChange={(e) => setRecord(r.id, { value: e.target.value })}
                />
                <Input
                  type="number"
                  min={0}
                  placeholder={String(config.ttl)}
                  value={r.ttl}
                  onChange={(e) => setRecord(r.id, { ttl: e.target.value })}
                />
                <span className="truncate font-mono text-xs text-slate-500" title={absoluteName(r.name, domain)}>
                  {problem ? (
                    <span className="text-red-300">{t(problem.key, problem.params)}</span>
                  ) : (
                    absoluteName(r.name, domain)
                  )}
                </span>
                <Button size="icon" variant="ghost" title={t('ui.remove')} onClick={() => removeRecord(r.id)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            )
          })}
        </div>
      </Card>

      <QueryLog />
    </div>
  )
}
