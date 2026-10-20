import { useEffect, useRef, useState } from 'react'
import { FolderOpen, Play, Square, Trash2 } from 'lucide-react'
import { Button, Card, Checkbox, ErrorBanner, Field, Input, Select, StatusDot } from '@renderer/components/ui'
import { formatTime } from '@shared/i18n'
import { usePersistentState } from '@renderer/module-config'
import { BLOCK_SIZES, DEFAULT_SERVER_CONFIG } from '../shared/constants'
import { tftpApi } from './api'
import { formatSize } from './format'
import { t } from '../shared/i18n'

const MAX_SHOWN = 300
const LIVE_DEBOUNCE = 500
const LEVEL_STYLES = { info: 'text-slate-300', warn: 'text-amber-300', error: 'text-red-300' }

function ServerLog() {
  const [entries, setEntries] = useState([])
  useEffect(() => {
    tftpApi.server.logs().then(setEntries)
    return tftpApi.server.onLog((entry) => setEntries((list) => [...list.slice(-(MAX_SHOWN - 1)), entry]))
  }, [])
  return (
    <Card
      id="tftp.server.log"
      title={t('tftp.server.log', { count: entries.length })}
      className="min-h-56 shrink-0"
      actions={
        <Button
          size="sm"
          variant="ghost"
          disabled={!entries.length}
          onClick={() => tftpApi.server.clearLogs().then(setEntries)}
        >
          <Trash2 className="size-3.5" /> {t('tftp.server.clearLog')}
        </Button>
      }
    >
      {entries.length ? (
        <div className="flex flex-col font-mono text-xs">
          {[...entries].reverse().map((e) => (
            <div
              key={e.id}
              className="grid grid-cols-[5rem_10rem_minmax(0,1fr)] gap-2 border-t border-ink-800 py-1 first:border-t-0"
            >
              <span className="text-slate-500">{formatTime(e.time)}</span>
              <span className="truncate text-slate-500">{e.remote}</span>
              <span className={`break-all ${LEVEL_STYLES[e.level] ?? ''}`}>{e.message}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-600">{t('tftp.server.noLog')}</p>
      )}
    </Card>
  )
}

export default function ServerPanel({ status }) {
  const [config, setConfig] = usePersistentState('tftp', 'server', status.config ?? DEFAULT_SERVER_CONFIG)
  const [defaultRoot, setDefaultRoot] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const timer = useRef(null)
  const running = status.running
  const locked = running || busy

  useEffect(() => {
    tftpApi.server.defaultRoot().then(setDefaultRoot)
  }, [])
  useEffect(() => {
    if (running && status.config) setConfig((c) => ({ ...c, ...status.config }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  /** Réglages modifiables serveur démarré : envoyés après un court délai. */
  function live(patch) {
    const next = { ...config, ...patch }
    setConfig(next)
    if (!running) return
    clearTimeout(timer.current)
    timer.current = setTimeout(
      () =>
        tftpApi.server
          .update(next)
          .then(() => setError(null))
          .catch((err) => setError(err.message)),
      LIVE_DEBOUNCE
    )
  }
  const update = (patch) => setConfig((c) => ({ ...c, ...patch }))

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

  const transfers = status.transfers ?? []

  return (
    <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-2">
      <Card
        id="tftp.server.config"
        title={t('tftp.server.title')}
        className="shrink-0"
        actions={
          <>
            <StatusDot
              on={running}
              label={running ? t('tftp.server.running', { count: transfers.length }) : t('ui.stopped')}
            />
            {running ? (
              <Button variant="danger" size="sm" disabled={busy} onClick={() => run(tftpApi.server.stop)}>
                <Square className="size-3.5" /> {t('ui.stop')}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                disabled={busy}
                onClick={() => run(() => tftpApi.server.start(config))}
              >
                <Play className="size-3.5" /> {busy ? t('ui.starting') : t('ui.start')}
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[1fr_8rem_minmax(0,3fr)] items-end gap-4">
            <Field label={t('tftp.server.host')}>
              <Input value={config.host} disabled={locked} onChange={(e) => update({ host: e.target.value })} />
            </Field>
            <Field label={t('tftp.server.port')}>
              <Input
                type="number"
                value={config.port}
                disabled={locked}
                onChange={(e) => update({ port: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('tftp.server.root')}>
              <div className="flex gap-1">
                <Input
                  className="font-mono"
                  placeholder={defaultRoot}
                  value={config.root}
                  disabled={locked}
                  onChange={(e) => update({ root: e.target.value })}
                />
                <Button
                  disabled={locked}
                  onClick={() => tftpApi.server.pickRoot().then((root) => root && update({ root }))}
                >
                  {t('tftp.server.choose')}
                </Button>
                <Button
                  variant="ghost"
                  title={t('tftp.server.openRoot')}
                  onClick={() => tftpApi.server.openRoot(config.root).catch((err) => setError(err.message))}
                >
                  <FolderOpen className="size-4" />
                </Button>
              </div>
            </Field>
          </div>
          <div className="grid grid-cols-[repeat(3,minmax(0,10rem))_1fr] items-end gap-4">
            <Field label={t('tftp.server.timeout')}>
              <Input type="number" value={config.timeout} onChange={(e) => live({ timeout: Number(e.target.value) })} />
            </Field>
            <Field label={t('tftp.server.retries')}>
              <Input type="number" value={config.retries} onChange={(e) => live({ retries: Number(e.target.value) })} />
            </Field>
            <Field label={t('tftp.server.maxBlockSize')}>
              <Select value={config.maxBlockSize} onChange={(e) => live({ maxBlockSize: Number(e.target.value) })}>
                {BLOCK_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex flex-wrap gap-x-6 gap-y-2 pb-2">
              <Checkbox
                label={t('tftp.server.allowWrite')}
                checked={config.allowWrite}
                onChange={(e) => live({ allowWrite: e.target.checked })}
              />
              <Checkbox
                label={t('tftp.server.allowOverwrite')}
                checked={config.allowOverwrite}
                disabled={!config.allowWrite}
                onChange={(e) => live({ allowOverwrite: e.target.checked })}
              />
            </div>
          </div>
          <p className="text-xs text-slate-500">{t('tftp.server.hint')}</p>
          {status.endpoint && (
            <div className="flex items-center gap-2 rounded-md bg-ink-950 px-3 py-2 font-mono text-sm text-sulfur-300">
              {status.endpoint}
              <span className="font-sans text-xs text-slate-500">· {t('tftp.server.counters', status.counters)}</span>
            </div>
          )}
          <ErrorBanner error={error} onClose={() => setError(null)} />
        </div>
      </Card>

      {running && (
        <Card
          id="tftp.server.transfers"
          title={t('tftp.server.transfers', { count: transfers.length })}
          className="shrink-0"
        >
          {transfers.length ? (
            <table className="w-full text-left text-sm">
              <tbody>
                {transfers.map((x) => (
                  <tr key={x.id} className="border-t border-ink-800 first:border-t-0">
                    <td className="px-2 py-1 font-mono text-xs text-slate-500">{x.remote}</td>
                    <td className="px-2 py-1 text-xs text-sulfur-300">{x.direction === 'write' ? 'WRQ' : 'RRQ'}</td>
                    <td className="px-2 py-1 font-mono text-xs break-all text-slate-200">{x.file}</td>
                    <td className="px-2 py-1 text-right font-mono text-xs text-slate-400">
                      {formatSize(x.bytes)}
                      {x.total != null && ` / ${formatSize(x.total)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-slate-600">{t('tftp.server.noTransfer')}</p>
          )}
        </Card>
      )}

      <ServerLog />
    </div>
  )
}
