import { useState } from 'react'
import { Copy, Play, Square } from 'lucide-react'
import { Button, Card, ErrorBanner, Field, Input, StatusDot } from '@renderer/components/ui'
import { formatTime } from '@shared/i18n'
import { usePersistentState } from '@renderer/module-config'
import { DEFAULT_GATEWAY_CONFIG } from '../shared/constants'
import { serialApi } from './api'
import { t } from '../shared/i18n'

export default function GatewayCard({ status, portOpen }) {
  const [config, setConfig] = usePersistentState('serial', 'gateway', DEFAULT_GATEWAY_CONFIG)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const running = status.running
  const locked = running || busy
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

  return (
    <Card
      id="serial.gateway"
      title={t('serial.gateway.title')}
      className="shrink-0"
      defaultCollapsed
      actions={
        <>
          <StatusDot
            on={running}
            label={running ? t('serial.gateway.running', { count: status.clients.length }) : t('ui.stopped')}
          />
          {running ? (
            <Button variant="danger" size="sm" disabled={busy} onClick={() => run(serialApi.gateway.stop)}>
              <Square className="size-3.5" /> {t('ui.stop')}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              disabled={busy || !portOpen}
              title={portOpen ? undefined : t('serial.gateway.needsPort')}
              onClick={() => run(() => serialApi.gateway.start(config))}
            >
              <Play className="size-3.5" /> {busy ? t('ui.starting') : t('ui.start')}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-[2fr_1fr_1fr] items-end gap-4">
          <Field label={t('serial.gateway.host')}>
            <Input value={config.host} disabled={locked} onChange={(e) => set({ host: e.target.value })} />
          </Field>
          <Field label={t('serial.gateway.port')}>
            <Input
              type="number"
              value={config.port}
              disabled={locked}
              onChange={(e) => set({ port: Number(e.target.value) })}
            />
          </Field>
          <Field label={t('serial.gateway.maxClients')}>
            <Input
              type="number"
              min={1}
              value={config.maxClients}
              disabled={locked}
              onChange={(e) => set({ maxClients: Number(e.target.value) })}
            />
          </Field>
        </div>
        <p className="text-xs text-slate-500">{t('serial.gateway.hint')}</p>
        {running && (
          <div className="flex flex-col gap-1 rounded-md bg-ink-950 px-3 py-2 font-mono text-sm text-sulfur-300">
            <div className="flex items-center gap-2">
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
            {status.clients.length ? (
              status.clients.map((c) => (
                <div key={`${c.remote}-${c.since}`} className="font-sans text-xs text-slate-400">
                  {t('serial.gateway.client', { remote: c.remote, time: formatTime(c.since) })}
                </div>
              ))
            ) : (
              <div className="font-sans text-xs text-slate-500">{t('serial.gateway.noClient')}</div>
            )}
          </div>
        )}
        <ErrorBanner error={error} onClose={() => setError(null)} />
      </div>
    </Card>
  )
}
