import { useState } from 'react'
import { Plug, PlugZap } from 'lucide-react'
import { Button, Card, Checkbox, ErrorBanner, Field, Input, StatusDot } from '@renderer/components/ui'
import { usePersistentState } from '@renderer/module-config'
import { DEFAULT_API_ROOT, DEFAULT_SETTINGS } from '../shared/constants'
import { plcsimApi } from './api'
import { t } from '../shared/i18n'

/** Connexion à l'API Simulation Runtime (chemin des DLL, connexion au démarrage). */
export default function ConnectionCard({ status }) {
  const [settings, setSettings] = usePersistentState('plcsim', 'settings', DEFAULT_SETTINGS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const connected = status.connected
  const info = status.info

  async function run(action) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const connect = () => run(() => plcsimApi.connect(settings))
  const working = busy || status.connecting

  return (
    <Card
      id="plcsim.connection"
      title={t('plcsim.connection.title')}
      className="shrink-0"
      actions={
        <StatusDot
          on={connected}
          label={
            connected
              ? t('plcsim.connection.connected', { version: info?.apiVersion ?? '?' })
              : status.connecting
                ? t('plcsim.connection.loading')
                : t('ui.disconnected')
          }
        />
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-end gap-3">
          <Field className="flex-1" label={t('plcsim.connection.apiPath')}>
            <Input
              className="font-mono"
              value={settings.apiPath}
              placeholder={t('plcsim.connection.auto', { path: DEFAULT_API_ROOT })}
              disabled={connected || working}
              onChange={(e) => setSettings((s) => ({ ...s, apiPath: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && !connected && connect()}
            />
          </Field>
          {connected ? (
            <Button variant="danger" disabled={working} onClick={() => run(plcsimApi.disconnect)}>
              <Plug className="size-4" /> {t('ui.disconnect')}
            </Button>
          ) : (
            <Button variant="primary" disabled={working} onClick={connect}>
              <PlugZap className="size-4" /> {working ? t('ui.connecting') : t('ui.connect')}
            </Button>
          )}
        </div>
        <Checkbox
          label={t('plcsim.connection.autoConnect')}
          checked={!!settings.autoConnect}
          onChange={(e) => setSettings((s) => ({ ...s, autoConnect: e.target.checked }))}
        />
        {connected && info ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-slate-500">{t('plcsim.connection.dll')}</dt>
            <dd className="font-mono text-xs break-all text-slate-300 select-text">
              {info.dll} ({info.bits} bits)
            </dd>
            <dt className="text-slate-500">{t('plcsim.connection.runtime')}</dt>
            <dd className={info.runtimeAvailable ? 'text-emerald-300' : 'text-amber-300'}>
              {info.runtimeAvailable ? t('plcsim.connection.runtimeAvailable') : t('plcsim.connection.runtimeMissing')}
            </dd>
            <dt className="text-slate-500">{t('plcsim.connection.networkMode')}</dt>
            <dd className="text-slate-300">
              {t(`plcsim.networkModes.${info.networkMode}`, null, info.networkMode || '—')}
            </dd>
            <dt className="text-slate-500">{t('plcsim.connection.storage')}</dt>
            <dd className="font-mono text-xs break-all text-slate-400 select-text">{info.storagePath || '—'}</dd>
          </dl>
        ) : (
          <p className="text-xs text-slate-500">{t('plcsim.connection.hint')}</p>
        )}
        {connected && info?.networkMode === 'Softbus' && (
          <p className="text-xs text-slate-500">{t('plcsim.connection.softbusHint')}</p>
        )}
        <ErrorBanner error={error ?? status.error} onClose={() => setError(null)} />
      </div>
    </Card>
  )
}
