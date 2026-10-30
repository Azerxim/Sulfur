import { useEffect, useState } from 'react'
import { Activity, Play, Radio, Square } from 'lucide-react'
import { pointKey } from '@azerxim/sulfur-sdk'
import {
  Button,
  Card,
  CommitInput,
  ErrorBanner,
  Field,
  Input,
  StatusDot,
  usePersistentState
} from '@azerxim/sulfur-sdk/ui'
import { DEFAULTS, manifest } from '../manifest.js'
import { t } from '../i18n.js'
import './style.css'

const ID = manifest.id
const HISTORY = 120
const invoke = (action, ...args) => window.sulfur.invoke(`${ID}:${action}`, ...args)

/** Courbe des dernières valeurs du sinus (SVG, entre -amplitude et +amplitude). */
function Sparkline({ history, amplitude }) {
  const range = Math.abs(amplitude) || 1
  const points = history.map((v, i) => `${(i / (HISTORY - 1)) * 100},${50 - (v / range) * 45}`).join(' ')
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="test-signal-sparkline h-32 w-full rounded-md bg-ink-950"
    >
      <line
        x1="0"
        y1="50"
        x2="100"
        y2="50"
        className="stroke-ink-700"
        strokeWidth="0.5"
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        points={points}
        fill="none"
        className="stroke-sulfur-400"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

function Value({ label, value }) {
  return (
    <div className="flex flex-col rounded-md border border-ink-700 bg-ink-850 px-3 py-2">
      <span className="text-[11px] tracking-wider text-slate-500 uppercase">{label}</span>
      <span className="font-mono text-lg text-slate-100 tabular-nums">{String(value)}</span>
    </div>
  )
}

function TestSignalView() {
  const [settings, setSettings] = usePersistentState(ID, 'generator', DEFAULTS)
  const [state, setState] = useState(null)
  const [history, setHistory] = useState([])
  const [error, setError] = useState(null)
  const [pong, setPong] = useState(null)

  useEffect(() => {
    invoke('status')
      .then(setState)
      .catch((err) => setError(err.message))
    return window.sulfur.on(`${ID}:tick`, (next) => {
      setState(next)
      if (next.running) setHistory((h) => [...h.slice(-(HISTORY - 1)), next.sine])
    })
  }, [])

  const run = (promise) => promise.catch((err) => setError(err.message))
  const running = state?.running ?? false
  const field = (key) => (
    <Field label={t(`test-signal.${key}`)}>
      <Input
        type="number"
        value={settings[key]}
        disabled={running}
        onChange={(e) => setSettings({ ...settings, [key]: Number(e.target.value) })}
      />
    </Field>
  )
  const ping = async () => {
    const begin = performance.now()
    const { pid, node } = await invoke('ping')
    setPong(t('test-signal.pong', { pid, node, ms: Math.round(performance.now() - begin) }))
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <ErrorBanner error={error} onClose={() => setError(null)} />
      <Card
        id={`${ID}.generator`}
        title={t('test-signal.generator')}
        actions={<StatusDot on={running} label={t(running ? 'test-signal.running' : 'test-signal.stopped')} />}
      >
        <div className="grid grid-cols-3 gap-3">
          {field('period')}
          {field('amplitude')}
          {field('interval')}
        </div>
        <div className="mt-3 flex gap-2">
          {running ? (
            <Button variant="danger" onClick={() => run(invoke('stop').then(setState))}>
              <Square className="size-4" /> {t('ui.stop')}
            </Button>
          ) : (
            <Button variant="primary" onClick={() => run(invoke('start', settings).then(setState))}>
              <Play className="size-4" /> {t('ui.start')}
            </Button>
          )}
        </div>
      </Card>

      <Card id={`${ID}.values`} title={t('test-signal.values')}>
        <div className="flex flex-col gap-3">
          <Sparkline history={history} amplitude={state?.settings.amplitude ?? settings.amplitude} />
          <div className="grid grid-cols-4 gap-2">
            <Value label="sine" value={state?.sine ?? '—'} />
            <Value label="ramp" value={state?.ramp ?? '—'} />
            <Value label="square" value={state?.square ?? '—'} />
            <Value label="setpoint" value={state?.setpoint ?? '—'} />
          </div>
          <Field label={t('test-signal.setpoint')} className="max-w-xs">
            <CommitInput value={state?.setpoint ?? ''} onCommit={(v) => run(invoke('setpoint', v))} />
          </Field>
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <Activity className="size-3.5" />
            {t('test-signal.points', {
              points: ['sine', 'ramp', 'square', 'setpoint', 'running'].map((id) => pointKey(ID, id)).join(', ')
            })}
          </p>
        </div>
      </Card>

      <Card id={`${ID}.host`} title={t('test-signal.host')}>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => run(ping())}>
            <Radio className="size-4" /> {t('test-signal.ping')}
          </Button>
          {pong && <span className="test-signal-pong text-xs">{pong}</span>}
        </div>
      </Card>
    </div>
  )
}

export default { manifest, icon: Activity, Component: TestSignalView }
