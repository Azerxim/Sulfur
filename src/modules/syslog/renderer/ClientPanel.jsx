import { useEffect, useState } from 'react'
import { Play, Send, Square, Trash2, Unplug } from 'lucide-react'
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
import {
  DEFAULT_CLIENT_CONFIG,
  FACILITIES,
  FORMATS,
  FRAMINGS,
  MAX_BURST,
  MAX_HISTORY,
  SEVERITIES,
  TRANSPORTS
} from '../shared/constants'
import { encodeMessage, fillTemplate } from '../shared/codec'
import { syslogApi } from './api'
import { t } from '../shared/i18n'

/** Port d'écoute du serveur local pour un transport (null s'il n'y écoute pas). */
const localPort = (server, transport) => (server?.[transport]?.enabled ? server[transport].port : null)

export default function ClientPanel({ status, server }) {
  const [config, setConfig] = usePersistentState('syslog', 'client', DEFAULT_CLIENT_CONFIG)
  const [history, setHistory] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const repeating = status.repeating
  const update = (patch) => setConfig((c) => ({ ...c, ...patch }))
  const stream = config.transport !== 'udp'

  useEffect(() => {
    syslogApi.client.history().then(setHistory)
    return syslogApi.client.onSent((entry) => setHistory((h) => [...h, entry].slice(-MAX_HISTORY)))
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

  const hostname = config.hostname?.trim() || status.hostname || 'localhost'
  const preview = encodeMessage({ ...config, hostname, message: fillTemplate(config.message) })
  const serverPort = localPort(server, config.transport)
  const rfc5424 = config.format === 'rfc5424'

  return (
    <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-2">
      <Card
        id="syslog.client.destination"
        title={t('syslog.client.title')}
        className="shrink-0"
        actions={
          <>
            <StatusDot
              on={repeating || status.connected}
              label={
                repeating
                  ? t('syslog.client.repeating', { seconds: status.interval })
                  : status.connected
                    ? t('syslog.client.connected', { destination: status.destination })
                    : t('syslog.client.idle')
              }
            />
            {status.connected && !repeating && (
              <Button
                variant="ghost"
                size="icon"
                title={t('syslog.client.disconnect')}
                onClick={() => run(syslogApi.client.disconnect)}
              >
                <Unplug className="size-3.5" />
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[2fr_1fr_1fr_1.6fr] items-end gap-3">
            <Field label={t('syslog.client.host')}>
              <div className="flex gap-2">
                <Input
                  className="font-mono"
                  value={config.host}
                  disabled={repeating}
                  onChange={(e) => update({ host: e.target.value })}
                />
                {serverPort && (config.host !== '127.0.0.1' || config.port !== serverPort) && (
                  <Button
                    className="shrink-0 whitespace-nowrap"
                    disabled={repeating}
                    title={t('syslog.client.useLocalHint')}
                    onClick={() => update({ host: '127.0.0.1', port: serverPort })}
                  >
                    {t('syslog.client.useLocal')}
                  </Button>
                )}
              </div>
            </Field>
            <Field label={t('syslog.client.port')}>
              <Input
                type="number"
                value={config.port}
                disabled={repeating}
                onChange={(e) => update({ port: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('syslog.client.transport')}>
              <Select
                value={config.transport}
                disabled={repeating}
                onChange={(e) => update({ transport: e.target.value })}
              >
                {TRANSPORTS.map((tr) => (
                  <option key={tr} value={tr}>
                    {t(`syslog.transports.${tr}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('syslog.client.framing')}>
              <Select
                value={config.framing}
                disabled={repeating || !stream}
                onChange={(e) => update({ framing: e.target.value })}
              >
                {FRAMINGS.map((f) => (
                  <option key={f} value={f}>
                    {t(`syslog.framings.${f}`)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {config.transport === 'tls' && (
            <Checkbox
              label={t('syslog.client.rejectUnauthorized')}
              checked={!!config.rejectUnauthorized}
              disabled={repeating}
              onChange={(e) => update({ rejectUnauthorized: e.target.checked })}
            />
          )}
        </div>
      </Card>

      <Card id="syslog.client.message" title={t('syslog.compose.title')} className="shrink-0">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[1fr_1fr_1fr_1.4fr] items-end gap-3">
            <Field label={t('syslog.compose.format')}>
              <Select value={config.format} disabled={repeating} onChange={(e) => update({ format: e.target.value })}>
                {FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {t(`syslog.formats.${f}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('syslog.compose.facility')}>
              <Select
                value={config.facility}
                disabled={repeating}
                onChange={(e) => update({ facility: Number(e.target.value) })}
              >
                {FACILITIES.map((f, i) => (
                  <option key={f} value={i}>
                    {i} · {f}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('syslog.compose.severity')}>
              <Select
                value={config.severity}
                disabled={repeating}
                onChange={(e) => update({ severity: Number(e.target.value) })}
              >
                {SEVERITIES.map((s, i) => (
                  <option key={s} value={i}>
                    {i} · {t(`syslog.severities.${s}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('syslog.compose.hostname')}>
              <Input
                className="font-mono"
                placeholder={t('syslog.compose.hostnameHint', { name: status.hostname ?? '' })}
                value={config.hostname}
                disabled={repeating}
                onChange={(e) => update({ hostname: e.target.value })}
              />
            </Field>
          </div>
          <div className={`grid items-end gap-3 ${rfc5424 ? 'grid-cols-[1fr_1fr_1fr_2fr]' : 'grid-cols-2'}`}>
            <Field label={t('syslog.compose.appName')}>
              <Input
                className="font-mono"
                value={config.appName}
                disabled={repeating}
                onChange={(e) => update({ appName: e.target.value })}
              />
            </Field>
            <Field label={t('syslog.compose.procId')}>
              <Input
                className="font-mono"
                value={config.procId}
                disabled={repeating}
                onChange={(e) => update({ procId: e.target.value })}
              />
            </Field>
            {rfc5424 && (
              <>
                <Field label={t('syslog.compose.msgId')}>
                  <Input
                    className="font-mono"
                    value={config.msgId}
                    disabled={repeating}
                    onChange={(e) => update({ msgId: e.target.value })}
                  />
                </Field>
                <Field label={t('syslog.compose.structuredData')}>
                  <Input
                    className="font-mono"
                    placeholder={t('syslog.compose.structuredDataHint')}
                    value={config.structuredData}
                    disabled={repeating}
                    onChange={(e) => update({ structuredData: e.target.value })}
                  />
                </Field>
              </>
            )}
          </div>
          <Field label={t('syslog.compose.message')}>
            <Input
              placeholder={t('syslog.compose.messageHint')}
              title={t('syslog.compose.messageHint')}
              value={config.message}
              disabled={repeating}
              onChange={(e) => update({ message: e.target.value })}
            />
          </Field>
          <div>
            <div className="mb-1 text-xs text-slate-400">{t('syslog.compose.preview')}</div>
            <div className="rounded-md bg-ink-950 px-3 py-2 font-mono text-xs break-all text-sulfur-300 select-text">
              {preview}
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t('syslog.compose.count')} className="w-36">
              <Input
                type="number"
                min={1}
                max={MAX_BURST}
                value={config.count}
                disabled={repeating}
                onChange={(e) => update({ count: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('syslog.compose.interval')} className="w-28">
              <Input
                type="number"
                min={0.1}
                step={0.1}
                value={config.interval}
                disabled={repeating}
                onChange={(e) => update({ interval: Number(e.target.value) })}
              />
            </Field>
            <Button
              variant="primary"
              disabled={busy || repeating || !config.host}
              onClick={() => run(() => syslogApi.client.send(config))}
            >
              <Send className="size-4" /> {t('syslog.compose.send')}
            </Button>
            {repeating ? (
              <Button variant="danger" onClick={() => run(syslogApi.client.stopRepeat)}>
                <Square className="size-4" /> {t('syslog.compose.stopRepeat')}
              </Button>
            ) : (
              <Button disabled={busy || !config.host} onClick={() => run(() => syslogApi.client.startRepeat(config))}>
                <Play className="size-4" /> {t('syslog.compose.startRepeat')}
              </Button>
            )}
          </div>
          <ErrorBanner error={error} onClose={() => setError(null)} />
        </div>
      </Card>

      <Card
        id="syslog.client.history"
        title={t('syslog.history.title', { count: status.sent ?? 0 })}
        className="min-h-48 shrink-0"
        actions={
          <Button
            variant="ghost"
            size="icon"
            title={t('syslog.history.clear')}
            onClick={() => syslogApi.client.clearHistory().then(setHistory)}
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
                  <th className="pb-2 font-medium">{t('syslog.history.destination')}</th>
                  <th className="pb-2 text-right font-medium">{t('syslog.history.count')}</th>
                  <th className="pb-2 pl-3 font-medium">{t('syslog.history.message')}</th>
                </tr>
              </thead>
              <tbody className="font-mono text-[13px]">
                {history
                  .slice()
                  .reverse()
                  .map((h, i) => (
                    <tr key={`${h.at}-${i}`} className="border-t border-ink-800 align-top">
                      <td className="py-1 pr-3 text-slate-500 tabular-nums">{formatTime(h.at)}</td>
                      <td className="py-1 pr-3 whitespace-nowrap text-slate-400">{h.destination}</td>
                      <td className="py-1 text-right text-slate-300 tabular-nums">{h.count}</td>
                      <td
                        className={`py-1 pl-3 break-all ${h.error ? 'font-sans text-xs text-red-300' : 'text-slate-300'}`}
                      >
                        {h.error ?? h.text}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">{t('syslog.history.empty')}</p>
        )}
      </Card>
    </div>
  )
}
