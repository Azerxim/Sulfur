import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button, Card } from '@renderer/components/ui'
import { formatTime } from '@shared/i18n'
import { s7Api } from './api'
import { t } from '../shared/i18n'

const MAX_LOG = 300
const LEVELS = {
  info: 'text-slate-400',
  warn: 'text-amber-300',
  error: 'text-red-300'
}

/** Clients connectés à l'automate simulé et journal des événements. */
export default function ServerActivity({ status }) {
  const [logs, setLogs] = useState([])

  useEffect(() => {
    s7Api.server.logs().then(setLogs)
    return s7Api.server.onLog((entry) => setLogs((l) => [...l.slice(-(MAX_LOG - 1)), entry]))
  }, [])

  const connections = status.connections ?? []
  const shown = logs.slice().reverse()

  return (
    <div className="grid shrink-0 grid-cols-[1fr_1.4fr] gap-4">
      <Card id="s7.server.connections" title={t('s7.activity.clients', { count: connections.length })}>
        {connections.length ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="pb-2 font-medium">{t('s7.activity.client')}</th>
                <th className="pb-2 font-medium">TSAP</th>
                <th className="pb-2 pl-3 text-right font-medium">PDU</th>
                <th className="pb-2 pl-3 text-right font-medium">{t('s7.activity.requests')}</th>
              </tr>
            </thead>
            <tbody>
              {connections.map((c) => (
                <tr key={c.id} className="border-t border-ink-800">
                  <td className="py-1.5 pr-2">
                    <div className="font-mono text-[13px] text-slate-200">{c.remote}</div>
                    <div className="text-[11px] text-slate-500">
                      {t('s7.activity.since', { time: formatTime(c.since) })}
                    </div>
                  </td>
                  <td className="py-1.5 pr-2 font-mono text-xs text-slate-400">
                    {c.tsap ? `${c.tsap.local} → ${c.tsap.remote}` : '—'}
                  </td>
                  <td className="py-1.5 text-right font-mono text-slate-400 tabular-nums">{c.pduSize ?? '—'}</td>
                  <td className="py-1.5 text-right font-mono text-slate-300 tabular-nums">{c.requests}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-500">
            {status.running ? t('s7.activity.noClient') : t('s7.activity.serverStopped')}
          </p>
        )}
      </Card>

      <Card
        id="s7.server.log"
        title={t('s7.activity.log')}
        actions={
          <Button
            variant="ghost"
            size="icon"
            title={t('s7.activity.clearLog')}
            onClick={() => s7Api.server.clearLogs().then(setLogs)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        }
      >
        <div className="max-h-64 overflow-auto font-mono text-xs">
          {shown.length ? (
            shown.map((l) => (
              <div key={l.id} className="flex gap-3 border-t border-ink-800 py-1 first:border-t-0">
                <span className="shrink-0 text-slate-600">{formatTime(l.time)}</span>
                <span className={`break-all select-text ${LEVELS[l.level]}`}>{l.message}</span>
              </div>
            ))
          ) : (
            <p className="font-sans text-sm text-slate-500">{t('s7.activity.noEvent')}</p>
          )}
        </div>
      </Card>
    </div>
  )
}
