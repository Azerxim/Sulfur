import { useMemo, useState } from 'react'
import { Repeat, Send, Square } from 'lucide-react'
import { Button, Card, ErrorBanner, Field, Input, Select, usePersistentState } from '@azerxim/sulfur-sdk/ui'
import { DEFAULT_SEND_CONFIG, LINE_ENDINGS, MAX_SEND_HISTORY, MIN_REPEAT } from '../shared/constants'
import { encodePayload, toHex } from '../shared/codec'
import { serialApi } from './api'
import { t } from '../shared/i18n'

/** Octets montrés dans l'aperçu au plus. */
const PREVIEW_BYTES = 48

export default function SendCard({ status }) {
  const [config, setConfig] = usePersistentState('serial', 'send', DEFAULT_SEND_CONFIG)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const open = status.open
  const repeating = status.repeating
  const set = (patch) => setConfig((c) => ({ ...c, ...patch }))
  const payload = { mode: config.mode, text: config.text, lineEnding: config.lineEnding }

  const preview = useMemo(() => {
    if (!config.text) return null
    try {
      return { bytes: encodePayload({ mode: config.mode, text: config.text, lineEnding: config.lineEnding }) }
    } catch (err) {
      return { error: err.message }
    }
  }, [config.mode, config.text, config.lineEnding])

  async function run(action) {
    setBusy(true)
    setError(null)
    try {
      await action()
      // Saisie retenue dans l'historique (la plus récente en tête, sans doublon).
      setConfig((c) => ({
        ...c,
        history: [c.text, ...(c.history ?? []).filter((h) => h !== c.text)].slice(0, MAX_SEND_HISTORY)
      }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const send = () => open && !busy && run(() => serialApi.send(payload))

  return (
    <Card id="serial.send" title={t('serial.send.title')} className="shrink-0">
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-[8rem_minmax(0,1fr)_9rem_auto] items-end gap-3">
          <Field label={t('serial.send.mode')}>
            <Select value={config.mode} onChange={(e) => set({ mode: e.target.value })}>
              <option value="text">{t('serial.send.modes.text')}</option>
              <option value="hex">{t('serial.send.modes.hex')}</option>
            </Select>
          </Field>
          <Field label={config.mode === 'hex' ? t('serial.send.hexHint') : t('serial.send.textHint')}>
            <Input
              className="font-mono"
              list="serial-send-history"
              placeholder={config.mode === 'hex' ? '01 03 00 00 00 0A C5 CD' : 'AT\\r'}
              value={config.text}
              onChange={(e) => set({ text: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && send()}
            />
            <datalist id="serial-send-history">
              {(config.history ?? []).map((h) => (
                <option key={h} value={h} />
              ))}
            </datalist>
          </Field>
          <Field label={t('serial.send.lineEnding')}>
            <Select
              value={config.lineEnding}
              disabled={config.mode === 'hex'}
              onChange={(e) => set({ lineEnding: e.target.value })}
            >
              {Object.keys(LINE_ENDINGS).map((le) => (
                <option key={le} value={le}>
                  {t(`serial.lineEndings.${le}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Button variant="primary" disabled={!open || busy || !preview?.bytes} onClick={send}>
            <Send className="size-4" /> {t('serial.send.send')}
          </Button>
        </div>

        <div className="flex min-h-5 items-center gap-2 font-mono text-xs">
          {preview?.error ? (
            <span className="text-red-300">{preview.error}</span>
          ) : preview?.bytes ? (
            <>
              <span className="font-sans text-slate-500">
                {t('serial.send.preview', { count: preview.bytes.length })}
              </span>
              <span className="truncate text-slate-300">
                {toHex(preview.bytes.subarray(0, PREVIEW_BYTES))}
                {preview.bytes.length > PREVIEW_BYTES && ' …'}
              </span>
            </>
          ) : (
            <span className="font-sans text-slate-500">
              {open ? t('serial.send.empty') : t('serial.send.portClosed')}
            </span>
          )}
        </div>

        <div className="flex items-end gap-3">
          <Field label={t('serial.send.interval')} className="w-36">
            <Input
              type="number"
              min={MIN_REPEAT}
              value={config.interval}
              disabled={!!repeating}
              onChange={(e) => set({ interval: Number(e.target.value) })}
            />
          </Field>
          {repeating ? (
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => serialApi.stopRepeat().catch((err) => setError(err.message))}
            >
              <Square className="size-3.5" /> {t('serial.send.stopRepeat')}
            </Button>
          ) : (
            <Button
              disabled={!open || busy || !preview?.bytes}
              onClick={() => run(() => serialApi.startRepeat(payload, config.interval))}
            >
              <Repeat className="size-3.5" /> {t('serial.send.startRepeat')}
            </Button>
          )}
          {repeating && (
            <span className="mb-2 text-xs text-amber-300">
              {t('serial.send.repeating', { interval: repeating.interval, count: repeating.bytes })}
            </span>
          )}
        </div>
        <ErrorBanner error={error} onClose={() => setError(null)} />
      </div>
    </Card>
  )
}
