import { useEffect, useState } from 'react'
import { Lock, Trash2 } from 'lucide-react'
import { Button, Card } from '@renderer/components/ui'
import { modbusApi } from './api'
import { formatTime } from '@shared/i18n'
import { t } from '../shared/i18n'

const MAX_LOG = 300
const LEVELS = {
  info: 'text-slate-400',
  warn: 'text-amber-300',
  error: 'text-red-300'
}

const time = (iso) => formatTime(iso)

/** Clients connectés et journal des événements de sécurité du serveur. */
export default function ServerActivity({ status }) {
  const [logs, setLogs] = useState([])
  const [onlyAlerts, setOnlyAlerts] = useState(false)

  useEffect(() => {
    modbusApi.server.logs().then(setLogs)
    return modbusApi.server.onLog((entry) => setLogs((l) => [...l.slice(-(MAX_LOG - 1)), entry]))
  }, [])

  const connections = status.connections ?? []
  const shown = (onlyAlerts ? logs.filter((l) => l.level !== 'info') : logs).slice().reverse()
  const alerts = logs.filter((l) => l.level !== 'info').length

  return (
    <div className="grid shrink-0 grid-cols-[1fr_1.4fr] gap-4">
      <Card id="modbus.server.connections" title={t('modbus.activity.clients', { count: connections.length })}>
        {connections.length ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="pb-2 font-medium">{t('modbus.activity.client')}</th>
                <th className="pb-2 font-medium">{t('modbus.activity.security')}</th>
                <th className="pb-2 pl-3 text-right font-medium">{t('modbus.activity.requests')}</th>
                <th className="pb-2 pl-3 text-right font-medium">{t('modbus.activity.denied')}</th>
              </tr>
            </thead>
            <tbody>
              {connections.map((c) => (
                <tr key={c.id} className="border-t border-ink-800">
                  <td className="py-1.5 pr-2">
                    <div className="font-mono text-[13px] text-slate-200">{c.remote}</div>
                    <div className="text-[11px] text-slate-500">{t('modbus.activity.since', { time: time(c.since) })}</div>
                  </td>
                  <td className="py-1.5 pr-2 text-xs">
                    {c.tls ? (
                      <>
                        <div className="flex items-center gap-1 text-emerald-300">
                          <Lock className="size-3" /> {t('modbus.activity.tlsRole', { protocol: c.tls.protocol, role: c.tls.role })}
                        </div>
                        <div className="text-slate-500">
                          {c.tls.commonName ?? t('modbus.activity.noCertificate')} ·{' '}
                          {c.permissions.write ? t('modbus.activity.readWrite') : t('modbus.activity.readOnly')}
                        </div>
                      </>
                    ) : (
                      <span className="text-slate-500">{t('modbus.activity.plain')}</span>
                    )}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums text-slate-300">{c.requests}</td>
                  <td className={`py-1.5 text-right font-mono tabular-nums ${c.denied ? 'text-amber-300' : 'text-slate-500'}`}>{c.denied}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-500">{status.running ? t('modbus.activity.noClient') : t('modbus.activity.serverStopped')}</p>
        )}
      </Card>

      <Card
        id="modbus.server.log"
        title={`${t('modbus.activity.log')}${alerts ? ` · ${t('modbus.activity.alerts', { count: alerts })}` : ''}`}
        actions={
          <>
            <label className="flex items-center gap-1.5 text-xs text-slate-400">
              <input type="checkbox" className="size-3.5 accent-sulfur-400" checked={onlyAlerts} onChange={(e) => setOnlyAlerts(e.target.checked)} />
              {t('modbus.activity.alertsOnly')}
            </label>
            <Button variant="ghost" size="icon" title={t('modbus.activity.clearLog')} onClick={() => modbusApi.server.clearLogs().then(setLogs)}>
              <Trash2 className="size-3.5" />
            </Button>
          </>
        }
      >
        <div className="max-h-64 overflow-auto font-mono text-xs">
          {shown.length ? (
            shown.map((l) => (
              <div key={l.id} className="flex gap-3 border-t border-ink-800 py-1 first:border-t-0">
                <span className="shrink-0 text-slate-600">{time(l.time)}</span>
                <span className={`break-all select-text ${LEVELS[l.level]}`}>{l.message}</span>
              </div>
            ))
          ) : (
            <p className="font-sans text-sm text-slate-500">{t('modbus.activity.noEvent')}</p>
          )}
        </div>
      </Card>
    </div>
  )
}
