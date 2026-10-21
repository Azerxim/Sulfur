import { useEffect, useState } from 'react'
import { Download, Square, Trash2, Upload } from 'lucide-react'
import { Button, Card, Checkbox, ErrorBanner, Field, Input, Select } from '@renderer/components/ui'
import { formatTime } from '@shared/i18n'
import { usePersistentState } from '@renderer/module-config'
import { BLOCK_SIZES, DEFAULT_CLIENT_CONFIG, MODES } from '../shared/constants'
import { tftpApi } from './api'
import { formatSize } from './format'
import { t } from '../shared/i18n'

/** Résultat d'un transfert : taille, débit, options négociées. */
function summary(entry) {
  const seconds = Math.max(entry.duration / 1000, 0.001)
  return t('tftp.client.summary', {
    size: formatSize(entry.size ?? entry.bytes),
    duration: entry.duration,
    rate: formatSize(Math.round((entry.size ?? entry.bytes) / seconds)),
    blocks: entry.blocks,
    blockSize: entry.blockSize,
    retransmissions: entry.retransmissions
  })
}

export default function ClientPanel({ serverPort }) {
  const [config, setConfig] = usePersistentState('tftp', 'client', DEFAULT_CLIENT_CONFIG)
  const [history, setHistory] = useState([])
  const [progress, setProgress] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const update = (patch) => setConfig((c) => ({ ...c, ...patch }))

  useEffect(() => {
    tftpApi.client.history().then(setHistory)
    return tftpApi.client.onProgress(setProgress)
  }, [])
  // Aligne le port sur le serveur local lorsqu'il démarre.
  useEffect(() => {
    if (serverPort) setConfig((c) => ({ ...c, port: serverPort }))
  }, [serverPort, setConfig])

  async function transfer(action) {
    setBusy(true)
    setError(null)
    setProgress(null)
    try {
      const entry = await action(config)
      if (entry) {
        setHistory((list) => [entry, ...list].slice(0, 100))
        if (!entry.ok) setError(entry.error)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const percent = progress?.total ? Math.min(100, Math.round((progress.bytes / progress.total) * 100)) : null

  return (
    <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-2">
      <Card id="tftp.client.transfer" title={t('tftp.client.title')} className="shrink-0">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[1.4fr_0.6fr_2fr] items-end gap-3">
            <Field label={t('tftp.client.host')}>
              <Input
                className="font-mono"
                value={config.host}
                disabled={busy}
                onChange={(e) => update({ host: e.target.value })}
              />
            </Field>
            <Field label={t('tftp.server.port')}>
              <Input
                type="number"
                value={config.port}
                disabled={busy}
                onChange={(e) => update({ port: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('tftp.client.remoteFile')}>
              <Input
                className="font-mono"
                value={config.remoteFile}
                disabled={busy}
                onChange={(e) => update({ remoteFile: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-[repeat(4,minmax(0,9rem))_1fr] items-end gap-3">
            <Field label={t('tftp.client.mode')}>
              <Select value={config.mode} disabled={busy} onChange={(e) => update({ mode: e.target.value })}>
                {MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {t(`tftp.modes.${mode}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('tftp.client.blockSize')}>
              <Select
                value={config.blockSize}
                disabled={busy}
                onChange={(e) => update({ blockSize: Number(e.target.value) })}
              >
                {BLOCK_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('tftp.server.timeout')}>
              <Input
                type="number"
                value={config.timeout}
                disabled={busy}
                onChange={(e) => update({ timeout: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('tftp.server.retries')}>
              <Input
                type="number"
                value={config.retries}
                disabled={busy}
                onChange={(e) => update({ retries: Number(e.target.value) })}
              />
            </Field>
            <Checkbox
              className="pb-2"
              label={t('tftp.client.tsize')}
              checked={config.tsize}
              disabled={busy}
              onChange={(e) => update({ tsize: e.target.checked })}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="primary" disabled={busy} onClick={() => transfer(tftpApi.client.get)}>
              <Download className="size-4" /> {t('tftp.client.get')}
            </Button>
            <Button disabled={busy} onClick={() => transfer(tftpApi.client.put)}>
              <Upload className="size-4" /> {t('tftp.client.put')}
            </Button>
            {busy && (
              <Button variant="ghost" onClick={() => tftpApi.client.abort()}>
                <Square className="size-3.5" /> {t('tftp.client.abort')}
              </Button>
            )}
            {busy && progress && (
              <span className="ml-auto font-mono text-xs text-slate-400">
                {formatSize(progress.bytes)}
                {progress.total != null && ` / ${formatSize(progress.total)}`}
                {percent != null && ` · ${percent} %`}
              </span>
            )}
          </div>
          {busy && percent != null && (
            <div className="h-1 overflow-hidden rounded bg-ink-800">
              <div className="h-full bg-sulfur-400 transition-all" style={{ width: `${percent}%` }} />
            </div>
          )}
          <p className="text-xs text-slate-500">{t('tftp.client.hint')}</p>
          <ErrorBanner error={error} onClose={() => setError(null)} />
        </div>
      </Card>

      <Card
        id="tftp.client.history"
        title={t('tftp.client.history', { count: history.length })}
        className="min-h-48 shrink-0"
        actions={
          <Button
            size="sm"
            variant="ghost"
            disabled={!history.length}
            onClick={() => tftpApi.client.clear().then(setHistory)}
          >
            <Trash2 className="size-3.5" /> {t('tftp.server.clearLog')}
          </Button>
        }
      >
        {history.length ? (
          <table className="w-full text-left text-sm">
            <tbody>
              {history.map((e) => (
                <tr key={e.id} className="border-t border-ink-800 align-top first:border-t-0">
                  <td className="w-20 px-2 py-1 font-mono text-xs text-slate-500">{formatTime(e.time)}</td>
                  <td className="w-12 px-2 py-1 text-xs text-sulfur-300">{e.direction.toUpperCase()}</td>
                  <td className="px-2 py-1">
                    <div className="font-mono text-xs break-all text-slate-200">
                      {e.server} · {e.remoteFile}
                    </div>
                    <div className={`text-xs ${e.ok ? 'text-slate-400' : 'text-red-300'}`}>
                      {e.ok ? summary(e) : e.error}
                    </div>
                    {e.local && <div className="font-mono text-xs break-all text-slate-500">{e.local}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-600">{t('tftp.client.noHistory')}</p>
        )}
      </Card>
    </div>
  )
}
