/**
 * Interface du module (React) : composants partagés du SDK, réglages enregistrés avec
 * usePersistentState, appels au process principal par `window.sulfur.invoke('<id>:<action>')` et
 * événements reçus par `window.sulfur.on('<id>:<event>')`.
 */
import { useEffect, useState } from 'react'
import { Play, RotateCcw, Square, Timer } from 'lucide-react'
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
const invoke = (action, ...args) => window.sulfur.invoke(`${ID}:${action}`, ...args)

function MyModuleView() {
  const [settings, setSettings] = usePersistentState(ID, 'counter', DEFAULTS)
  const [state, setState] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    invoke('state')
      .then(setState)
      .catch((err) => setError(err.message))
    return window.sulfur.on(`${ID}:state`, setState)
  }, [])

  const run = (promise) => promise.then(setState).catch((err) => setError(err.message))
  const running = state?.running ?? false

  return (
    <div className="flex flex-col gap-4 p-6">
      <ErrorBanner error={error} onClose={() => setError(null)} />
      <Card
        id={`${ID}.counter`}
        title={t('my-module.counter')}
        actions={<StatusDot on={running} label={t(running ? 'my-module.running' : 'my-module.stopped')} />}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('my-module.interval')}>
            <Input
              type="number"
              value={settings.interval}
              disabled={running}
              onChange={(e) => setSettings({ ...settings, interval: Number(e.target.value) })}
            />
          </Field>
          <Field label={t('my-module.step')}>
            <CommitInput
              value={state?.step ?? settings.step}
              onCommit={(step) =>
                invoke('step', step)
                  .then((value) => setSettings({ ...settings, step: value }))
                  .catch((err) => setError(err.message))
              }
            />
          </Field>
        </div>
        <div className="mt-3 flex items-center gap-2">
          {running ? (
            <Button variant="danger" onClick={() => run(invoke('stop'))}>
              <Square className="size-4" /> {t('ui.stop')}
            </Button>
          ) : (
            <Button variant="primary" onClick={() => run(invoke('start', settings))}>
              <Play className="size-4" /> {t('ui.start')}
            </Button>
          )}
          <Button onClick={() => run(invoke('reset'))}>
            <RotateCcw className="size-4" />
          </Button>
          <span className="ml-auto font-mono text-2xl text-slate-100 tabular-nums">{state?.value ?? '—'}</span>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {t('my-module.points', { points: ['value', 'step', 'running'].map((id) => pointKey(ID, id)).join(', ') })}
        </p>
      </Card>
    </div>
  )
}

/** Export par défaut : manifeste, icône de la barre latérale (lucide-react) et composant. */
export default { manifest, icon: Timer, Component: MyModuleView }
