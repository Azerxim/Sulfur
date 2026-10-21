import { useEffect, useState } from 'react'
import { Plug, RefreshCw, Unplug, Zap } from 'lucide-react'
import { Button, Card, ErrorBanner, Field, Input, Select, StatusDot, usePersistentState } from '@azerxim/sulfur-sdk/ui'
import {
  BAUD_RATES,
  DATA_BITS,
  DEFAULT_PORT_CONFIG,
  DEFAULT_RX_CONFIG,
  FLOW_CONTROLS,
  FRAMINGS,
  PARITIES,
  STOP_BITS
} from '../shared/constants'
import { serialApi } from './api'
import { t } from '../shared/i18n'

/** Port série : saisie libre, avec la liste des ports détectés (actualisable). */
function PortField({ value, onChange, disabled }) {
  const [ports, setPorts] = useState([])
  const [error, setError] = useState(null)
  const refresh = () =>
    serialApi
      .ports()
      .then((list) => {
        setPorts(list)
        setError(null)
      })
      .catch((err) => setError(err.message))
  useEffect(() => {
    refresh()
  }, [])

  return (
    <Field label={t('serial.port.path')}>
      <div className="flex gap-1">
        <Input
          className="font-mono"
          list="serial-ports"
          placeholder={ports.length ? ports[0].path : t('serial.port.pathPlaceholder')}
          title={error ?? (ports.length ? undefined : t('serial.port.noPorts'))}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
        <Button variant="ghost" className="shrink-0 px-2" title={t('serial.port.refresh')} onClick={refresh}>
          <RefreshCw className="size-3.5" />
        </Button>
      </div>
      <datalist id="serial-ports">
        {ports.map((p) => (
          <option key={p.path} value={p.path}>
            {[p.manufacturer, p.serialNumber].filter(Boolean).join(' · ')}
          </option>
        ))}
      </datalist>
    </Field>
  )
}

/** Ligne de contrôle : sortie commutable (DTR, RTS) ou entrée lue (CTS, DSR, DCD). */
function Line({ name, on, onToggle, disabled, title }) {
  const led = on ? 'bg-emerald-400 shadow-[0_0_6px] shadow-emerald-400/60' : 'bg-slate-600'
  const content = (
    <>
      <span className={`size-2 rounded-full ${led}`} />
      <span className="font-mono">{name}</span>
    </>
  )
  if (!onToggle) {
    return (
      <span className="inline-flex h-7 items-center gap-1.5 px-1 text-xs text-slate-400" title={title}>
        {content}
      </span>
    )
  }
  return (
    <Button size="sm" variant="secondary" disabled={disabled} title={title} aria-pressed={on} onClick={onToggle}>
      {content}
    </Button>
  )
}

/** Groupe titré de boutons : pas un <label>, dont un clic activerait le premier bouton. */
const Group = ({ label, children }) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-xs text-slate-400">{label}</span>
    {children}
  </div>
)

const Counter = ({ label, bytes, frames }) => (
  <span className="text-xs text-slate-400">
    {label}{' '}
    <span className="font-mono text-slate-200 tabular-nums">{t('serial.port.bytes', { count: bytes ?? 0 })}</span>
    <span className="text-slate-500"> · {t('serial.port.frames', { count: frames ?? 0 })}</span>
  </span>
)

export default function PortCard({ status }) {
  const [config, setConfig] = usePersistentState('serial', 'port', DEFAULT_PORT_CONFIG)
  const [rx, setRx] = usePersistentState('serial', 'rx', DEFAULT_RX_CONFIG)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const open = status.open
  const locked = open || busy
  const outputs = open ? status.outputs : config
  const set = (patch) => setConfig((c) => ({ ...c, ...patch }))

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

  // Ligne de sortie : appliquée aussitôt port ouvert, et retenue pour la prochaine ouverture.
  const toggleOutput = (line) => {
    const value = !outputs[line]
    set({ [line]: value })
    if (open) run(() => serialApi.setOutputs({ [line]: value }))
  }

  // Découpage des trames : modifiable port ouvert (gap appliqué à la sortie du champ).
  const changeRx = (patch, apply = true) => {
    const next = { ...rx, ...patch }
    setRx(next)
    if (open && apply) run(() => serialApi.setRx(next))
  }

  const signals = status.signals
  const signalTitle = open && !signals ? t('serial.port.signalsUnavailable') : undefined

  return (
    <Card
      id="serial.port"
      title={t('serial.port.title')}
      className="shrink-0"
      actions={
        <>
          <StatusDot
            on={open}
            label={
              open
                ? t('serial.port.opened', { path: status.config.path, label: status.label })
                : t('serial.port.closed')
            }
          />
          {open ? (
            <Button variant="danger" size="sm" disabled={busy} onClick={() => run(serialApi.close)}>
              <Unplug className="size-3.5" /> {t('serial.port.close')}
            </Button>
          ) : (
            <Button variant="primary" size="sm" disabled={busy} onClick={() => run(() => serialApi.open(config, rx))}>
              <Plug className="size-3.5" /> {busy ? t('serial.port.opening') : t('serial.port.open')}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1.5fr] items-end gap-4">
          <PortField value={config.path} disabled={locked} onChange={(path) => set({ path })} />
          <Field label={t('serial.port.baudRate')}>
            <Input
              type="number"
              list="serial-baud-rates"
              min={50}
              value={config.baudRate}
              disabled={locked}
              onChange={(e) => set({ baudRate: Number(e.target.value) })}
            />
            <datalist id="serial-baud-rates">
              {BAUD_RATES.map((rate) => (
                <option key={rate} value={rate} />
              ))}
            </datalist>
          </Field>
          <Field label={t('serial.port.dataBits')}>
            <Select
              value={config.dataBits}
              disabled={locked}
              onChange={(e) => set({ dataBits: Number(e.target.value) })}
            >
              {DATA_BITS.map((bits) => (
                <option key={bits} value={bits}>
                  {bits}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('serial.port.parity')}>
            <Select value={config.parity} disabled={locked} onChange={(e) => set({ parity: e.target.value })}>
              {PARITIES.map((p) => (
                <option key={p} value={p}>
                  {t(`serial.parities.${p}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('serial.port.stopBits')}>
            <Select
              value={config.stopBits}
              disabled={locked}
              onChange={(e) => set({ stopBits: Number(e.target.value) })}
            >
              {STOP_BITS.map((bits) => (
                <option key={bits} value={bits}>
                  {bits}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('serial.port.flowControl')}>
            <Select value={config.flowControl} disabled={locked} onChange={(e) => set({ flowControl: e.target.value })}>
              {FLOW_CONTROLS.map((f) => (
                <option key={f} value={f}>
                  {t(`serial.flowControls.${f}`)}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <Group label={t('serial.port.outputs')}>
            <div className="flex gap-1.5">
              {['dtr', 'rts'].map((line) => (
                <Line
                  key={line}
                  name={line.toUpperCase()}
                  on={!!outputs[line]}
                  disabled={busy}
                  title={t(`serial.lines.${line}`)}
                  onToggle={() => toggleOutput(line)}
                />
              ))}
              <Button
                size="sm"
                variant="ghost"
                disabled={!open || busy}
                title={t('serial.port.breakHint')}
                onClick={() => run(serialApi.sendBreak)}
              >
                <Zap className="size-3.5" /> {t('serial.port.break')}
              </Button>
            </div>
          </Group>
          <Group label={t('serial.port.inputs')}>
            <div className="flex gap-1.5">
              {['cts', 'dsr', 'dcd'].map((line) => (
                <Line
                  key={line}
                  name={line.toUpperCase()}
                  on={!!signals?.[line]}
                  title={signalTitle ?? t(`serial.lines.${line}`)}
                />
              ))}
            </div>
          </Group>
          <Field label={t('serial.port.framing')}>
            <div className="flex gap-2">
              <Select className="w-52" value={rx.framing} onChange={(e) => changeRx({ framing: e.target.value })}>
                {FRAMINGS.map((f) => (
                  <option key={f} value={f}>
                    {t(`serial.framings.${f}`)}
                  </option>
                ))}
              </Select>
              <Input
                type="number"
                className="w-24"
                min={1}
                title={t('serial.port.gap')}
                value={rx.gap}
                onChange={(e) => changeRx({ gap: Number(e.target.value) }, false)}
                onBlur={() => open && run(() => serialApi.setRx(rx))}
              />
              <span className="self-center text-xs text-slate-500">ms</span>
            </div>
          </Field>
          <div className="ml-auto flex flex-col gap-1 pb-1">
            <Counter label="RX" bytes={status.counters?.rxBytes} frames={status.counters?.rxFrames} />
            <Counter label="TX" bytes={status.counters?.txBytes} frames={status.counters?.txFrames} />
          </div>
        </div>
        <p className="text-xs text-slate-500">{t('serial.port.hint')}</p>
        <ErrorBanner error={error} onClose={() => setError(null)} />
      </div>
    </Card>
  )
}
