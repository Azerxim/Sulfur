import { useState } from 'react'
import { History } from 'lucide-react'
import { Button, Select } from '@renderer/components/ui'
import { HISTORY_RANGES } from '../shared/constants'
import { opcuaApi } from './api'
import { formatDateTime, formatValue } from './format'
import { t } from '../shared/i18n'

/** Nombre maximal de lignes affichées (les plus récentes). */
const MAX_ROWS = 500

/** Lecture d'historique (HistoryRead) d'une variable historisée. */
export default function HistoryView({ nodeId, onError }) {
  const [range, setRange] = useState(HISTORY_RANGES[1])
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(false)

  async function read() {
    setBusy(true)
    try {
      const end = Date.now()
      setRows((await opcuaApi.client.history(nodeId, end - range, end)).reverse())
    } catch (err) {
      onError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-ink-800 pt-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400">{t('opcua.client.history')}</span>
        <Select className="ml-auto h-7! w-48 text-xs" value={range} onChange={(e) => setRange(Number(e.target.value))}>
          {HISTORY_RANGES.map((ms) => (
            <option key={ms} value={ms}>
              {t(`opcua.client.historyRanges.${ms}`)}
            </option>
          ))}
        </Select>
        <Button size="sm" className="shrink-0 whitespace-nowrap" disabled={busy} onClick={read}>
          <History className="size-3.5" /> {t('opcua.client.readHistory')}
        </Button>
      </div>
      {rows &&
        (rows.length === 0 ? (
          <p className="text-sm text-slate-500">{t('opcua.client.noHistory')}</p>
        ) : (
          <>
            <span className="text-xs text-slate-500">{t('opcua.client.historyCount', { count: rows.length })}</span>
            <div className="max-h-64 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-ink-900 text-left text-xs text-slate-500">
                  <tr>
                    <th className="pb-1 font-medium">{t('ui.timestamp')}</th>
                    <th className="pb-1 font-medium">{t('ui.value')}</th>
                    <th className="pb-1 font-medium">{t('ui.status')}</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-[13px]">
                  {rows.slice(0, MAX_ROWS).map((d, i) => (
                    <tr key={i} className="border-t border-ink-800">
                      <td className="py-1 pr-3 text-slate-400 tabular-nums">{formatDateTime(d.sourceTimestamp)}</td>
                      <td className="py-1 pr-3 break-all text-sulfur-300">{formatValue(d.value)}</td>
                      <td className="py-1 text-slate-400">{d.statusCode}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ))}
    </div>
  )
}
