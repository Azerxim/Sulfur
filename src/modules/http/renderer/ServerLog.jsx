import { Fragment, useEffect, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Trash2 } from 'lucide-react'
import { Button, Card, Checkbox } from '@renderer/components/ui'
import { formatTime } from '@shared/i18n'
import { MAX_LOG } from '../shared/constants'
import { httpApi } from './api'
import { t } from '../shared/i18n'

const statusColor = (status) =>
  !status
    ? 'text-red-300'
    : status >= 500
      ? 'text-red-300'
      : status >= 400
        ? 'text-amber-300'
        : status >= 300
          ? 'text-sky-300'
          : 'text-emerald-300'

/** Journal des requêtes reçues et des appels de webhooks (les plus récents en haut). */
export default function ServerLog() {
  const [logs, setLogs] = useState([])
  const [onlyErrors, setOnlyErrors] = useState(false)
  const [open, setOpen] = useState(null)

  useEffect(() => {
    httpApi.server.logs().then(setLogs)
    return httpApi.server.onLog((entry) => setLogs((l) => [...l.slice(-(MAX_LOG - 1)), entry]))
  }, [])

  const shown = (onlyErrors ? logs.filter((l) => !l.status || l.status >= 400) : logs).slice().reverse()

  return (
    <Card
      id="http.server.log"
      title={t('http.log.title', { count: logs.length })}
      className="min-h-48 shrink-0"
      actions={
        <>
          <Checkbox
            className="text-xs!"
            label={t('http.log.onlyErrors')}
            checked={onlyErrors}
            onChange={(e) => setOnlyErrors(e.target.checked)}
          />
          <Button
            variant="ghost"
            size="icon"
            title={t('http.log.clear')}
            onClick={() => httpApi.server.clearLogs().then(setLogs)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </>
      }
    >
      {shown.length ? (
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-ink-900 text-left text-xs text-slate-500">
              <tr>
                <th className="w-24 pb-2 font-medium">{t('ui.timestamp')}</th>
                <th className="w-8 pb-2" />
                <th className="w-44 pb-2 font-medium">{t('http.log.remote')}</th>
                <th className="w-20 pb-2 font-medium">{t('http.log.method')}</th>
                <th className="pb-2 font-medium">{t('http.log.path')}</th>
                <th className="w-20 pb-2 text-right font-medium">{t('ui.status')}</th>
                <th className="w-20 pb-2 text-right font-medium">{t('http.log.duration')}</th>
              </tr>
            </thead>
            <tbody className="font-mono text-[13px]">
              {shown.map((l) => (
                <Fragment key={l.id}>
                  <tr
                    className="cursor-pointer border-t border-ink-800 hover:bg-ink-850"
                    onClick={() => setOpen(open === l.id ? null : l.id)}
                  >
                    <td className="py-1 text-slate-500 tabular-nums">{formatTime(l.time)}</td>
                    <td className="py-1" title={t(`http.log.directions.${l.direction}`)}>
                      {l.direction === 'out' ? (
                        <ArrowUpRight className="size-3.5 text-violet-300" />
                      ) : (
                        <ArrowDownLeft className="size-3.5 text-slate-400" />
                      )}
                    </td>
                    <td className="truncate py-1 pr-2 text-slate-400">{l.remote}</td>
                    <td className="py-1 text-slate-300">{l.method}</td>
                    <td className="truncate py-1 pr-2 text-slate-200">
                      {l.path}
                      {l.note && <span className="ml-2 font-sans text-xs text-slate-500">{l.note}</span>}
                    </td>
                    <td className={`py-1 text-right tabular-nums ${statusColor(l.status)}`}>{l.status ?? '—'}</td>
                    <td className="py-1 text-right text-slate-500 tabular-nums">
                      {l.duration !== undefined ? `${l.duration} ms` : ''}
                    </td>
                  </tr>
                  {open === l.id && (
                    <tr className="border-t border-ink-800 bg-ink-950">
                      <td colSpan={7} className="p-2">
                        {l.error && <p className="mb-2 font-sans text-xs text-red-300">{l.error}</p>}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {[
                            ['requestBody', l.requestBody],
                            ['responseBody', l.responseBody]
                          ].map(([key, body]) => (
                            <div key={key}>
                              <div className="mb-1 font-sans text-slate-500">{t(`http.log.${key}`)}</div>
                              <pre className="max-h-48 overflow-auto rounded border border-ink-800 p-2 break-all whitespace-pre-wrap text-slate-300 select-text">
                                {body || '—'}
                              </pre>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-500">{t('http.log.empty')}</p>
      )}
    </Card>
  )
}
