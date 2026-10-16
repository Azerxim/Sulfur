import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button, Card, CommitInput, ErrorBanner } from '@renderer/components/ui'
import { getLocale } from '@shared/i18n'
import { DEFAULT_POLL_INTERVAL } from '../shared/constants'
import { plcsimApi } from './api'
import { t } from '../shared/i18n'

const formatValue = (v) => {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number' && !Number.isInteger(v)) return Number(v.toPrecision(7)).toString()
  return String(v)
}
const formatTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString(getLocale(), { hour12: false }) + '.' + iso.slice(20, 23) : '—'

const isBool = (w) => (w.kind === 'address' ? w.dataType === 'Bool' : w.type === 'Bool')

/** Variables surveillées (toutes instances), écrites depuis la liste ou par le simulateur. */
export default function WatchesCard({ status }) {
  const [live, setLive] = useState({})
  const [error, setError] = useState(null)
  const watches = status.watches ?? []

  useEffect(() => plcsimApi.onData((d) => setLive((l) => ({ ...l, [d.id]: d }))), [])
  useEffect(() => {
    if (!status.connected) setLive({})
  }, [status.connected])

  const run = (action) => action().catch((err) => setError(err.message))

  return (
    <Card
      id="plcsim.watches"
      title={t('ui.monitoring', { count: watches.length })}
      className="min-h-48 shrink-0"
      actions={
        <label className="flex items-center gap-2 text-xs text-slate-400">
          {t('plcsim.watches.pollEvery')}
          <CommitInput
            type="number"
            min={100}
            className="h-7! w-20!"
            value={status.pollInterval ?? DEFAULT_POLL_INTERVAL}
            onCommit={(value) => run(() => plcsimApi.setPollInterval(Number(value)))}
          />
          ms
        </label>
      }
    >
      <div className="flex flex-col gap-3">
        {watches.length ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="pb-2 font-medium">{t('plcsim.watches.instance')}</th>
                <th className="pb-2 font-medium">{t('plcsim.watches.variable')}</th>
                <th className="pb-2 font-medium">{t('ui.type')}</th>
                <th className="pb-2 font-medium">{t('ui.value')}</th>
                <th className="pb-2 font-medium">{t('ui.write')}</th>
                <th className="pb-2 font-medium">{t('ui.timestamp')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {watches.map((w) => {
                const d = live[w.id]
                return (
                  <tr key={w.id} className="border-t border-ink-800">
                    <td className="py-1.5 pr-3 text-slate-300">{w.instance}</td>
                    <td className="py-1.5 pr-3">
                      <span className="font-mono text-[13px] text-slate-200">
                        {w.kind === 'address' ? w.address : w.name}
                      </span>{' '}
                      {w.label && <span className="text-xs text-slate-500">{w.label}</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-xs text-slate-400">{w.dataType}</td>
                    <td
                      className={`py-1.5 pr-3 font-mono text-[13px] tabular-nums ${
                        d?.error ? 'font-sans text-xs text-red-300' : 'text-sulfur-300'
                      }`}
                    >
                      {d ? (d.error ?? formatValue(d.value)) : '—'}
                    </td>
                    <td className="w-36 py-1.5 pr-3">
                      {isBool(w) ? (
                        <Button
                          size="sm"
                          disabled={!status.connected}
                          onClick={() => run(() => plcsimApi.writeWatch(w.id, !d?.value))}
                        >
                          {t('ui.toggle')}
                        </Button>
                      ) : (
                        <CommitInput
                          className="h-7! font-mono"
                          disabled={!status.connected}
                          value=""
                          onCommit={(value) => value !== '' && run(() => plcsimApi.writeWatch(w.id, value))}
                        />
                      )}
                    </td>
                    <td className="py-1.5 pr-3 font-mono text-xs text-slate-400 tabular-nums">{formatTime(d?.time)}</td>
                    <td className="py-1.5 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        title={t('ui.remove2')}
                        onClick={() => run(() => plcsimApi.removeWatch(w.id))}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-500">{t('plcsim.watches.none')}</p>
        )}
        <p className="text-xs text-slate-500">{t('plcsim.watches.hint')}</p>
        <ErrorBanner error={error} onClose={() => setError(null)} />
      </div>
    </Card>
  )
}
