import { useEffect, useState } from 'react'
import { Eye, History, Send, X } from 'lucide-react'
import {
  Button,
  Card,
  Checkbox,
  CommitInput,
  ErrorBanner,
  Field,
  Input,
  Select,
  Tabs,
  usePersistentState
} from '@azerxim/sulfur-sdk/ui'
import { formatTime } from '@azerxim/sulfur-sdk'
import { AUTH_TYPES, DEFAULT_CLIENT_CONFIG, DEFAULT_CLIENT_REQUEST, METHODS } from '../shared/constants'
import { httpApi } from './api'
import HeadersEditor from './HeadersEditor'
import { t } from '../shared/i18n'

/** Requêtes conservées dans l'historique de la session. */
const HISTORY = 20
const CONFIGURE_DELAY = 300

/** Les secrets du client (mot de passe, jeton, clé) ne sont pas enregistrés sur le disque. */
const persist = (config) => ({ ...config, auth: { ...config.auth, password: '', token: '', apiKey: '' } })

const statusColor = (status) =>
  status >= 500
    ? 'text-red-300'
    : status >= 400
      ? 'text-amber-300'
      : status >= 300
        ? 'text-sky-300'
        : 'text-emerald-300'

/** Corps de réponse indenté s'il s'agit de JSON. */
function pretty(body) {
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
}

const formatSize = (n) =>
  n < 1024
    ? t('http.units.bytes', { n })
    : n < 1048576
      ? t('http.units.kilobytes', { n: (n / 1024).toFixed(1) })
      : t('http.units.megabytes', { n: (n / 1048576).toFixed(1) })

const formatValue = (v) => {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number' && !Number.isInteger(v)) return Number(v.toPrecision(7)).toString()
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}

function AuthFields({ auth, onChange }) {
  const set = (patch) => onChange({ ...auth, ...patch })
  return (
    <div className="grid grid-cols-[12rem_minmax(0,1fr)_minmax(0,1fr)] items-end gap-3">
      <Field label={t('http.auth.type')}>
        <Select value={auth.type} onChange={(e) => set({ type: e.target.value })}>
          {AUTH_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`http.auth.types.${type}`)}
            </option>
          ))}
        </Select>
      </Field>
      {auth.type === 'basic' && (
        <>
          <Field label={t('http.auth.username')}>
            <Input value={auth.username} onChange={(e) => set({ username: e.target.value })} />
          </Field>
          <Field label={t('http.auth.password')}>
            <Input type="password" value={auth.password} onChange={(e) => set({ password: e.target.value })} />
          </Field>
        </>
      )}
      {auth.type === 'bearer' && (
        <Field className="col-span-2" label={t('http.auth.token')}>
          <Input className="font-mono" value={auth.token} onChange={(e) => set({ token: e.target.value })} />
        </Field>
      )}
      {auth.type === 'apiKey' && (
        <>
          <Field label={t('http.auth.headerName')}>
            <Input
              className="font-mono"
              value={auth.headerName}
              onChange={(e) => set({ headerName: e.target.value })}
            />
          </Field>
          <Field label={t('http.auth.apiKey')}>
            <Input className="font-mono" value={auth.apiKey} onChange={(e) => set({ apiKey: e.target.value })} />
          </Field>
        </>
      )}
    </div>
  )
}

export default function ClientPanel({ status, serverUrl }) {
  const [config, setConfig] = usePersistentState('http', 'client', DEFAULT_CLIENT_CONFIG, { persist })
  const [request, setRequest] = usePersistentState('http', 'clientRequest', DEFAULT_CLIENT_REQUEST)
  const [response, setResponse] = useState(null)
  const [history, setHistory] = useState([])
  const [tab, setTab] = useState('body')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [live, setLive] = useState({})
  const [watch, setWatch] = useState({ label: '', path: '', jsonPath: 'value', writeMethod: '' })

  // La configuration (adresse de base, authentification…) est transmise au process principal.
  useEffect(() => {
    const timer = setTimeout(
      () => httpApi.client.configure(config).catch((err) => setError(err.message)),
      CONFIGURE_DELAY
    )
    return () => clearTimeout(timer)
  }, [config])

  useEffect(() => httpApi.client.onData((d) => setLive((l) => ({ ...l, [d.id]: d }))), [])

  const update = (patch) => setConfig((c) => ({ ...c, ...patch }))
  const updateRequest = (patch) => setRequest((r) => ({ ...r, ...patch }))

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

  const send = () =>
    run(async () => {
      await httpApi.client.configure(config)
      const res = await httpApi.client.send(request)
      setResponse(res)
      setHistory((h) =>
        [{ request, status: res.status, time: res.time, duration: res.duration }, ...h].slice(0, HISTORY)
      )
    })

  const addWatch = () =>
    run(async () => {
      await httpApi.client.configure(config)
      await httpApi.client.addWatch({ ...watch, path: watch.path || request.path })
    })

  return (
    <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-2">
      <Card id="http.client.config" title={t('http.client.title')} className="shrink-0">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,1fr)_auto] items-end gap-3">
            <Field label={t('http.client.baseUrl')}>
              <div className="flex gap-2">
                <Input
                  className="font-mono"
                  value={config.baseUrl}
                  onChange={(e) => update({ baseUrl: e.target.value })}
                />
                {serverUrl && serverUrl !== config.baseUrl && (
                  <Button
                    className="shrink-0 whitespace-nowrap"
                    title={t('http.client.useLocalHint')}
                    onClick={() => update({ baseUrl: serverUrl })}
                  >
                    {t('http.client.useLocal')}
                  </Button>
                )}
              </div>
            </Field>
            <Field label={t('http.client.timeout')}>
              <Input
                type="number"
                min={100}
                value={config.timeout}
                onChange={(e) => update({ timeout: Number(e.target.value) })}
              />
            </Field>
            <Checkbox
              className="mb-2"
              label={t('http.client.allowInsecure')}
              checked={!!config.allowInsecure}
              onChange={(e) => update({ allowInsecure: e.target.checked })}
            />
          </div>
          <AuthFields auth={config.auth} onChange={(auth) => update({ auth })} />
          {config.auth.type !== 'none' && <p className="text-xs text-slate-500">{t('http.client.secretsHint')}</p>}
          <details className="rounded-md border border-ink-800 px-3 py-2">
            <summary className="cursor-pointer text-sm text-slate-300">
              {t('http.client.commonHeaders', { count: config.headers.length })}
            </summary>
            <div className="mt-3">
              <HeadersEditor value={config.headers} onChange={(headers) => update({ headers })} />
            </div>
          </details>
        </div>
      </Card>

      <Card id="http.client.request" title={t('http.client.request')} className="shrink-0">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[8rem_minmax(0,1fr)_auto] gap-2">
            <Select value={request.method} onChange={(e) => updateRequest({ method: e.target.value })}>
              {METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
            <Input
              className="font-mono"
              placeholder="/api/variables"
              value={request.path}
              onChange={(e) => updateRequest({ path: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && send()}
            />
            <Button variant="primary" disabled={busy || !request.path} onClick={send}>
              <Send className="size-4" /> {t('http.client.send')}
            </Button>
          </div>
          <div className="self-start">
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { id: 'body', label: t('http.client.body') },
                { id: 'headers', label: t('http.client.headers', { count: request.headers.length }) },
                { id: 'history', label: t('http.client.history', { count: history.length }), icon: History }
              ]}
            />
          </div>
          {tab === 'body' && (
            <textarea
              rows={5}
              spellCheck={false}
              placeholder={request.method === 'GET' ? t('http.client.noBodyForGet') : '{ "value": 42 }'}
              disabled={request.method === 'GET'}
              value={request.body}
              onChange={(e) => updateRequest({ body: e.target.value })}
              className="w-full resize-y rounded-md border border-ink-700 bg-ink-950 p-2 font-mono text-xs text-slate-100 select-text focus:border-sulfur-500 focus:outline-none disabled:opacity-50"
            />
          )}
          {tab === 'headers' && (
            <HeadersEditor value={request.headers} onChange={(headers) => updateRequest({ headers })} />
          )}
          {tab === 'history' &&
            (history.length ? (
              <table className="w-full text-sm">
                <tbody className="font-mono text-[13px]">
                  {history.map((h, i) => (
                    <tr
                      key={i}
                      className="cursor-pointer border-t border-ink-800 hover:bg-ink-850"
                      title={t('http.client.restore')}
                      onClick={() => {
                        setRequest(h.request)
                        setTab('body')
                      }}
                    >
                      <td className="w-24 py-1 text-slate-500 tabular-nums">{formatTime(h.time)}</td>
                      <td className="w-20 py-1 text-slate-300">{h.request.method}</td>
                      <td className="truncate py-1 text-slate-200">{h.request.path}</td>
                      <td className={`w-16 py-1 text-right ${statusColor(h.status)}`}>{h.status}</td>
                      <td className="w-20 py-1 text-right text-slate-500">{h.duration} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-slate-500">{t('http.client.noHistory')}</p>
            ))}
          <ErrorBanner error={error} onClose={() => setError(null)} />

          {response && (
            <div className="rounded-md border border-ink-800">
              <div className="flex items-center gap-3 border-b border-ink-800 px-3 py-1.5 text-xs">
                <span className={`font-mono font-medium ${statusColor(response.status)}`}>
                  {response.status} {response.statusText}
                </span>
                <span className="text-slate-500">{response.duration} ms</span>
                <span className="text-slate-500">{formatSize(response.size)}</span>
                <span className="truncate font-mono text-slate-500">
                  {response.method} {response.url}
                </span>
                <button className="ml-auto text-slate-500 hover:text-slate-200" onClick={() => setResponse(null)}>
                  ✕
                </button>
              </div>
              <details className="border-b border-ink-800 px-3 py-1.5">
                <summary className="cursor-pointer text-xs text-slate-400">
                  {t('http.client.responseHeaders', { count: Object.keys(response.headers ?? {}).length })}
                </summary>
                <table className="mt-1 text-xs">
                  <tbody className="font-mono">
                    {Object.entries(response.headers ?? {}).map(([k, v]) => (
                      <tr key={k}>
                        <td className="pr-3 text-slate-500">{k}</td>
                        <td className="break-all text-slate-300 select-text">{Array.isArray(v) ? v.join(', ') : v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
              <pre className="max-h-96 overflow-auto p-3 font-mono text-xs break-all whitespace-pre-wrap text-slate-200 select-text">
                {pretty(response.body) || '—'}
                {response.truncated && `\n… ${t('http.client.truncated')}`}
              </pre>
            </div>
          )}
        </div>
      </Card>

      <Card
        id="http.client.watch"
        title={t('ui.monitoring', { count: status.watches?.length ?? 0 })}
        className="min-h-48 shrink-0"
        actions={
          <label className="flex items-center gap-2 text-xs text-slate-400">
            {t('http.client.pollEvery')}
            <CommitInput
              type="number"
              min={100}
              className="h-7! w-20!"
              value={status.pollInterval ?? DEFAULT_CLIENT_CONFIG.pollInterval}
              onCommit={(raw) => {
                update({ pollInterval: Number(raw) })
                run(() => httpApi.client.setPollInterval(Number(raw)))
              }}
            />
            ms
          </label>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)_8rem_auto] items-end gap-2">
            <Field label={t('http.client.label')}>
              <Input value={watch.label} onChange={(e) => setWatch((w) => ({ ...w, label: e.target.value }))} />
            </Field>
            <Field label={t('http.client.watchPath')}>
              <Input
                className="font-mono"
                placeholder={request.path}
                value={watch.path}
                onChange={(e) => setWatch((w) => ({ ...w, path: e.target.value }))}
              />
            </Field>
            <Field label={t('http.client.jsonPath')}>
              <Input
                className="font-mono"
                placeholder="data.value"
                value={watch.jsonPath}
                onChange={(e) => setWatch((w) => ({ ...w, jsonPath: e.target.value }))}
              />
            </Field>
            <Field label={t('http.client.writeMethod')}>
              <Select
                value={watch.writeMethod}
                onChange={(e) => setWatch((w) => ({ ...w, writeMethod: e.target.value }))}
              >
                <option value="">—</option>
                {['PUT', 'POST', 'PATCH'].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
            </Field>
            <Button
              disabled={busy || !(watch.path || request.path)}
              title={t('http.client.watchHint')}
              onClick={addWatch}
            >
              <Eye className="size-4" /> {t('http.client.watch')}
            </Button>
          </div>
          {status.watches?.length ? (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="pb-2 font-medium">{t('http.client.label')}</th>
                  <th className="pb-2 font-medium">{t('http.client.watchPath')}</th>
                  <th className="pb-2 font-medium">{t('ui.value')}</th>
                  <th className="pb-2 font-medium">{t('ui.timestamp')}</th>
                  <th />
                </tr>
              </thead>
              <tbody className="font-mono text-[13px]">
                {status.watches.map((w) => {
                  const d = live[w.id]
                  return (
                    <tr key={w.id} className="border-t border-ink-800">
                      <td className="py-1.5 pr-3 font-sans text-slate-300">{w.label || '—'}</td>
                      <td className="py-1.5 pr-3 text-slate-400">
                        {w.path}
                        {w.jsonPath && <span className="text-slate-500"> · {w.jsonPath}</span>}
                        {w.writeMethod && (
                          <span className="ml-2 font-sans text-xs text-slate-500">{w.writeMethod}</span>
                        )}
                      </td>
                      <td
                        className={`py-1.5 pr-3 tabular-nums ${d?.error ? 'font-sans text-xs text-red-300' : 'text-sulfur-300'}`}
                      >
                        {d ? (d.error ?? formatValue(d.value)) : '—'}
                      </td>
                      <td className="py-1.5 pr-3 text-slate-400 tabular-nums">{d ? formatTime(d.time) : '—'}</td>
                      <td className="py-1.5 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          title={t('ui.remove2')}
                          onClick={() => run(() => httpApi.client.removeWatch(w.id))}
                        >
                          <X className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-slate-500">{t('http.client.noWatch')}</p>
          )}
        </div>
      </Card>
    </div>
  )
}
