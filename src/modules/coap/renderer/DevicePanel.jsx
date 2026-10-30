import { useState } from 'react'
import { Play, RefreshCw, Square } from 'lucide-react'
import {
  Button,
  Card,
  Checkbox,
  CommitInput,
  ErrorBanner,
  Field,
  Input,
  StatusDot,
  usePersistentState
} from '@azerxim/sulfur-sdk/ui'
import { formatTime } from '@azerxim/sulfur-sdk'
import { DEFAULT_DEVICE_CONFIG } from '../shared/constants'
import { parsePath, resourceDef } from '../shared/lwm2m'
import { coapApi } from './api'
import LogCard, { CodeBadge } from './LogCard'
import { t } from '../shared/i18n'

const STATE_TONES = {
  registered: 'text-emerald-300',
  registering: 'text-slate-400',
  error: 'text-red-300',
  stopped: 'text-slate-500'
}

/** Ressource modifiable depuis l'interface (écriture autorisée par le modèle LwM2M). */
const writable = (path) => {
  const p = parsePath(path)
  return !!resourceDef(p?.object, p?.resource)?.ops.includes('W')
}

/** Appareil LwM2M simulé : réglages, enregistrement, ressources en direct et journal. */
export default function DevicePanel({ status, lwm2mServer }) {
  const [config, setConfig] = usePersistentState('coap', 'device', DEFAULT_DEVICE_CONFIG)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const running = status.running
  const set = (patch) => setConfig((c) => ({ ...c, ...patch }))
  const locked = running || busy

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

  const text = (key, label, className = 'w-44') => (
    <Field label={label} className={className}>
      <Input
        className="font-mono"
        value={config[key]}
        disabled={locked}
        onChange={(e) => set({ [key]: e.target.value })}
      />
    </Field>
  )

  return (
    <>
      <Card id="coap.device" title={t('coap.device.title')} className="shrink-0">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            {text('endpoint', t('coap.device.endpoint'), 'w-52')}
            {text('serverHost', t('coap.device.serverHost'))}
            <Field label={t('coap.device.serverPort')} className="w-28">
              <Input
                className="font-mono"
                type="number"
                value={config.serverPort}
                disabled={locked}
                onChange={(e) => set({ serverPort: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('coap.device.lifetime')} className="w-28">
              <Input
                type="number"
                value={config.lifetime}
                disabled={locked}
                onChange={(e) => set({ lifetime: Number(e.target.value) })}
              />
            </Field>
            {lwm2mServer?.running && !running && (
              <Button
                size="sm"
                variant="ghost"
                className="h-9"
                onClick={() => set({ serverHost: '127.0.0.1', serverPort: lwm2mServer.config.port })}
              >
                {t('coap.device.useServer', { port: lwm2mServer.config.port })}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            {text('manufacturer', t('coap.device.manufacturer'), 'w-40')}
            {text('model', t('coap.device.model'), 'w-40')}
            {text('serial', t('coap.device.serial'), 'w-32')}
            <Checkbox
              className="h-9"
              label={t('coap.device.objects.temperature')}
              checked={config.objects.temperature}
              disabled={locked}
              onChange={(e) => set({ objects: { ...config.objects, temperature: e.target.checked } })}
            />
            <Checkbox
              className="h-9"
              label={t('coap.device.objects.light')}
              checked={config.objects.light}
              disabled={locked}
              onChange={(e) => set({ objects: { ...config.objects, light: e.target.checked } })}
            />
          </div>
          {config.objects.temperature && (
            <div className="flex flex-wrap items-end gap-3">
              {['min', 'max', 'period'].map((key) => (
                <Field key={key} label={t(`coap.device.temperature.${key}`)} className="w-32">
                  <Input
                    type="number"
                    value={config.temperature[key]}
                    disabled={locked}
                    onChange={(e) => set({ temperature: { ...config.temperature, [key]: Number(e.target.value) } })}
                  />
                </Field>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {running ? (
              <>
                <Button disabled={busy} onClick={() => run(coapApi.device.stop)}>
                  <Square className="size-4" /> {t('ui.stop')}
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy || status.state !== 'registered'}
                  title={t('coap.device.updateHint')}
                  onClick={() => run(coapApi.device.update)}
                >
                  <RefreshCw className="size-4" /> {t('coap.device.update')}
                </Button>
              </>
            ) : (
              <Button variant="primary" disabled={busy} onClick={() => run(() => coapApi.device.start(config))}>
                <Play className="size-4" /> {t('ui.start')}
              </Button>
            )}
            <StatusDot on={status.state === 'registered'} />
            <span className={`text-sm ${STATE_TONES[status.state] ?? 'text-slate-500'}`}>
              {t(`coap.device.states.${status.state ?? 'stopped'}`, { server: status.server ?? '' })}
            </span>
            {status.location && (
              <span className="font-mono text-xs text-slate-500">
                {status.location} · {formatTime(status.registeredAt)}
              </span>
            )}
          </div>
          {status.lastError && <p className="text-xs text-red-300">{status.lastError}</p>}
          <p className="text-xs text-slate-500">{t('coap.device.hint')}</p>
          <ErrorBanner error={error} onClose={() => setError(null)} />
        </div>
      </Card>

      {running && (
        <Card
          id="coap.device.resources"
          title={t('coap.device.resources', { count: status.resources?.length ?? 0 })}
          className="shrink-0"
        >
          <table className="w-full text-sm">
            <tbody>
              {(status.resources ?? []).map((r) => (
                <tr key={r.path} className="border-t border-ink-800/70 first:border-t-0">
                  <td className="w-36 py-1 font-mono text-xs text-slate-500">{r.path}</td>
                  <td className="py-1 text-slate-300">
                    {r.label}
                    {status.observers?.some((o) => r.path.startsWith(o.path)) && (
                      <span className="ml-2 text-xs text-violet-300">{t('coap.device.observed')}</span>
                    )}
                  </td>
                  <td className="w-48 py-1">
                    {writable(r.path) ? (
                      <CommitInput
                        className="h-8! font-mono text-sulfur-300"
                        value={r.value}
                        onCommit={(value) =>
                          coapApi.device.setValue(r.path, value).catch((err) => setError(err.message))
                        }
                      />
                    ) : (
                      <span className="block px-3 text-right font-mono text-slate-200">{r.value}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <LogCard
        id="coap.device.log"
        load={coapApi.device.log}
        subscribe={coapApi.device.onLog}
        clear={coapApi.device.clearLog}
        renderEntry={(e) => (
          <>
            <span className="w-36 shrink-0 truncate text-slate-500">{e.remote}</span>
            <span className="w-14 shrink-0 text-sky-300">{e.method}</span>
            <span className="min-w-0 flex-1 truncate text-slate-200">{e.path}</span>
            <CodeBadge code={e.code} />
          </>
        )}
      />
    </>
  )
}
