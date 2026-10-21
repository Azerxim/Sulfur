import { useEffect, useState } from 'react'
import { Search, Trash2 } from 'lucide-react'
import { Button, Card, Checkbox, ErrorBanner, Field, Input, Select, usePersistentState } from '@azerxim/sulfur-sdk/ui'
import { formatTime } from '@azerxim/sulfur-sdk'
import { DEFAULT_CLIENT_CONFIG, QUERY_TYPES } from '../shared/constants'
import { dnsApi } from './api'
import { t } from '../shared/i18n'

const RCODE_STYLES = {
  NOERROR: 'bg-emerald-500/15 text-emerald-300',
  NXDOMAIN: 'bg-amber-500/15 text-amber-300'
}

function Section({ title, records }) {
  if (!records.length) return null
  return (
    <div>
      <h3 className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">{title}</h3>
      <table className="w-full text-left font-mono text-xs">
        <tbody>
          {records.map((r, i) => (
            <tr key={i} className="border-t border-ink-800">
              <td className="px-2 py-1 break-all text-slate-300">{r.name}</td>
              <td className="w-16 px-2 py-1 text-slate-500">{r.ttl ?? ''}</td>
              <td className="w-16 px-2 py-1 text-sulfur-300">{r.type}</td>
              <td className="px-2 py-1 break-all text-slate-200 select-text">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Result({ entry }) {
  const flags = Object.entries(entry.flags)
    .filter(([, on]) => on)
    .map(([flag]) => flag)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <span
          className={`rounded px-1.5 py-0.5 font-mono ${RCODE_STYLES[entry.rcode] ?? 'bg-red-500/15 text-red-300'}`}
        >
          {entry.rcode}
        </span>
        <span className="font-mono text-slate-200">
          {entry.name} {entry.type}
        </span>
        <span>
          {t('dns.client.summary', {
            server: entry.server,
            transport: entry.transport.toUpperCase(),
            duration: entry.duration,
            size: entry.size
          })}
        </span>
        {flags.length > 0 && <span className="font-mono">flags: {flags.join(' ')}</span>}
        {entry.truncated && <span className="text-amber-300">{t('dns.client.truncated')}</span>}
      </div>
      <Section title={t('dns.client.answers')} records={entry.answers} />
      <Section title={t('dns.client.authorities')} records={entry.authorities} />
      <Section title={t('dns.client.additionals')} records={entry.additionals} />
      {!entry.answers.length && entry.rcode === 'NOERROR' && (
        <p className="text-xs text-slate-500">{t('dns.client.noData')}</p>
      )}
    </div>
  )
}

export default function ClientPanel({ serverPort }) {
  const [config, setConfig] = usePersistentState('dns', 'client', DEFAULT_CLIENT_CONFIG)
  const [history, setHistory] = useState([])
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const update = (patch) => setConfig((c) => ({ ...c, ...patch }))

  useEffect(() => {
    dnsApi.client.history().then((list) => {
      setHistory(list)
      setSelected(list[0] ?? null)
    })
  }, [])

  // Aligne le port sur le serveur local lorsqu'il démarre.
  useEffect(() => {
    if (serverPort) setConfig((c) => ({ ...c, port: serverPort }))
  }, [serverPort, setConfig])

  async function query() {
    setBusy(true)
    setError(null)
    try {
      const entry = await dnsApi.client.query(config)
      setHistory((list) => [entry, ...list].slice(0, 100))
      setSelected(entry)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-2">
      <Card id="dns.client.query" title={t('dns.client.title')} className="shrink-0">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[1.4fr_0.7fr_2fr_0.8fr_0.8fr_auto] items-end gap-3">
            <Field label={t('dns.client.server')}>
              <Input className="font-mono" value={config.server} onChange={(e) => update({ server: e.target.value })} />
            </Field>
            <Field label={t('dns.server.port')}>
              <Input type="number" value={config.port} onChange={(e) => update({ port: Number(e.target.value) })} />
            </Field>
            <Field label={t('dns.client.name')}>
              <Input
                className="font-mono"
                value={config.name}
                placeholder={config.type === 'PTR' ? '192.168.1.10' : 'plc1.sulfur.local'}
                onChange={(e) => update({ name: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && query()}
              />
            </Field>
            <Field label={t('ui.type')}>
              <Select value={config.type} onChange={(e) => update({ type: e.target.value })}>
                {QUERY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('dns.client.timeout')}>
              <Input
                type="number"
                value={config.timeout}
                onChange={(e) => update({ timeout: Number(e.target.value) })}
              />
            </Field>
            <Button variant="primary" disabled={busy} onClick={query}>
              <Search className="size-4" /> {t('dns.client.query')}
            </Button>
          </div>
          <div className="flex gap-6">
            <Checkbox
              label={t('dns.client.tcp')}
              checked={config.tcp}
              onChange={(e) => update({ tcp: e.target.checked })}
            />
            <Checkbox
              label={t('dns.client.recursion')}
              checked={config.recursion}
              onChange={(e) => update({ recursion: e.target.checked })}
            />
            <span className="text-xs text-slate-500">{t('dns.client.ptrHint')}</span>
          </div>
          <ErrorBanner error={error} onClose={() => setError(null)} />
        </div>
      </Card>

      {selected && (
        <Card id="dns.client.result" title={t('dns.client.result')} className="shrink-0">
          <Result entry={selected} />
        </Card>
      )}

      <Card
        id="dns.client.history"
        title={t('dns.client.history', { count: history.length })}
        className="shrink-0"
        actions={
          <Button
            size="sm"
            variant="ghost"
            disabled={!history.length}
            onClick={() =>
              dnsApi.client.clear().then(() => {
                setHistory([])
                setSelected(null)
              })
            }
          >
            <Trash2 className="size-3.5" /> {t('dns.queries.clear')}
          </Button>
        }
      >
        {history.length ? (
          <div className="flex flex-col">
            {history.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => setSelected(h)}
                className={`grid grid-cols-[5rem_minmax(0,1fr)_4rem_6rem_4rem] gap-2 rounded px-2 py-1 text-left font-mono text-xs ${
                  selected?.id === h.id ? 'bg-ink-800' : 'hover:bg-ink-800/60'
                }`}
              >
                <span className="text-slate-500">{formatTime(h.time)}</span>
                <span className="truncate text-slate-200">{h.name}</span>
                <span className="text-slate-400">{h.type}</span>
                <span className={h.rcode === 'NOERROR' ? 'text-emerald-300' : 'text-amber-300'}>{h.rcode}</span>
                <span className="text-right text-slate-500">{h.answers.length}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-600">{t('dns.client.noHistory')}</p>
        )}
      </Card>
    </div>
  )
}
