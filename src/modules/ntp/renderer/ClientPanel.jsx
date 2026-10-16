import { useEffect, useState } from 'react'
import { Play, Send, Square, Trash2 } from 'lucide-react'
import { Button, Card, ErrorBanner, Field, Input, Select, StatusDot } from '@renderer/components/ui'
import { formatTime } from '@shared/i18n'
import { usePersistentState } from '@renderer/module-config'
import { DEFAULT_CLIENT_CONFIG } from '../shared/constants'
import { ntpApi } from './api'
import { formatDateTime, formatOffset } from './format'
import { t } from '../shared/i18n'

/** Lignes du résultat d'une interrogation. */
function details(r) {
  return [
    [t('ntp.client.serverTime'), formatDateTime(r.time)],
    [t('ntp.client.offset'), formatOffset(r.offset)],
    [t('ntp.client.delay'), `${r.delay?.toFixed(2)} ms`],
    [t('ntp.settings.stratum'), r.stratum],
    [t('ntp.settings.leap'), `${r.leap} · ${t(`ntp.leap.${r.leap}`)}`],
    [t('ntp.settings.refId'), r.refId || '—'],
    [t('ntp.client.version'), `NTPv${r.version}`],
    [t('ntp.settings.precision'), `2^${r.precision} s`],
    [t('ntp.client.rootDelay'), `${(r.rootDelay * 1000).toFixed(3)} ms`],
    [t('ntp.client.rootDispersion'), `${(r.rootDispersion * 1000).toFixed(3)} ms`],
    [t('ntp.client.reference'), formatDateTime(r.reference)]
  ]
}

export default function ClientPanel({ status, serverPort }) {
  const [config, setConfig] = usePersistentState('ntp', 'client', DEFAULT_CLIENT_CONFIG)
  const [history, setHistory] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const polling = status.polling
  const update = (patch) => setConfig((c) => ({ ...c, ...patch }))

  useEffect(() => {
    ntpApi.client.history().then(setHistory)
    return ntpApi.client.onResult((r) => setHistory((h) => [...h, r].slice(-200)))
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

  const last = history.at(-1)
  const result = last && !last.error ? last : null

  return (
    <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-2">
      <Card
        id="ntp.client.config"
        title={t('ntp.client.title')}
        className="shrink-0"
        actions={
          <StatusDot
            on={polling}
            label={polling ? t('ntp.client.polling', { seconds: config.pollInterval }) : t('ntp.client.idle')}
          />
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] items-end gap-3">
            <Field label={t('ntp.client.host')}>
              <div className="flex gap-2">
                <Input
                  className="font-mono"
                  value={config.host}
                  disabled={polling}
                  onChange={(e) => update({ host: e.target.value })}
                />
                {serverPort && (config.host !== '127.0.0.1' || config.port !== serverPort) && (
                  <Button
                    className="shrink-0 whitespace-nowrap"
                    disabled={polling}
                    title={t('ntp.client.useLocalHint')}
                    onClick={() => update({ host: '127.0.0.1', port: serverPort })}
                  >
                    {t('ntp.client.useLocal')}
                  </Button>
                )}
              </div>
            </Field>
            <Field label={t('ntp.server.port')}>
              <Input
                type="number"
                value={config.port}
                disabled={polling}
                onChange={(e) => update({ port: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('ntp.client.version')}>
              <Select
                value={config.version}
                disabled={polling}
                onChange={(e) => update({ version: Number(e.target.value) })}
              >
                <option value={4}>NTPv4</option>
                <option value={3}>NTPv3</option>
              </Select>
            </Field>
            <Field label={t('ntp.client.timeout')}>
              <Input
                type="number"
                min={100}
                value={config.timeout}
                disabled={polling}
                onChange={(e) => update({ timeout: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('ntp.client.pollInterval')}>
              <Input
                type="number"
                min={1}
                value={config.pollInterval}
                disabled={polling}
                onChange={(e) => update({ pollInterval: Number(e.target.value) })}
              />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button
              variant="primary"
              disabled={busy || polling || !config.host}
              onClick={() => run(() => ntpApi.client.query(config))}
            >
              <Send className="size-4" /> {t('ntp.client.query')}
            </Button>
            {polling ? (
              <Button variant="danger" onClick={() => run(ntpApi.client.stopPolling)}>
                <Square className="size-4" /> {t('ntp.client.stopPolling')}
              </Button>
            ) : (
              <Button disabled={busy || !config.host} onClick={() => run(() => ntpApi.client.startPolling(config))}>
                <Play className="size-4" /> {t('ntp.client.startPolling')}
              </Button>
            )}
          </div>
          <ErrorBanner error={error} onClose={() => setError(null)} />
        </div>
      </Card>

      {last && (
        <Card
          id="ntp.client.result"
          title={t('ntp.client.result', { server: last.server, time: formatTime(last.at) })}
          className="shrink-0"
        >
          {last.error ? (
            <p className="text-sm text-red-300">{last.error}</p>
          ) : result.kiss ? (
            <p className="text-sm text-amber-300">{t('ntp.client.kiss', { code: result.kiss })}</p>
          ) : (
            <div className="grid grid-cols-2 gap-x-8">
              {details(result).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 border-b border-ink-800 py-1.5 text-sm">
                  <span className="text-slate-400">{label}</span>
                  <span className="font-mono text-slate-200 select-text">{value}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card
        id="ntp.client.history"
        title={t('ntp.client.history', { count: history.length })}
        className="min-h-48 shrink-0"
        actions={
          <Button
            variant="ghost"
            size="icon"
            title={t('ntp.client.clearHistory')}
            onClick={() => ntpApi.client.clearHistory().then(setHistory)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        }
      >
        {history.length ? (
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-ink-900 text-left text-xs text-slate-500">
                <tr>
                  <th className="pb-2 font-medium">{t('ui.timestamp')}</th>
                  <th className="pb-2 font-medium">{t('ntp.client.server')}</th>
                  <th className="pb-2 text-right font-medium">{t('ntp.client.offset')}</th>
                  <th className="pb-2 text-right font-medium">{t('ntp.client.delay')}</th>
                  <th className="pb-2 pl-3 font-medium">{t('ntp.settings.stratum')}</th>
                </tr>
              </thead>
              <tbody className="font-mono text-[13px]">
                {history
                  .slice()
                  .reverse()
                  .map((r, i) => (
                    <tr key={`${r.at}-${i}`} className="border-t border-ink-800">
                      <td className="py-1 text-slate-500 tabular-nums">{formatTime(r.at)}</td>
                      <td className="py-1 text-slate-400">{r.server}</td>
                      {r.error || r.kiss ? (
                        <td
                          colSpan={3}
                          className={`py-1 font-sans text-xs ${r.error ? 'text-red-300' : 'text-amber-300'}`}
                        >
                          {r.error ?? t('ntp.client.kiss', { code: r.kiss })}
                        </td>
                      ) : (
                        <>
                          <td className="py-1 text-right text-sulfur-300 tabular-nums">{formatOffset(r.offset)}</td>
                          <td className="py-1 text-right text-slate-300 tabular-nums">{r.delay.toFixed(2)} ms</td>
                          <td className="py-1 pl-3 text-slate-300">{r.stratum}</td>
                        </>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">{t('ntp.client.noHistory')}</p>
        )}
      </Card>
    </div>
  )
}
