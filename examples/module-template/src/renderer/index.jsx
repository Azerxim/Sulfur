/**
 * Interface du module (React) : composants partagés du SDK, réglages enregistrés avec
 * usePersistentState, appels au process principal par `window.sulfur.invoke('<id>:<action>')` et
 * événements reçus par `window.sulfur.on('<id>:<event>')`.
 */
import { useEffect, useState } from 'react'
import { faPlay, faRotateLeft, faStop, faStopwatch } from '@fortawesome/free-solid-svg-icons'
import { pointKey } from '@azerxim/sulfur-sdk'
import {
  Button,
  Card,
  CommitInput,
  ErrorBanner,
  Field,
  Input,
  StatusDot,
  usePersistentState,
  Icon
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
    <div className="flex flex-col gap-3 p-4">
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
              <Icon icon={faStop} className="size-4" /> {t('ui.stop')}
            </Button>
          ) : (
            <Button variant="primary" onClick={() => run(invoke('start', settings))}>
              <Icon icon={faPlay} className="size-4" /> {t('ui.start')}
            </Button>
          )}
          <Button onClick={() => run(invoke('reset'))}>
            <Icon icon={faRotateLeft} className="size-4" />
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

/**
 * Extension : onglet ajouté à la page d'un autre module (`target`, déclaré dans `extends` du
 * manifeste). Il reçoit `target` et `module` et n'appelle que les canaux de son propre module.
 */
function CounterTab({ target, module }) {
  const [state, setState] = useState(null)
  useEffect(() => {
    invoke('state')
      .then(setState)
      .catch(() => {})
    return window.sulfur.on(`${module}:state`, setState)
  }, [module])
  return (
    <Card id={`${ID}.extension`} title={t('my-module.counter')}>
      <div className="flex items-center gap-3">
        <StatusDot on={!!state?.running} label={t(state?.running ? 'my-module.running' : 'my-module.stopped')} />
        <span className="ml-auto font-mono text-2xl text-slate-100 tabular-nums">{state?.value ?? '—'}</span>
      </div>
      <p className="mt-3 text-xs text-slate-500">{t('my-module.extensionHint', { target, module })}</p>
    </Card>
  )
}

/**
 * Export par défaut : manifeste, icône de la barre latérale (FontAwesome), composant de la page et
 * onglets apportés à d'autres modules (facultatifs ; sans page, `icon` et `Component` peuvent être
 * omis : le module ne fait alors que compléter les modules visés).
 */
export default {
  manifest,
  icon: faStopwatch,
  Component: MyModuleView,
  extensions: [
    {
      target: 'modbus',
      tab: { id: 'counter', label: () => t('my-module.extensionTab'), icon: faStopwatch, Component: CounterTab }
    }
  ]
}
