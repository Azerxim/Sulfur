import { Fragment, useEffect, useMemo, useState } from 'react'
import { Copy, Lock, Pause, Play, Square, Trash2 } from 'lucide-react'
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
import { DEFAULT_SERVER_CONFIG, FACILITIES, MAX_MESSAGES, SEVERITIES, TRANSPORTS } from '../shared/constants'
import { parseStructuredData } from '../shared/codec'
import { syslogApi } from './api'
import { t } from '../shared/i18n'

/** Messages affichés au plus (les plus récents). */
const MAX_SHOWN = 500

/** Couleur d'une gravité (0 urgence … 7 débogage). */
const SEVERITY_COLORS = [
  'text-red-400',
  'text-red-400',
  'text-red-300',
  'text-red-300',
  'text-amber-300',
  'text-sky-300',
  'text-slate-300',
  'text-slate-500'
]

const SEVERITY_BARS = [
  'bg-red-500',
  'bg-red-500',
  'bg-red-400',
  'bg-red-400',
  'bg-amber-400',
  'bg-sky-400',
  'bg-slate-400',
  'bg-slate-600'
]

function Stats({ status }) {
  const counts = status.counts?.length ? status.counts : SEVERITIES.map(() => 0)
  const max = Math.max(1, ...counts)
  return (
    <Card id="syslog.server.stats" title={t('syslog.stats.title')} className="shrink-0" defaultCollapsed>
      <div className="grid grid-cols-[9rem_minmax(0,1fr)_4rem] items-center gap-x-3 gap-y-1.5 text-sm">
        {SEVERITIES.map((s, i) => (
          <Fragment key={s}>
            <span className={SEVERITY_COLORS[i]}>
              {i} · {t(`syslog.severities.${s}`)}
            </span>
            <div className="h-2 rounded bg-ink-950">
              <div className={`h-2 rounded ${SEVERITY_BARS[i]}`} style={{ width: `${(counts[i] / max) * 100}%` }} />
            </div>
            <span className="text-right font-mono text-slate-300 tabular-nums">{counts[i]}</span>
          </Fragment>
        ))}
        <span className="text-slate-400">{t('syslog.stats.total')}</span>
        <span />
        <span className="text-right font-mono text-slate-200 tabular-nums">{status.total ?? 0}</span>
      </div>
    </Card>
  )
}

function MessageDetails({ m }) {
  const sd = parseStructuredData(m.structuredData)
  const rows = [
    [t('syslog.messages.format'), t(`syslog.formats.${m.format}`)],
    [t('syslog.messages.timestamp'), m.timestamp ?? '—'],
    [t('syslog.messages.procId'), m.procId || '—'],
    [t('syslog.messages.msgId'), m.msgId || '—']
  ]
  return (
    <div className="flex flex-col gap-2 rounded-md bg-ink-950 px-3 py-2 text-xs">
      <div className="grid grid-cols-4 gap-3">
        {rows.map(([label, value]) => (
          <div key={label}>
            <div className="text-slate-500">{label}</div>
            <div className="font-mono break-all text-slate-300 select-text">{value}</div>
          </div>
        ))}
      </div>
      {sd.length > 0 && (
        <div>
          <div className="text-slate-500">{t('syslog.messages.structuredData')}</div>
          {sd.map((el, i) => (
            <div key={i} className="font-mono text-slate-300 select-text">
              <span className="text-sulfur-300">{el.id}</span>{' '}
              {Object.entries(el.params)
                .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                .join(' ')}
            </div>
          ))}
        </div>
      )}
      <div>
        <div className="text-slate-500">{t('syslog.messages.raw')}</div>
        <div className="font-mono break-all whitespace-pre-wrap text-slate-400 select-text">{m.raw}</div>
      </div>
    </div>
  )
}

function Messages({ status }) {
  const [messages, setMessages] = useState([])
  const [minSeverity, setMinSeverity] = useState(7)
  const [search, setSearch] = useState('')
  const [paused, setPaused] = useState(false)
  const [frozen, setFrozen] = useState(null)
  const [open, setOpen] = useState(null)

  useEffect(() => {
    syslogApi.server.messages().then(setMessages)
    return syslogApi.server.onMessages((batch) => setMessages((list) => [...list, ...batch].slice(-MAX_MESSAGES)))
  }, [])

  const source = paused && frozen ? frozen : messages
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return source.filter(
      (m) =>
        m.severity <= minSeverity &&
        (!needle || [m.message, m.hostname, m.appName, m.address].some((v) => v?.toLowerCase().includes(needle)))
    )
  }, [source, minSeverity, search])
  const shown = filtered.slice(-MAX_SHOWN).reverse()

  const togglePause = () => {
    setFrozen(paused ? null : messages)
    setPaused(!paused)
  }

  return (
    <Card
      id="syslog.server.messages"
      title={t('syslog.messages.title', { count: messages.length })}
      className="min-h-64 shrink-0"
      actions={
        <>
          {paused && <span className="text-xs text-amber-300">{t('syslog.messages.paused')}</span>}
          <Button
            variant="ghost"
            size="icon"
            title={paused ? t('syslog.messages.resume') : t('syslog.messages.pause')}
            onClick={togglePause}
          >
            {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title={t('syslog.messages.clear')}
            onClick={() =>
              syslogApi.server.clear().then((list) => {
                setMessages(list)
                setFrozen(paused ? list : null)
              })
            }
          >
            <Trash2 className="size-3.5" />
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-[14rem_minmax(0,1fr)_auto] items-end gap-3">
          <Field label={t('syslog.messages.minSeverity')}>
            <Select value={minSeverity} onChange={(e) => setMinSeverity(Number(e.target.value))}>
              {SEVERITIES.map((s, i) => (
                <option key={s} value={i}>
                  {i === 7 ? t('syslog.messages.allSeverities') : `≤ ${i} · ${t(`syslog.severities.${s}`)}`}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('syslog.messages.search')}>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} />
          </Field>
          <span className="mb-2 text-xs text-slate-500">
            {t('syslog.messages.shown', { shown: shown.length, count: filtered.length })}
          </span>
        </div>
        {shown.length ? (
          <div className="max-h-[32rem] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-ink-900 text-left text-xs text-slate-500">
                <tr>
                  <th className="pb-2 font-medium">{t('syslog.messages.received')}</th>
                  <th className="pb-2 font-medium">{t('syslog.messages.source')}</th>
                  <th className="pb-2 font-medium">{t('syslog.messages.facility')}</th>
                  <th className="pb-2 font-medium">{t('syslog.messages.severity')}</th>
                  <th className="pb-2 font-medium">{t('syslog.messages.host')}</th>
                  <th className="pb-2 font-medium">{t('syslog.messages.app')}</th>
                  <th className="pb-2 font-medium">{t('syslog.messages.message')}</th>
                </tr>
              </thead>
              <tbody className="font-mono text-[13px]">
                {shown.map((m) => (
                  <Fragment key={m.id}>
                    <tr
                      className="cursor-pointer border-t border-ink-800 align-top hover:bg-ink-800/40"
                      title={t('syslog.messages.details')}
                      onClick={() => setOpen(open === m.id ? null : m.id)}
                    >
                      <td className="py-1 pr-3 whitespace-nowrap text-slate-500 tabular-nums">
                        {formatTime(m.received)}
                      </td>
                      <td className="py-1 pr-3 whitespace-nowrap text-slate-400">
                        {m.address} <span className="text-slate-600">{m.transport.toUpperCase()}</span>
                      </td>
                      <td className="py-1 pr-3 text-slate-400">{FACILITIES[m.facility]}</td>
                      <td className={`py-1 pr-3 whitespace-nowrap ${SEVERITY_COLORS[m.severity]}`}>
                        {SEVERITIES[m.severity]}
                      </td>
                      <td className="py-1 pr-3 text-slate-300">{m.hostname || '—'}</td>
                      <td className="py-1 pr-3 text-slate-300">
                        {m.appName || '—'}
                        {m.procId && <span className="text-slate-500">[{m.procId}]</span>}
                      </td>
                      <td className="py-1 break-all text-slate-200 select-text">{m.message}</td>
                    </tr>
                    {open === m.id && (
                      <tr>
                        <td colSpan={7} className="pb-2">
                          <MessageDetails m={m} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            {messages.length
              ? t('syslog.messages.noMatch')
              : status.running
                ? t('syslog.messages.none')
                : t('syslog.messages.stopped')}
          </p>
        )}
      </div>
    </Card>
  )
}

export default function ServerPanel({ status }) {
  const [config, setConfig] = usePersistentState('syslog', 'server', status.config ?? DEFAULT_SERVER_CONFIG)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const running = status.running
  const locked = running || busy

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
  const setTransport = (tr, patch) =>
    setConfig((c) => ({ ...c, [tr]: { ...DEFAULT_SERVER_CONFIG[tr], ...c[tr], ...patch } }))

  return (
    <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-2">
      <Card
        id="syslog.server.config"
        title={t('syslog.server.title')}
        className="shrink-0"
        actions={
          <>
            <StatusDot
              on={running}
              label={running ? t('syslog.server.running', { count: status.total ?? 0 }) : t('ui.stopped')}
            />
            {running ? (
              <Button variant="danger" size="sm" disabled={busy} onClick={() => run(syslogApi.server.stop)}>
                <Square className="size-3.5" /> {t('ui.stop')}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                disabled={busy}
                onClick={() => run(() => syslogApi.server.start(config))}
              >
                <Play className="size-3.5" /> {busy ? t('ui.starting') : t('ui.start')}
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr] items-end gap-4">
            <Field label={t('syslog.server.host')}>
              <Input
                value={config.host}
                disabled={locked}
                onChange={(e) => setConfig((c) => ({ ...c, host: e.target.value }))}
              />
            </Field>
            {TRANSPORTS.map((tr) => {
              const settings = { ...DEFAULT_SERVER_CONFIG[tr], ...config[tr] }
              return (
                <div key={tr} className="flex flex-col gap-1.5">
                  <Checkbox
                    label={`${t(`syslog.transports.${tr}`)} · ${t('syslog.server.port')}`}
                    className="text-xs"
                    checked={!!settings.enabled}
                    disabled={locked}
                    onChange={(e) => setTransport(tr, { enabled: e.target.checked })}
                  />
                  <Input
                    type="number"
                    value={settings.port}
                    disabled={locked || !settings.enabled}
                    onChange={(e) => setTransport(tr, { port: Number(e.target.value) })}
                  />
                </div>
              )
            })}
          </div>
          <p className="text-xs text-slate-500">{t('syslog.server.portsHint')}</p>
          {status.endpoints?.length > 0 && (
            <div className="flex flex-col gap-1 rounded-md bg-ink-950 px-3 py-2 font-mono text-sm text-sulfur-300">
              {status.endpoints.map((endpoint) => (
                <div key={endpoint} className="flex items-center gap-2">
                  {endpoint.startsWith('tls') && <Lock className="size-3.5 text-emerald-400" />}
                  {endpoint}
                  {endpoint.startsWith('tls') && status.certificate && (
                    <span className="font-sans text-xs text-slate-500">
                      · {t('syslog.server.certificate', { name: status.certificate.commonName })} ·{' '}
                      {status.certificate.thumbprint.slice(0, 16)}…
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto"
                    title={t('ui.copy')}
                    onClick={() => navigator.clipboard.writeText(endpoint)}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                </div>
              ))}
              <div className="font-sans text-xs text-slate-500">
                {t('syslog.server.connections', { count: status.connections ?? 0 })}
                {status.cut && <span className="text-amber-300"> · {t('syslog.server.cut')}</span>}
              </div>
            </div>
          )}
          <ErrorBanner error={error} onClose={() => setError(null)} />
        </div>
      </Card>

      <Stats status={status} />
      <Messages status={status} />
    </div>
  )
}
