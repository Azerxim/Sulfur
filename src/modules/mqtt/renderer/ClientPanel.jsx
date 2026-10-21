import { useEffect, useRef, useState } from 'react'
import { Plug, Plus, Send, Unplug, X } from 'lucide-react'
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
import { DEFAULT_CLIENT_CONFIG, MAX_LOG, PROTOCOL_VERSIONS, QOS_LEVELS } from '../shared/constants'
import { isValidFilter } from '../shared/topics'
import { mqttApi } from './api'
import MessageLog from './MessageLog'
import { t } from '../shared/i18n'

/** Délai avant d'appliquer les abonnements modifiés pendant la connexion. */
const LIVE_DEBOUNCE = 500

const formatValue = (v) => {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number' && !Number.isInteger(v)) return Number(v.toFixed(4)).toString()
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}

function QosSelect({ value, disabled, onChange }) {
  return (
    <Select value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))}>
      {QOS_LEVELS.map((q) => (
        <option key={q} value={q}>
          {q}
        </option>
      ))}
    </Select>
  )
}

function ConnectionCard({ config, update, status, server, busy, run }) {
  const connected = status.connected
  const locked = !!status.connecting || connected || busy
  const will = { ...DEFAULT_CLIENT_CONFIG.will, ...config.will }
  const setWill = (patch) => update({ will: { ...will, ...patch } })
  const local = server && (config.host !== '127.0.0.1' || config.port !== server.port || !!config.tls !== !!server.tls)

  return (
    <Card
      id="mqtt.client.connection"
      title={t('mqtt.client.title')}
      className="shrink-0"
      actions={
        <>
          <StatusDot
            on={connected}
            label={
              connected
                ? t('mqtt.client.connectedTo', { url: status.url, clientId: status.clientId })
                : status.connecting
                  ? t('mqtt.client.connecting')
                  : t('ui.disconnected')
            }
          />
          {status.connecting || connected ? (
            <Button variant="danger" size="sm" onClick={() => run(mqttApi.client.disconnect)}>
              <Unplug className="size-3.5" /> {t('ui.disconnect')}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              disabled={busy || !config.host}
              onClick={() => run(() => mqttApi.client.connect(config))}
            >
              <Plug className="size-3.5" /> {busy ? t('ui.connecting') : t('ui.connect')}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-[2fr_1fr_1fr_1.4fr] items-end gap-3">
          <Field label={t('mqtt.client.host')}>
            <div className="flex gap-2">
              <Input
                className="font-mono"
                value={config.host}
                disabled={locked}
                onChange={(e) => update({ host: e.target.value })}
              />
              {local && (
                <Button
                  className="shrink-0 whitespace-nowrap"
                  disabled={locked}
                  title={t('mqtt.client.useLocalHint')}
                  onClick={() => update({ host: '127.0.0.1', port: server.port, tls: !!server.tls })}
                >
                  {t('mqtt.client.useLocal')}
                </Button>
              )}
            </div>
          </Field>
          <Field label={t('mqtt.client.port')}>
            <Input
              type="number"
              value={config.port}
              disabled={locked}
              onChange={(e) => update({ port: Number(e.target.value) })}
            />
          </Field>
          <Field label={t('mqtt.client.version')}>
            <Select
              value={config.protocolVersion}
              disabled={locked}
              onChange={(e) => update({ protocolVersion: Number(e.target.value) })}
            >
              {PROTOCOL_VERSIONS.map((v) => (
                <option key={v} value={v}>
                  {t(`mqtt.versions.${v}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('mqtt.client.clientId')}>
            <Input
              className="font-mono"
              placeholder={t('mqtt.client.clientIdHint')}
              value={config.clientId}
              disabled={locked}
              onChange={(e) => update({ clientId: e.target.value })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-[1fr_1fr_8rem] items-end gap-3">
          <Field label={t('mqtt.client.username')}>
            <Input value={config.username} disabled={locked} onChange={(e) => update({ username: e.target.value })} />
          </Field>
          <Field label={t('mqtt.client.password')}>
            <Input
              type="password"
              autoComplete="off"
              title={t('mqtt.client.passwordHint')}
              value={config.password}
              disabled={locked}
              onChange={(e) => update({ password: e.target.value })}
            />
          </Field>
          <Field label={t('mqtt.client.keepalive')}>
            <Input
              type="number"
              min={0}
              value={config.keepalive}
              disabled={locked}
              onChange={(e) => update({ keepalive: Number(e.target.value) })}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <Checkbox
            label={t('mqtt.client.tls')}
            checked={!!config.tls}
            disabled={locked}
            onChange={(e) => update({ tls: e.target.checked })}
          />
          {config.tls && (
            <Checkbox
              label={t('mqtt.client.rejectUnauthorized')}
              checked={!!config.rejectUnauthorized}
              disabled={locked}
              onChange={(e) => update({ rejectUnauthorized: e.target.checked })}
            />
          )}
          <Checkbox
            label={t('mqtt.client.clean')}
            checked={!!config.clean}
            disabled={locked}
            onChange={(e) => update({ clean: e.target.checked })}
          />
          <Checkbox
            label={t('mqtt.client.autoReconnect')}
            checked={!!config.autoReconnect}
            disabled={locked}
            onChange={(e) => update({ autoReconnect: e.target.checked })}
          />
        </div>
        <div className="flex flex-col gap-2 rounded-md border border-ink-800 p-3">
          <Checkbox
            label={t('mqtt.client.willEnabled')}
            checked={!!will.enabled}
            disabled={locked}
            onChange={(e) => setWill({ enabled: e.target.checked })}
          />
          {will.enabled && (
            <div className="grid grid-cols-[2fr_2fr_5rem_auto] items-end gap-3">
              <Field label={t('mqtt.publish.topic')}>
                <Input
                  className="font-mono"
                  value={will.topic}
                  disabled={locked}
                  onChange={(e) => setWill({ topic: e.target.value })}
                />
              </Field>
              <Field label={t('mqtt.publish.payload')}>
                <Input
                  className="font-mono"
                  value={will.payload}
                  disabled={locked}
                  onChange={(e) => setWill({ payload: e.target.value })}
                />
              </Field>
              <Field label={t('mqtt.publish.qos')}>
                <QosSelect value={will.qos} disabled={locked} onChange={(qos) => setWill({ qos })} />
              </Field>
              <Checkbox
                className="mb-2"
                label={t('mqtt.publish.retain')}
                checked={!!will.retain}
                disabled={locked}
                onChange={(e) => setWill({ retain: e.target.checked })}
              />
            </div>
          )}
          <p className="text-xs text-slate-500">{t('mqtt.client.willHint')}</p>
        </div>
        {status.error && !connected && <ErrorBanner error={status.error} />}
      </div>
    </Card>
  )
}

function SubscriptionsCard({ config, update, status, last, onError }) {
  const timer = useRef(null)
  const subscriptions = config.subscriptions ?? []
  const granted = Object.fromEntries((status.subscriptions ?? []).map((s) => [s.id, s.granted]))

  const set = (list) => {
    update({ subscriptions: list })
    if (!status.connected || !list.every((s) => isValidFilter(s.topic))) return
    clearTimeout(timer.current)
    timer.current = setTimeout(
      () => mqttApi.client.setSubscriptions(list).catch((err) => onError(err.message)),
      LIVE_DEBOUNCE
    )
  }
  const change = (id, patch) => set(subscriptions.map((s) => (s.id === id ? { ...s, ...patch } : s)))

  return (
    <Card
      id="mqtt.client.subscriptions"
      title={t('mqtt.subscriptions.title', { count: subscriptions.length })}
      className="shrink-0"
      actions={
        <Button
          size="sm"
          onClick={() => set([...subscriptions, { id: crypto.randomUUID(), topic: 'sulfur/#', qos: 0, field: '' }])}
        >
          <Plus className="size-3.5" /> {t('ui.add')}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="px-1.5 pb-2 font-medium">{t('mqtt.subscriptions.topic')}</th>
              <th className="px-1.5 pb-2 font-medium">{t('mqtt.subscriptions.qos')}</th>
              <th className="px-1.5 pb-2 font-medium">{t('mqtt.subscriptions.field')}</th>
              <th className="px-1.5 pb-2 font-medium">{t('mqtt.subscriptions.granted')}</th>
              <th className="px-1.5 pb-2 font-medium">{t('mqtt.subscriptions.last')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {subscriptions.map((s) => {
              const g = granted[s.id]
              return (
                <tr key={s.id} className="align-middle">
                  <td className="p-1.5">
                    <Input
                      className={`font-mono ${isValidFilter(s.topic) ? '' : 'border-red-500/60'}`}
                      value={s.topic}
                      onChange={(e) => change(s.id, { topic: e.target.value })}
                    />
                  </td>
                  <td className="w-20 p-1.5">
                    <QosSelect value={s.qos} onChange={(qos) => change(s.id, { qos })} />
                  </td>
                  <td className="w-40 p-1.5">
                    <Input
                      className="font-mono"
                      placeholder="value"
                      title={t('mqtt.subscriptions.fieldHint')}
                      value={s.field ?? ''}
                      onChange={(e) => change(s.id, { field: e.target.value })}
                    />
                  </td>
                  <td className="w-24 p-1.5 font-mono text-xs">
                    {!status.connected ? (
                      <span className="text-slate-600">—</span>
                    ) : g === null || g === undefined ? (
                      <span className="text-slate-500">{t('mqtt.subscriptions.pending')}</span>
                    ) : g === 128 ? (
                      <span className="text-red-300">{t('mqtt.subscriptions.refused')}</span>
                    ) : (
                      <span className="text-emerald-300">QoS {g}</span>
                    )}
                  </td>
                  <td className="max-w-80 p-1.5 font-mono text-sm break-all text-sulfur-300">
                    {formatValue(last[s.id]?.value)}
                  </td>
                  <td className="w-10 p-1.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      title={t('ui.remove')}
                      onClick={() => set(subscriptions.filter((x) => x.id !== s.id))}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="text-xs text-slate-500">{t('mqtt.subscriptions.hint')}</p>
      </div>
    </Card>
  )
}

function PublishCard({ config, update, connected, run }) {
  const message = { ...DEFAULT_CLIENT_CONFIG.publish, ...config.publish }
  const set = (patch) => update({ publish: { ...message, ...patch } })
  return (
    <Card id="mqtt.client.publish" title={t('mqtt.publish.title')} className="shrink-0">
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-[2fr_5rem_auto] items-end gap-3">
          <Field label={t('mqtt.publish.topic')}>
            <Input className="font-mono" value={message.topic} onChange={(e) => set({ topic: e.target.value })} />
          </Field>
          <Field label={t('mqtt.publish.qos')}>
            <QosSelect value={message.qos} onChange={(qos) => set({ qos })} />
          </Field>
          <Checkbox
            className="mb-2"
            label={t('mqtt.publish.retain')}
            checked={!!message.retain}
            onChange={(e) => set({ retain: e.target.checked })}
          />
        </div>
        <Field label={t('mqtt.publish.payload')}>
          <textarea
            rows={3}
            className="w-full rounded-md border border-ink-700 bg-ink-950 px-3 py-2 font-mono text-sm text-slate-100 focus:border-sulfur-500 focus:outline-none"
            value={message.payload}
            onChange={(e) => set({ payload: e.target.value })}
          />
        </Field>
        <div>
          <Button
            variant="primary"
            disabled={!connected || !message.topic}
            onClick={() => run(() => mqttApi.client.publish(message))}
          >
            <Send className="size-4" /> {t('mqtt.publish.send')}
          </Button>
        </div>
      </div>
    </Card>
  )
}

export default function ClientPanel({ status, server }) {
  const [config, setConfig] = usePersistentState('mqtt', 'client', DEFAULT_CLIENT_CONFIG)
  const [messages, setMessages] = useState([])
  const [last, setLast] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const update = (patch) => setConfig((c) => ({ ...c, ...patch }))

  useEffect(() => {
    mqttApi.client.messages().then((data) => {
      setMessages(data.messages)
      setLast(data.last)
    })
    return mqttApi.client.onMessages((batch) => {
      setMessages((m) => [...m, ...batch.messages].slice(-MAX_LOG))
      setLast(batch.last)
    })
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
    <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-2">
      <ConnectionCard config={config} update={update} status={status} server={server} busy={busy} run={run} />
      <ErrorBanner error={error} onClose={() => setError(null)} />
      <SubscriptionsCard config={config} update={update} status={status} last={last} onError={setError} />
      <PublishCard config={config} update={update} connected={status.connected} run={run} />
      <MessageLog
        id="mqtt.client.messages"
        title={t('mqtt.received.title', { count: status.received ?? 0 })}
        entries={messages}
        emptyLabel={t('mqtt.received.empty')}
        clearLabel={t('mqtt.received.clear')}
        onClear={() => mqttApi.client.clearMessages().then(setMessages)}
      />
    </div>
  )
}
