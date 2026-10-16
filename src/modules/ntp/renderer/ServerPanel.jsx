import { useEffect, useRef, useState } from 'react'
import { Copy, Play, RotateCcw, Snowflake, Square, Trash2 } from 'lucide-react'
import { Button, Card, CommitInput, ErrorBanner, Field, Input, Select, StatusDot } from '@renderer/components/ui'
import { formatTime } from '@shared/i18n'
import { usePersistentState } from '@renderer/module-config'
import { CLOCK_MODES, DEFAULT_SERVER_CONFIG, LEAP_INDICATORS, MAX_STRATUM, OFFSET_PRESETS } from '../shared/constants'
import { ntpApi } from './api'
import { formatDateTime, formatOffset, fromLocalInput, toLocalInput } from './format'
import { t } from '../shared/i18n'

const MAX_LOG = 300
const LEVELS = { info: 'text-slate-400', warn: 'text-amber-300', error: 'text-red-300' }

/** Heure simulée affichée : extrapolée localement entre deux états reçus du serveur. */
function useSimulatedTime(status, config) {
  const [now, setNow] = useState(Date.now())
  const received = useRef({ at: Date.now(), time: null })
  useEffect(() => {
    received.current = { at: Date.now(), time: status.time }
  }, [status.time])
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(timer)
  }, [])
  const drift = Number(config.clock.drift) || 0
  if (status.running && received.current.time !== null) {
    if (status.frozen) return received.current.time
    return received.current.time + (now - received.current.at) * (1 + drift / 1e6)
  }
  // Serveur arrêté : aperçu de l'heure qu'il donnerait au démarrage.
  if (config.clock.mode === 'fixed') return Date.parse(config.clock.fixedTime) || null
  return now + (Number(config.clock.offset) || 0) * 1000
}

function ClockCard({ status, config, setConfig, run, live }) {
  const running = status.running
  const clock = config.clock
  const time = useSimulatedTime(status, config)
  const [fixedDraft, setFixedDraft] = useState(toLocalInput(clock.fixedTime))
  const setClock = (patch) => setConfig((c) => ({ ...c, clock: { ...c.clock, ...patch } }))

  // Réglages appliqués au serveur en marche, et enregistrés dans la configuration.
  const apply = (patch) => {
    setClock(patch)
    if (running) live(() => ntpApi.server.setClock({ ...clock, ...patch }))
  }
  const shift = (seconds) => {
    if (running) run(async () => setClock((await ntpApi.server.shift(seconds)).config.clock))
    else apply({ mode: 'offset', offset: (clock.mode === 'offset' ? Number(clock.offset) || 0 : 0) + seconds })
  }
  const realOffset = time === null ? null : time - Date.now()

  return (
    <Card id="ntp.server.clock" title={t('ntp.clock.title')} className="shrink-0">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4 rounded-md bg-ink-950 px-4 py-3">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              {running ? t('ntp.clock.simulated') : t('ntp.clock.preview')}
              {status.frozen && (
                <span className="inline-flex items-center gap-1 text-sky-300">
                  <Snowflake className="size-3" /> {t('ntp.clock.frozen')}
                </span>
              )}
            </div>
            <div className="font-mono text-2xl text-sulfur-300 tabular-nums">{formatDateTime(time)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">{t('ntp.clock.real')}</div>
            <div className="font-mono text-2xl text-slate-300 tabular-nums">{formatDateTime(Date.now())}</div>
            <div className="mt-1 text-xs text-slate-400">
              {t('ntp.clock.offset')} : <span className="font-mono">{formatOffset(realOffset)}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-[12rem_minmax(0,1fr)_10rem] items-end gap-3">
          <Field label={t('ntp.clock.mode')}>
            <Select
              value={clock.mode}
              onChange={(e) => {
                const mode = e.target.value
                // Heure fixée par défaut : l'heure simulée actuelle.
                const fixedTime = clock.fixedTime || new Date(time ?? Date.now()).toISOString()
                if (mode === 'fixed') setFixedDraft(toLocalInput(fixedTime))
                apply(mode === 'fixed' ? { mode, fixedTime } : { mode, offset: Math.round((realOffset ?? 0) / 1000) })
              }}
            >
              {CLOCK_MODES.map((m) => (
                <option key={m} value={m}>
                  {t(`ntp.clock.modes.${m}`)}
                </option>
              ))}
            </Select>
          </Field>
          {clock.mode === 'offset' ? (
            <Field label={t('ntp.clock.offsetSeconds')}>
              <div className="flex gap-2">
                <CommitInput
                  type="number"
                  className="font-mono"
                  value={clock.offset}
                  onCommit={(raw) => apply({ offset: Number(raw) || 0 })}
                />
                <Button
                  className="shrink-0 whitespace-nowrap"
                  title={t('ntp.clock.resetHint')}
                  onClick={() => apply({ mode: 'offset', offset: 0 })}
                >
                  <RotateCcw className="size-3.5" /> {t('ntp.clock.reset')}
                </Button>
              </div>
            </Field>
          ) : (
            <Field label={t('ntp.clock.fixedTime')}>
              <div className="flex gap-2">
                <Input
                  type="datetime-local"
                  step={1}
                  className="font-mono"
                  value={fixedDraft}
                  onChange={(e) => setFixedDraft(e.target.value)}
                />
                <Button
                  variant="primary"
                  disabled={!fixedDraft}
                  title={t('ntp.clock.applyHint')}
                  onClick={() => apply({ fixedTime: fromLocalInput(fixedDraft) })}
                >
                  {t('ntp.clock.apply')}
                </Button>
              </div>
            </Field>
          )}
          <Field label={t('ntp.clock.drift')}>
            <CommitInput
              type="number"
              className="font-mono"
              value={clock.drift}
              title={t('ntp.clock.driftHint')}
              onCommit={(raw) => {
                setClock({ drift: Number(raw) || 0 })
                if (running) live(() => ntpApi.server.setDrift(Number(raw) || 0))
              }}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-2 text-xs text-slate-500">{running ? t('ntp.clock.jump') : t('ntp.clock.shift')}</span>
          {OFFSET_PRESETS.map((seconds) => (
            <Button key={seconds} size="sm" onClick={() => shift(seconds)}>
              {t(`ntp.presets.${seconds}`)}
            </Button>
          ))}
        </div>
        <p className="text-xs text-slate-500">{t('ntp.clock.hint')}</p>
      </div>
    </Card>
  )
}

function SettingsCard({ config, setConfig, running, live }) {
  const apply = (patch) => {
    setConfig((c) => ({ ...c, ...patch }))
    if (running) live(() => ntpApi.server.setSettings(patch))
  }
  return (
    <Card id="ntp.server.settings" title={t('ntp.settings.title')} className="shrink-0">
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-4 gap-4">
          <Field label={t('ntp.settings.stratum')}>
            <Select value={config.stratum} onChange={(e) => apply({ stratum: Number(e.target.value) })}>
              {Array.from({ length: MAX_STRATUM }, (_, i) => i + 1).map((s) => (
                <option key={s} value={s}>
                  {s === 1 ? t('ntp.settings.stratum1') : s === MAX_STRATUM ? t('ntp.settings.stratum16') : s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('ntp.settings.leap')}>
            <Select value={config.leap} onChange={(e) => apply({ leap: Number(e.target.value) })}>
              {LEAP_INDICATORS.map((l) => (
                <option key={l} value={l}>
                  {l} · {t(`ntp.leap.${l}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('ntp.settings.refId')}>
            <CommitInput
              className="font-mono"
              value={config.refId}
              title={t('ntp.settings.refIdHint')}
              maxLength={config.stratum === 1 ? 4 : 15}
              onCommit={(refId) => apply({ refId })}
            />
          </Field>
          <Field label={t('ntp.settings.precision')}>
            <CommitInput
              type="number"
              min={-32}
              max={0}
              className="font-mono"
              value={config.precision}
              title={t('ntp.settings.precisionHint')}
              onCommit={(raw) => apply({ precision: Number(raw) })}
            />
          </Field>
        </div>
        <p className="text-xs text-slate-500">{t('ntp.settings.hint')}</p>
      </div>
    </Card>
  )
}

function Activity({ status }) {
  const [logs, setLogs] = useState([])
  useEffect(() => {
    ntpApi.server.logs().then(setLogs)
    return ntpApi.server.onLog((entry) => setLogs((l) => [...l.slice(-(MAX_LOG - 1)), entry]))
  }, [])
  const clients = status.clients ?? []
  return (
    <div className="grid shrink-0 grid-cols-[1fr_1.4fr] gap-4">
      <Card id="ntp.server.clients" title={t('ntp.activity.clients', { count: clients.length })}>
        {clients.length ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="pb-2 font-medium">{t('ntp.activity.address')}</th>
                <th className="pb-2 font-medium">{t('ntp.activity.version')}</th>
                <th className="pb-2 text-right font-medium">{t('ntp.activity.requests')}</th>
                <th className="pb-2 pl-3 text-right font-medium">{t('ntp.activity.last')}</th>
              </tr>
            </thead>
            <tbody className="font-mono text-[13px]">
              {clients.map((c) => (
                <tr key={c.address} className="border-t border-ink-800">
                  <td className="py-1.5 text-slate-200">{c.address}</td>
                  <td className="py-1.5 text-slate-400">NTPv{c.version}</td>
                  <td className="py-1.5 text-right text-slate-300 tabular-nums">{c.count}</td>
                  <td className="py-1.5 pl-3 text-right text-slate-400 tabular-nums">{formatTime(c.last)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-500">
            {status.running ? t('ntp.activity.noClient') : t('ntp.activity.stopped')}
          </p>
        )}
      </Card>
      <Card
        id="ntp.server.log"
        title={t('ntp.activity.log')}
        actions={
          <Button
            variant="ghost"
            size="icon"
            title={t('ntp.activity.clear')}
            onClick={() => ntpApi.server.clearLogs().then(setLogs)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        }
      >
        {logs.length ? (
          <div className="max-h-64 overflow-auto font-mono text-xs">
            {logs
              .slice()
              .reverse()
              .map((l) => (
                <div key={l.id} className={`flex gap-3 py-0.5 ${LEVELS[l.level]}`}>
                  <span className="shrink-0 text-slate-500 tabular-nums">{formatTime(l.time)}</span>
                  <span className="break-all select-text">{l.message}</span>
                </div>
              ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">{t('ntp.activity.empty')}</p>
        )}
      </Card>
    </div>
  )
}

export default function ServerPanel({ status }) {
  const [config, setConfig] = usePersistentState('ntp', 'server', status.config ?? DEFAULT_SERVER_CONFIG)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const running = status.running

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
  const update = (patch) => setConfig((c) => ({ ...c, ...patch }))

  return (
    <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-2">
      <Card
        id="ntp.server.config"
        title={t('ntp.server.title')}
        className="shrink-0"
        actions={
          <>
            <StatusDot
              on={running}
              label={running ? t('ntp.server.running', { count: status.requests ?? 0 }) : t('ui.stopped')}
            />
            {running ? (
              <Button variant="danger" size="sm" disabled={busy} onClick={() => run(ntpApi.server.stop)}>
                <Square className="size-3.5" /> {t('ui.stop')}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                disabled={busy}
                onClick={() => run(() => ntpApi.server.start(config))}
              >
                <Play className="size-3.5" /> {busy ? t('ui.starting') : t('ui.start')}
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[2fr_1fr_3fr] items-end gap-4">
            <Field label={t('ntp.server.host')}>
              <Input
                value={config.host}
                disabled={running || busy}
                onChange={(e) => update({ host: e.target.value })}
              />
            </Field>
            <Field label={t('ntp.server.port')}>
              <Input
                type="number"
                value={config.port}
                disabled={running || busy}
                onChange={(e) => update({ port: Number(e.target.value) })}
              />
            </Field>
            <p className="mb-2 text-xs text-slate-500">{t('ntp.server.portsHint')}</p>
          </div>
          {status.endpoint && (
            <div className="flex items-center gap-2 rounded-md bg-ink-950 px-3 py-2 font-mono text-sm text-sulfur-300">
              {status.endpoint}
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

      <ClockCard status={status} config={config} setConfig={setConfig} run={run} live={live} />
      <SettingsCard config={config} setConfig={setConfig} running={running} live={live} />
      <Activity status={status} />
    </div>
  )
}
