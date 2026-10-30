import { useEffect, useState } from 'react'
import { Eye, Radar, Send, Trash2, X } from 'lucide-react'
import { Button, Card, Checkbox, ErrorBanner, Field, Input, Select, usePersistentState } from '@azerxim/sulfur-sdk/ui'
import { formatTime } from '@azerxim/sulfur-sdk'
import { CONTENT_FORMATS, METHODS, formatName } from '../shared/codec'
import { DEFAULT_CLIENT_CONFIG, MAX_LOG } from '../shared/constants'
import { coapApi } from './api'
import { t } from '../shared/i18n'

/** Formats proposés pour le contenu envoyé et pour l'option Accept. */
const FORMAT_OPTIONS = Object.keys(CONTENT_FORMATS).map(Number)

const codeTone = (code) => {
  const cls = code >> 5
  return cls === 2 ? 'text-emerald-300' : cls === 4 ? 'text-amber-300' : 'text-red-300'
}

/** Client CoAP : requête, découverte des ressources, observations et historique des échanges. */
export default function ClientPanel({ status, server }) {
  const [config, setConfig] = usePersistentState('coap', 'client', DEFAULT_CLIENT_CONFIG)
  const [history, setHistory] = useState([])
  const [links, setLinks] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (patch) => setConfig((c) => ({ ...c, ...patch }))
  const withBody = config.method === 'POST' || config.method === 'PUT'

  useEffect(() => {
    coapApi.client.history().then(setHistory)
    return coapApi.client.onEntry((entry) => setHistory((list) => [...list, entry].slice(-MAX_LOG)))
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

  return (
    <>
      <Card id="coap.client.request" title={t('coap.client.title')} className="shrink-0">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t('coap.host')} className="w-44">
              <Input className="font-mono" value={config.host} onChange={(e) => set({ host: e.target.value })} />
            </Field>
            <Field label={t('coap.port')} className="w-24">
              <Input
                className="font-mono"
                type="number"
                value={config.port}
                onChange={(e) => set({ port: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('coap.client.method')} className="w-28">
              <Select value={config.method} onChange={(e) => set({ method: e.target.value })}>
                {Object.keys(METHODS).map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
            </Field>
            <Field label={t('coap.server.path')} className="min-w-48 flex-1">
              <Input className="font-mono" value={config.path} onChange={(e) => set({ path: e.target.value })} />
            </Field>
            <Field label={t('coap.client.query')} className="w-44">
              <Input
                className="font-mono"
                value={config.query}
                placeholder="ep=device&lt=300"
                onChange={(e) => set({ query: e.target.value })}
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t('coap.client.accept')} className="w-56">
              <Select
                value={config.accept}
                onChange={(e) => set({ accept: e.target.value === '' ? '' : Number(e.target.value) })}
              >
                <option value="">{t('coap.client.noAccept')}</option>
                {FORMAT_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {formatName(f)}
                  </option>
                ))}
              </Select>
            </Field>
            {withBody && (
              <Field label={t('coap.client.format')} className="w-56">
                <Select value={config.format} onChange={(e) => set({ format: Number(e.target.value) })}>
                  {FORMAT_OPTIONS.map((f) => (
                    <option key={f} value={f}>
                      {formatName(f)}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label={t('coap.client.timeout')} className="w-28">
              <Input type="number" value={config.timeout} onChange={(e) => set({ timeout: Number(e.target.value) })} />
            </Field>
            <Checkbox
              className="h-9"
              label={t('coap.client.confirmable')}
              checked={config.confirmable}
              onChange={(e) => set({ confirmable: e.target.checked })}
            />
            {server && (
              <Button
                size="sm"
                variant="ghost"
                className="h-9"
                onClick={() => set({ host: '127.0.0.1', port: server.port })}
              >
                {t('coap.client.useServer', { port: server.port })}
              </Button>
            )}
          </div>
          {withBody && (
            <Field label={t('coap.client.payload')}>
              <textarea
                rows={3}
                value={config.payload}
                placeholder={config.format === 42 ? '01 02 0A FF' : ''}
                onChange={(e) => set({ payload: e.target.value })}
                className="w-full rounded-md border border-ink-800 bg-ink-950 px-3 py-2 font-mono text-sm text-slate-100 focus:border-sulfur-400 focus:outline-none"
              />
            </Field>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={busy} onClick={() => run(() => coapApi.client.request(config))}>
              <Send className="size-4" /> {t('coap.client.send')}
            </Button>
            <Button
              disabled={busy || config.method !== 'GET'}
              title={t('coap.client.observeHint')}
              onClick={() => run(() => coapApi.client.observe(config))}
            >
              <Eye className="size-4" /> {t('coap.client.observe')}
            </Button>
            <Button
              disabled={busy}
              title={t('coap.client.discoverHint')}
              onClick={() => run(async () => setLinks((await coapApi.client.discover(config)).links))}
            >
              <Radar className="size-4" /> {t('coap.client.discover')}
            </Button>
          </div>
          <ErrorBanner error={error} onClose={() => setError(null)} />
        </div>
      </Card>

      {links && (
        <Card id="coap.client.links" title={t('coap.client.links', { count: links.length })} className="shrink-0">
          {links.length ? (
            <div className="flex flex-wrap gap-2">
              {links.map((link) => (
                <button
                  key={link.href}
                  onClick={() => set({ path: link.href, method: 'GET' })}
                  title={t('coap.client.useLink')}
                  className="flex flex-col items-start rounded-md border border-ink-800 bg-ink-950 px-3 py-1.5 text-left hover:border-sulfur-400/50"
                >
                  <span className="font-mono text-sm text-slate-100">{link.href}</span>
                  <span className="text-xs text-slate-500">
                    {[
                      link.attrs.title,
                      link.attrs.rt,
                      link.attrs.ct !== undefined ? formatName(Number(link.attrs.ct)) : null,
                      link.attrs.obs ? t('coap.client.observableLink') : null
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">{t('coap.client.noLink')}</p>
          )}
        </Card>
      )}

      {status.observations?.length > 0 && (
        <Card
          id="coap.client.observations"
          title={t('coap.client.observations', { count: status.observations.length })}
          className="shrink-0"
        >
          <div className="flex flex-col gap-1.5">
            {status.observations.map((o) => (
              <div key={o.token} className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-mono text-slate-200">{o.uri}</span>
                <span className="font-mono text-sulfur-300">{o.last?.payload}</span>
                <span className="text-xs text-slate-500">
                  {t('coap.client.notifications', { count: o.count, since: formatTime(o.since) })}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => coapApi.client.cancel(o.token).catch((err) => setError(err.message))}
                >
                  <X className="size-3.5" /> {t('coap.client.cancel')}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card
        id="coap.client.history"
        title={t('coap.client.history', { count: history.length })}
        className="min-h-64 flex-1"
        actions={
          <Button
            variant="ghost"
            size="icon"
            title={t('coap.log.clear')}
            onClick={() => coapApi.client.clear().then(setHistory)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        }
      >
        {history.length ? (
          <div className="flex max-h-96 flex-col-reverse overflow-auto">
            <div className="flex flex-col">
              {history.map((e) => (
                <div
                  key={e.id}
                  className="flex flex-col gap-0.5 border-t border-ink-800/60 py-1.5 font-mono text-xs first:border-t-0"
                >
                  <div className="flex flex-wrap items-center gap-x-3">
                    <span className="text-slate-500 tabular-nums">{formatTime(e.time)}</span>
                    <span className={e.notification ? 'text-violet-300' : 'text-sky-300'}>
                      {e.notification ? t('coap.client.notification') : `${e.type} ${e.method}`}
                    </span>
                    <span className="text-slate-200">{e.uri}</span>
                    {e.error ? (
                      <span className="font-sans text-red-300">{e.error}</span>
                    ) : (
                      <>
                        <span className={codeTone(e.code)}>{e.codeName}</span>
                        {e.format && <span className="text-slate-500">{e.format}</span>}
                        {e.observe !== null && e.observe !== undefined && (
                          <span className="text-violet-300">Observe {e.observe}</span>
                        )}
                        {e.notObservable && (
                          <span className="font-sans text-amber-300">{t('coap.client.notObservable')}</span>
                        )}
                        {e.rtt !== undefined && <span className="text-slate-500">{e.rtt} ms</span>}
                      </>
                    )}
                  </div>
                  {e.payload && (
                    <div className="break-all whitespace-pre-wrap text-slate-300 select-text">{e.payload}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">{t('coap.client.empty')}</p>
        )}
      </Card>
    </>
  )
}
