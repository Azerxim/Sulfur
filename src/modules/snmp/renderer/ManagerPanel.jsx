import { useEffect, useState } from 'react'
import { Ear, Eye, Play, Plus, Send, Square, Trash2, X } from 'lucide-react'
import { Button, Card, ErrorBanner, Field, Input, Select, StatusDot } from '@renderer/components/ui'
import { formatTime } from '@shared/i18n'
import { usePersistentState } from '@renderer/module-config'
import { DEFAULT_MANAGER_CONFIG, MAX_TRAPS, MAX_WALK, OBJECT_TYPES, OPERATIONS, VERSIONS } from '../shared/constants'
import { snmpApi } from './api'
import UserFields from './UserFields'
import { t } from '../shared/i18n'

const formatValue = (v) => (v === null || v === undefined ? '—' : String(v))

function TargetCard({ config, update, agent, locked }) {
  const user = { ...DEFAULT_MANAGER_CONFIG.user, ...config.user }
  const local = agent && (config.host !== '127.0.0.1' || config.port !== agent.port)
  return (
    <Card id="snmp.manager.target" title={t('snmp.manager.title')} className="shrink-0">
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-[2fr_1fr_1fr_1.2fr_1fr_1fr] items-end gap-3">
          <Field label={t('snmp.manager.host')}>
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
                  title={t('snmp.manager.useLocalHint')}
                  onClick={() => update({ host: '127.0.0.1', port: agent.port })}
                >
                  {t('snmp.manager.useLocal')}
                </Button>
              )}
            </div>
          </Field>
          <Field label={t('snmp.manager.port')}>
            <Input
              type="number"
              value={config.port}
              disabled={locked}
              onChange={(e) => update({ port: Number(e.target.value) })}
            />
          </Field>
          <Field label={t('snmp.manager.version')}>
            <Select value={config.version} disabled={locked} onChange={(e) => update({ version: e.target.value })}>
              {VERSIONS.map((v) => (
                <option key={v} value={v}>
                  {t(`snmp.versions.${v}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('snmp.manager.community')}>
            <Input
              value={config.community}
              disabled={locked || config.version === 'v3'}
              onChange={(e) => update({ community: e.target.value })}
            />
          </Field>
          <Field label={t('snmp.manager.timeout')}>
            <Input
              type="number"
              min={100}
              value={config.timeout}
              disabled={locked}
              onChange={(e) => update({ timeout: Number(e.target.value) })}
            />
          </Field>
          <Field label={t('snmp.manager.retries')}>
            <Input
              type="number"
              min={0}
              value={config.retries}
              disabled={locked}
              onChange={(e) => update({ retries: Number(e.target.value) })}
            />
          </Field>
        </div>
        {config.version === 'v3' && (
          <div>
            <div className="mb-1.5 text-xs text-slate-400">{t('snmp.manager.user')}</div>
            <div className="grid grid-cols-[1fr_1.4fr_6rem_1fr_6rem_1fr] gap-2">
              <UserFields user={user} disabled={locked} onChange={(patch) => update({ user: { ...user, ...patch } })} />
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

function RequestCard({ config, update, onMonitor }) {
  const request = { ...DEFAULT_MANAGER_CONFIG.request, ...config.request }
  const set = (patch) => update({ request: { ...request, ...patch } })
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function send() {
    setBusy(true)
    setError(null)
    try {
      setResult(await snmpApi.manager.request(config, request))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const isSet = request.operation === 'set'
  return (
    <Card id="snmp.manager.request" title={t('snmp.request.title')} className="shrink-0">
      <div className="flex flex-col gap-3">
        <div
          className={`grid items-end gap-3 ${isSet ? 'grid-cols-[9rem_2fr_9rem_1.4fr_auto]' : 'grid-cols-[9rem_2fr_7rem_auto]'}`}
        >
          <Field label={t('snmp.request.operation')}>
            <Select value={request.operation} onChange={(e) => set({ operation: e.target.value })}>
              {OPERATIONS.map((op) => (
                <option key={op} value={op}>
                  {t(`snmp.operations.${op}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('snmp.request.oid')}>
            <Input
              className="font-mono"
              title={t('snmp.request.oidHint')}
              value={request.oid}
              onChange={(e) => set({ oid: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && send()}
            />
          </Field>
          {isSet ? (
            <>
              <Field label={t('snmp.request.type')}>
                <Select value={request.type} onChange={(e) => set({ type: e.target.value })}>
                  {OBJECT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('snmp.request.value')}>
                <Input className="font-mono" value={request.value} onChange={(e) => set({ value: e.target.value })} />
              </Field>
            </>
          ) : (
            <Field label={t('snmp.request.maxRepetitions')}>
              <Input
                type="number"
                min={1}
                max={100}
                value={request.maxRepetitions}
                disabled={!['getBulk', 'walk'].includes(request.operation)}
                onChange={(e) => set({ maxRepetitions: Number(e.target.value) })}
              />
            </Field>
          )}
          <Button variant="primary" disabled={busy || !config.host || !request.oid} onClick={send}>
            <Send className="size-4" /> {t('snmp.request.send')}
          </Button>
        </div>
        <ErrorBanner error={error} onClose={() => setError(null)} />
        {result && (
          <div>
            <div className="mb-1.5 text-xs text-slate-400">
              {t('snmp.request.results', { count: result.varbinds.length })}
              {result.truncated && (
                <span className="ml-2 text-amber-300">{t('snmp.request.truncated', { max: MAX_WALK })}</span>
              )}
            </div>
            {result.varbinds.length ? (
              <div className="max-h-96 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-ink-900 text-left text-xs text-slate-500">
                    <tr>
                      <th className="pb-2 font-medium">{t('snmp.request.oid')}</th>
                      <th className="pb-2 font-medium">{t('snmp.request.type')}</th>
                      <th className="pb-2 font-medium">{t('snmp.request.value')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody className="font-mono text-[13px]">
                    {result.varbinds.map((vb, i) => (
                      <tr key={`${vb.oid}-${i}`} className="border-t border-ink-800 align-top">
                        <td className="py-1 pr-3 break-all text-sulfur-300 select-text">{vb.oid}</td>
                        <td className={`py-1 pr-3 ${vb.error ? 'text-amber-300' : 'text-slate-400'}`}>{vb.type}</td>
                        <td className="py-1 pr-3 break-all text-slate-200 select-text">{formatValue(vb.value)}</td>
                        <td className="w-8 py-0.5">
                          {!vb.error && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title={t('snmp.request.monitor')}
                              onClick={() => onMonitor(vb.oid)}
                            >
                              <Eye className="size-3.5" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-500">{t('snmp.request.empty')}</p>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

function MonitorsCard({ config, update, status, run }) {
  const [values, setValues] = useState({})
  const monitors = config.monitors ?? []
  const polling = status.polling
  const set = (list) => update({ monitors: list })

  useEffect(() => {
    snmpApi.manager.values().then(setValues)
    return snmpApi.manager.onPoll(setValues)
  }, [])

  return (
    <Card
      id="snmp.manager.monitors"
      title={t('snmp.monitors.title', { count: monitors.length })}
      className="shrink-0"
      actions={
        <>
          <StatusDot
            on={polling}
            label={polling ? t('snmp.monitors.polling', { seconds: status.pollInterval }) : t('snmp.monitors.idle')}
          />
          <Button
            size="sm"
            disabled={polling}
            onClick={() => set([...monitors, { id: crypto.randomUUID(), oid: '', label: '' }])}
          >
            <Plus className="size-3.5" /> {t('ui.add')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="px-1.5 pb-2 font-medium">{t('snmp.monitors.oid')}</th>
              <th className="px-1.5 pb-2 font-medium">{t('snmp.monitors.label')}</th>
              <th className="px-1.5 pb-2 font-medium">{t('snmp.monitors.last')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {monitors.map((m) => {
              const last = values[m.id]
              return (
                <tr key={m.id} className="align-middle">
                  <td className="p-1.5">
                    <Input
                      className="font-mono"
                      value={m.oid}
                      disabled={polling}
                      onChange={(e) => set(monitors.map((x) => (x.id === m.id ? { ...x, oid: e.target.value } : x)))}
                    />
                  </td>
                  <td className="w-48 p-1.5">
                    <Input
                      value={m.label}
                      disabled={polling}
                      onChange={(e) => set(monitors.map((x) => (x.id === m.id ? { ...x, label: e.target.value } : x)))}
                    />
                  </td>
                  <td className="p-1.5 font-mono text-sm break-all">
                    {last?.error && last.value === null ? (
                      <span className="font-sans text-xs text-red-300">{last.error}</span>
                    ) : (
                      <span className="text-sulfur-300">
                        {formatValue(last?.value)}{' '}
                        {last?.type && <span className="text-xs text-slate-500">{last.type}</span>}
                      </span>
                    )}
                  </td>
                  <td className="w-10 p-1.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={polling}
                      title={t('ui.remove')}
                      onClick={() => set(monitors.filter((x) => x.id !== m.id))}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="flex items-end gap-3">
          <Field label={t('snmp.monitors.interval')} className="w-28">
            <Input
              type="number"
              min={0.5}
              step={0.5}
              value={config.pollInterval}
              disabled={polling}
              onChange={(e) => update({ pollInterval: Number(e.target.value) })}
            />
          </Field>
          {polling ? (
            <Button variant="danger" onClick={() => run(snmpApi.manager.stopPolling)}>
              <Square className="size-4" /> {t('snmp.monitors.stop')}
            </Button>
          ) : (
            <Button
              disabled={!monitors.length || !config.host}
              onClick={() => run(() => snmpApi.manager.startPolling(config))}
            >
              <Play className="size-4" /> {t('snmp.monitors.start')}
            </Button>
          )}
        </div>
        <p className="text-xs text-slate-500">{t('snmp.monitors.hint')}</p>
      </div>
    </Card>
  )
}

function ReceiverCard({ config, update, status, run }) {
  const [traps, setTraps] = useState([])
  const receiver = { ...DEFAULT_MANAGER_CONFIG.receiver, ...config.receiver }
  const set = (patch) => update({ receiver: { ...receiver, ...patch } })
  const receiving = status.receiving

  useEffect(() => {
    snmpApi.manager.traps().then(setTraps)
    return snmpApi.manager.onTraps((batch) => setTraps((list) => [...list, ...batch].slice(-MAX_TRAPS)))
  }, [])

  return (
    <Card
      id="snmp.manager.receiver"
      title={t('snmp.receiver.title', { count: status.traps ?? 0 })}
      className="min-h-48 shrink-0"
      actions={
        <>
          <StatusDot
            on={receiving}
            label={
              receiving ? t('snmp.receiver.listening', { endpoint: status.receiverEndpoint }) : t('snmp.receiver.idle')
            }
          />
          <Button
            variant="ghost"
            size="icon"
            title={t('snmp.receiver.clear')}
            onClick={() => snmpApi.manager.clearTraps().then(setTraps)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-end gap-3">
          <Field label={t('snmp.receiver.host')} className="w-48">
            <Input value={receiver.host} disabled={receiving} onChange={(e) => set({ host: e.target.value })} />
          </Field>
          <Field label={t('snmp.receiver.port')} className="w-28">
            <Input
              type="number"
              value={receiver.port}
              disabled={receiving}
              onChange={(e) => set({ port: Number(e.target.value) })}
            />
          </Field>
          {receiving ? (
            <Button variant="danger" onClick={() => run(snmpApi.manager.stopReceiver)}>
              <Square className="size-4" /> {t('snmp.receiver.stop')}
            </Button>
          ) : (
            <Button onClick={() => run(() => snmpApi.manager.startReceiver(config))}>
              <Ear className="size-4" /> {t('snmp.receiver.start')}
            </Button>
          )}
        </div>
        <p className="text-xs text-slate-500">{t('snmp.receiver.hint')}</p>
        {traps.length ? (
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-ink-900 text-left text-xs text-slate-500">
                <tr>
                  <th className="pb-2 font-medium">{t('snmp.receiver.time')}</th>
                  <th className="pb-2 font-medium">{t('snmp.receiver.source')}</th>
                  <th className="pb-2 font-medium">{t('snmp.receiver.type')}</th>
                  <th className="pb-2 font-medium">{t('snmp.receiver.trapOid')}</th>
                  <th className="pb-2 font-medium">{t('snmp.receiver.varbinds')}</th>
                </tr>
              </thead>
              <tbody className="font-mono text-[13px]">
                {traps
                  .slice()
                  .reverse()
                  .map((n) => (
                    <tr key={n.id} className="border-t border-ink-800 align-top">
                      <td className="py-1 pr-3 text-slate-500 tabular-nums">{formatTime(n.time)}</td>
                      <td className="py-1 pr-3 whitespace-nowrap text-slate-400">
                        {n.address} <span className="text-slate-600">{n.community || n.user}</span>
                      </td>
                      <td className="py-1 pr-3 whitespace-nowrap text-slate-300">
                        {n.version} {n.type}
                      </td>
                      <td className="py-1 pr-3 break-all text-sulfur-300">{n.trapOid}</td>
                      <td className="py-1 break-all text-slate-200 select-text">
                        {n.varbinds.map((vb) => `${vb.oid} = ${formatValue(vb.value)}`).join(' · ') || '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">{t('snmp.receiver.empty')}</p>
        )}
      </div>
    </Card>
  )
}

export default function ManagerPanel({ status, agent }) {
  const [config, setConfig] = usePersistentState('snmp', 'manager', DEFAULT_MANAGER_CONFIG)
  const [error, setError] = useState(null)
  const update = (patch) => setConfig((c) => ({ ...c, ...patch }))

  const run = (action) => {
    setError(null)
    return action().catch((err) => setError(err.message))
  }

  const monitor = (oid) =>
    setConfig((c) =>
      (c.monitors ?? []).some((m) => m.oid === oid)
        ? c
        : { ...c, monitors: [...(c.monitors ?? []), { id: crypto.randomUUID(), oid, label: '' }] }
    )

  return (
    <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-2">
      <TargetCard config={config} update={update} agent={agent} locked={status.polling} />
      <ErrorBanner error={error} onClose={() => setError(null)} />
      <RequestCard config={config} update={update} onMonitor={monitor} />
      <MonitorsCard config={config} update={update} status={status} run={run} />
      <ReceiverCard config={config} update={update} status={status} run={run} />
    </div>
  )
}
