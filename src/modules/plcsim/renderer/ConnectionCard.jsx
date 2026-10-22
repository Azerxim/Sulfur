import { useState } from 'react'
import { Monitor, Network, Plug, PlugZap } from 'lucide-react'
import {
  Button,
  Card,
  Checkbox,
  ErrorBanner,
  Field,
  Input,
  StatusDot,
  Tabs,
  usePersistentState
} from '@azerxim/sulfur-sdk/ui'
import { DEFAULT_API_ROOT, DEFAULT_REMOTE_PORT, DEFAULT_SETTINGS } from '../shared/constants'
import { plcsimApi } from './api'
import { t } from '../shared/i18n'

/**
 * Connexion à l'API Simulation Runtime : Runtime Manager de ce PC ou d'un PC distant, chemin des DLL
 * (obligatoire si S7-PLCSIM Advanced n'est pas installé sur ce PC), connexion au démarrage.
 */
export default function ConnectionCard({ status }) {
  const [stored, setSettings] = usePersistentState('plcsim', 'settings', DEFAULT_SETTINGS)
  const settings = { ...DEFAULT_SETTINGS, ...stored }
  const remote = settings.mode === 'remote'
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
  const locked = connected || working
  // Sans installation de PLCSIM Advanced, rien ne peut être chargé tant que les DLL ne sont pas indiquées.
  const needsDll = status.apiDetected === false && !settings.apiPath.trim()
  const enter = (e) => e.key === 'Enter' && !connected && !needsDll && connect()

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
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-slate-400">{t('plcsim.connection.mode')}</span>
          <div className={locked ? 'pointer-events-none opacity-60' : ''}>
            <Tabs
              value={settings.mode}
              onChange={(mode) => setSettings((s) => ({ ...s, mode }))}
              tabs={[
                { id: 'local', label: t('plcsim.connection.modes.local'), icon: Monitor },
                { id: 'remote', label: t('plcsim.connection.modes.remote'), icon: Network }
              ]}
            />
          </div>
        </div>
        {remote && (
          <div className="flex flex-wrap items-end gap-3">
            <Field className="min-w-64 flex-1" label={t('plcsim.connection.remoteHost')}>
              <Input
                className="font-mono"
                value={settings.remoteHost}
                placeholder="192.168.0.10"
                disabled={locked}
                onChange={(e) => setSettings((s) => ({ ...s, remoteHost: e.target.value }))}
                onKeyDown={enter}
              />
            </Field>
            <Field className="w-32" label={t('plcsim.connection.remotePort')}>
              <Input
                className="font-mono"
                type="number"
                min={1}
                max={65535}
                value={settings.remotePort}
                disabled={locked}
                onChange={(e) => setSettings((s) => ({ ...s, remotePort: e.target.value }))}
                onKeyDown={enter}
              />
            </Field>
          </div>
        )}
        <div className="flex items-end gap-3">
          <Field className="flex-1" label={t('plcsim.connection.apiPath')}>
            <Input
              className="font-mono"
              value={settings.apiPath}
              placeholder={status.apiDetected === false ? '' : t('plcsim.connection.auto', { path: DEFAULT_API_ROOT })}
              disabled={locked}
              onChange={(e) => setSettings((s) => ({ ...s, apiPath: e.target.value }))}
              onKeyDown={enter}
            />
          </Field>
          {connected ? (
            <Button variant="danger" disabled={working} onClick={() => run(plcsimApi.disconnect)}>
              <Plug className="size-4" /> {t('ui.disconnect')}
            </Button>
          ) : (
            <Button variant="primary" disabled={working || needsDll} onClick={connect}>
              <PlugZap className="size-4" /> {working ? t('ui.connecting') : t('ui.connect')}
            </Button>
          )}
        </div>
        {status.apiDetected === false && !connected && (
          <p className={`text-xs ${needsDll ? 'text-amber-300' : 'text-slate-500'}`}>
            {t('plcsim.connection.noApi', { path: DEFAULT_API_ROOT })}
          </p>
        )}
        {remote && !connected && (
          <p className="text-xs text-slate-500">{t('plcsim.connection.remoteHint', { port: DEFAULT_REMOTE_PORT })}</p>
        )}
        <Checkbox
          label={t('plcsim.connection.autoConnect')}
          checked={!!settings.autoConnect}
          onChange={(e) => setSettings((s) => ({ ...s, autoConnect: e.target.checked }))}
        />
        {connected && info ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {status.remote && (
              <>
                <dt className="text-slate-500">{t('plcsim.connection.remoteComputer')}</dt>
                <dd className="text-slate-300 select-text">
                  {info.remote?.computerName || status.remote.host}{' '}
                  <span className="font-mono text-xs text-slate-400">
                    ({status.remote.ip}:{status.remote.port})
                  </span>
                  {info.remote?.version && (
                    <span className="ml-2 text-xs text-slate-500">
                      {t('plcsim.connection.remoteVersion', { version: info.remote.version })}
                    </span>
                  )}
                </dd>
              </>
            )}
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
