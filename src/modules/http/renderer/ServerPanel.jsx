import { useEffect, useRef, useState } from 'react'
import { Copy, Lock, Play, Plus, Square, Trash2 } from 'lucide-react'
import {
  Button,
  Card,
  Checkbox,
  CommitInput,
  ErrorBanner,
  Field,
  Input,
  Select,
  StatusDot,
  usePersistentState
} from '@azerxim/sulfur-sdk/ui'
import { DATA_TYPES, DEFAULT_SERVER_CONFIG, NUMERIC_TYPES, SIMULATIONS } from '../shared/constants'
import { VARIABLE_NAME } from '../shared/template'
import { httpApi } from './api'
import ServerAuth from './ServerAuth'
import RoutesCard from './RoutesCard'
import WebhooksCard from './WebhooksCard'
import ServerLog from './ServerLog'
import { t } from '../shared/i18n'

/** Délai avant d'envoyer au serveur les réglages modifiés pendant qu'il tourne. */
const LIVE_DEBOUNCE = 400

const formatValue = (v) => {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number' && !Number.isInteger(v)) return Number(v.toFixed(4)).toString()
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}

function newVariable(variables) {
  const names = new Set(variables.map((v) => v.name))
  let i = variables.length + 1
  while (names.has(`variable${i}`)) i++
  return {
    id: crypto.randomUUID(),
    name: `variable${i}`,
    dataType: 'Number',
    initialValue: 0,
    simulation: 'none',
    period: 1000,
    min: 0,
    max: 100,
    writable: true
  }
}

function LiveValue({ variable, value, onSet }) {
  if (variable.dataType === 'Boolean') {
    return (
      <button
        onClick={() => onSet(!value)}
        title={t('ui.toggle')}
        className={`h-9 w-full rounded-md border font-mono text-sm transition-colors ${
          value
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
            : 'border-ink-700 bg-ink-950 text-slate-400'
        }`}
      >
        {formatValue(value)}
      </button>
    )
  }
  return <CommitInput className="font-mono text-sulfur-300" value={formatValue(value)} onCommit={onSet} />
}

/** Les mots de passe ne sont jamais enregistrés en clair : seules les empreintes le sont. */
const persist = (config) => ({
  ...config,
  auth: {
    ...config.auth,
    users: (config.auth?.users ?? []).map(({ username, passwordHash }) => ({ username, passwordHash }))
  }
})

export default function ServerPanel({ status }) {
  const [config, setConfig] = usePersistentState('http', 'server', status.config ?? DEFAULT_SERVER_CONFIG, { persist })
  const [values, setValues] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const timers = useRef({})
  const running = status.running

  // Le serveur est la source de vérité quand il tourne : on reprend sa configuration au démarrage.
  useEffect(() => {
    if (running && status.config) setConfig(status.config)
    if (!running) setValues({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  useEffect(() => {
    httpApi.server.values().then(setValues)
    return httpApi.server.onValues(setValues)
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

  const live = (action) => action().catch((err) => setError(err.message))
  const debounce = (key, send, immediate = false) => {
    clearTimeout(timers.current[key])
    if (immediate) send()
    else timers.current[key] = setTimeout(send, LIVE_DEBOUNCE)
  }
  const update = (patch) => setConfig((c) => ({ ...c, ...patch }))

  function updateVariable(id, patch, { immediate = false } = {}) {
    const next = { ...config.variables.find((v) => v.id === id), ...patch }
    setConfig((c) => ({ ...c, variables: c.variables.map((v) => (v.id === id ? next : v)) }))
    if (running && VARIABLE_NAME.test(next.name))
      debounce(id, () => live(() => httpApi.server.upsertVariable(next)), immediate)
  }

  function addVariable() {
    const v = newVariable(config.variables)
    setConfig((c) => ({ ...c, variables: [...c.variables, v] }))
    if (running) live(() => httpApi.server.upsertVariable(v))
  }

  function removeVariable(id) {
    clearTimeout(timers.current[id])
    setConfig((c) => ({ ...c, variables: c.variables.filter((v) => v.id !== id) }))
    if (running) live(() => httpApi.server.removeVariable(id))
  }

  function setRoutes(routes) {
    update({ routes })
    if (running) debounce('routes', () => live(() => httpApi.server.setRoutes(routes)))
  }

  function setWebhooks(webhooks) {
    update({ webhooks })
    if (running) debounce('webhooks', () => live(() => httpApi.server.setWebhooks(webhooks)))
  }

  const names = config.variables.map((v) => v.name)
  const badNames = new Set(names.filter((n, i) => names.indexOf(n) !== i || !VARIABLE_NAME.test(n)))
  const invalid = badNames.size > 0

  return (
    <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-2">
      <Card
        id="http.server.config"
        title={t('http.server.title')}
        className="shrink-0"
        actions={
          <>
            <StatusDot
              on={running}
              label={running ? t('http.server.running', { count: status.requests ?? 0 }) : t('ui.stopped')}
            />
            {running ? (
              <Button variant="danger" size="sm" disabled={busy} onClick={() => run(httpApi.server.stop)}>
                <Square className="size-3.5" /> {t('ui.stop')}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                disabled={busy || invalid}
                onClick={() => run(() => httpApi.server.start(config))}
              >
                <Play className="size-3.5" /> {busy ? t('ui.starting') : t('ui.start')}
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[2fr_1fr_1.4fr_1.2fr] gap-4">
            <Field label={t('http.server.host')}>
              <Input
                value={config.host}
                disabled={running || busy}
                onChange={(e) => update({ host: e.target.value })}
              />
            </Field>
            <Field label={t('http.server.port')}>
              <Input
                type="number"
                value={config.port}
                disabled={running || busy}
                onChange={(e) => update({ port: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('http.server.basePath')}>
              <Input
                className="font-mono"
                value={config.basePath}
                disabled={running || busy || !config.api}
                onChange={(e) => update({ basePath: e.target.value })}
              />
            </Field>
            <Field label={t('ui.simulationRate')}>
              <CommitInput
                type="number"
                min={10}
                value={config.updateRate}
                disabled={busy}
                onCommit={(raw) => {
                  update({ updateRate: Number(raw) })
                  if (running) live(() => httpApi.server.setUpdateRate(Number(raw)))
                }}
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <Checkbox
              label={t('http.server.https')}
              disabled={running || busy}
              checked={!!config.https}
              onChange={(e) => update({ https: e.target.checked })}
            />
            <Checkbox
              label={t('http.server.api')}
              disabled={running || busy}
              checked={!!config.api}
              onChange={(e) => update({ api: e.target.checked })}
            />
            <Checkbox
              label={t('http.server.cors')}
              disabled={running || busy}
              checked={!!config.cors}
              onChange={(e) => update({ cors: e.target.checked })}
            />
            <span className="text-xs text-slate-500">{t('http.server.portsHint')}</span>
          </div>
          {config.api && (
            <p className="font-mono text-xs text-slate-500">
              GET {config.basePath}/variables · GET | PUT {config.basePath}/variables/&lt;{t('ui.name').toLowerCase()}
              &gt;
            </p>
          )}

          {status.url && (
            <div className="flex items-center gap-2 rounded-md bg-ink-950 px-3 py-2 font-mono text-sm text-sulfur-300">
              {config.https && <Lock className="size-3.5 text-emerald-400" />}
              {status.url}
              {status.certificate && (
                <span className="font-sans text-xs text-slate-500">
                  · {t('http.server.certificate', { name: status.certificate.commonName })} ·{' '}
                  {status.certificate.thumbprint.slice(0, 16)}…
                </span>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto"
                title={t('ui.copy')}
                onClick={() => navigator.clipboard.writeText(status.url)}
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
          )}
          <ErrorBanner error={error} onClose={() => setError(null)} />
        </div>
      </Card>

      <ServerAuth
        value={config.auth}
        locked={running || busy}
        onChange={(auth) => update({ auth })}
        onError={setError}
      />

      <Card
        id="http.server.variables"
        title={t('http.variables.title', { count: config.variables.length })}
        className="shrink-0"
        actions={
          <>
            {running && <span className="text-xs text-slate-500">{t('ui.liveApplied')}</span>}
            <Button size="sm" disabled={busy} onClick={addVariable}>
              <Plus className="size-3.5" /> {t('ui.add')}
            </Button>
          </>
        }
      >
        <div className="overflow-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                {[
                  t('ui.name'),
                  t('ui.type'),
                  running ? t('ui.currentValue') : t('ui.initialValue'),
                  t('ui.simulation'),
                  t('ui.periodMs'),
                  t('ui.min'),
                  t('ui.max'),
                  t('ui.write'),
                  ''
                ].map((h, i) => (
                  <th key={i} className="px-1.5 pb-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {config.variables.map((v) => {
                const numeric = NUMERIC_TYPES.includes(v.dataType)
                return (
                  <tr key={v.id} className="align-middle">
                    <td className="min-w-36 p-1.5">
                      <CommitInput
                        className={`font-mono ${badNames.has(v.name) ? 'border-red-500/60' : ''}`}
                        value={v.name}
                        disabled={busy}
                        title={badNames.has(v.name) ? t('http.variables.nameHint') : undefined}
                        onCommit={(name) => updateVariable(v.id, { name: name.trim() }, { immediate: true })}
                      />
                    </td>
                    <td className="w-32 p-1.5">
                      <Select
                        value={v.dataType}
                        disabled={busy}
                        onChange={(e) =>
                          updateVariable(
                            v.id,
                            {
                              dataType: e.target.value,
                              simulation: NUMERIC_TYPES.includes(e.target.value) ? v.simulation : 'none'
                            },
                            { immediate: true }
                          )
                        }
                      >
                        {DATA_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {t(`http.dataTypes.${type}`)}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="w-44 p-1.5">
                      {running ? (
                        <LiveValue
                          variable={v}
                          value={values[v.id]}
                          onSet={(raw) => live(() => httpApi.server.setValue(v.id, raw))}
                        />
                      ) : (
                        <Input
                          className="font-mono"
                          value={formatValue(v.initialValue)}
                          disabled={busy}
                          onChange={(e) => updateVariable(v.id, { initialValue: e.target.value })}
                        />
                      )}
                    </td>
                    <td className="w-32 p-1.5">
                      <Select
                        value={v.simulation}
                        disabled={busy || !numeric}
                        onChange={(e) => updateVariable(v.id, { simulation: e.target.value }, { immediate: true })}
                      >
                        {SIMULATIONS.map((k) => (
                          <option key={k} value={k}>
                            {t(`simulations.${k}`)}
                          </option>
                        ))}
                      </Select>
                    </td>
                    {['period', 'min', 'max'].map((key) => (
                      <td key={key} className="w-24 min-w-20 p-1.5">
                        <Input
                          type="number"
                          value={v[key]}
                          disabled={busy || v.simulation === 'none' || !numeric}
                          onChange={(e) => updateVariable(v.id, { [key]: Number(e.target.value) })}
                        />
                      </td>
                    ))}
                    <td className="p-1.5 text-center">
                      <input
                        type="checkbox"
                        className="size-4 accent-sulfur-400"
                        title={t('http.variables.writableHint')}
                        checked={!!v.writable}
                        disabled={busy}
                        onChange={(e) => updateVariable(v.id, { writable: e.target.checked }, { immediate: true })}
                      />
                    </td>
                    <td className="p-1.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={busy}
                        title={t('ui.remove')}
                        onClick={() => removeVariable(v.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <RoutesCard
        routes={config.routes}
        variables={config.variables}
        running={running}
        busy={busy}
        onChange={setRoutes}
      />
      <WebhooksCard
        webhooks={config.webhooks}
        variables={config.variables}
        running={running}
        busy={busy}
        onChange={setWebhooks}
      />
      <ServerLog />
    </div>
  )
}
