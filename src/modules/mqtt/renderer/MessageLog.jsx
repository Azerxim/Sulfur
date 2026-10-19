import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button, Card, Checkbox, Field, Input } from '@renderer/components/ui'
import { formatTime } from '@shared/i18n'
import { isValidFilter, matchTopic } from '../shared/topics'
import { t } from '../shared/i18n'

/** Messages affichés au plus (les plus récents). */
const MAX_SHOWN = 300

/**
 * Journal de messages MQTT filtrable par topic (jokers + et #). `withEvents` : le journal contient
 * aussi des événements (connexions, abonnements) que l'on peut masquer.
 */
export default function MessageLog({
  id,
  title,
  entries,
  onClear,
  emptyLabel,
  clearLabel = t('mqtt.log.clear'),
  withEvents = false,
  showFrom = false
}) {
  const [filter, setFilter] = useState('')
  const [events, setEvents] = useState(true)
  const valid = !filter || isValidFilter(filter)

  const shown = useMemo(
    () =>
      entries
        .filter((e) => {
          if (e.type && e.type !== 'publish') return withEvents && events && !filter
          return !filter || !valid || matchTopic(filter, e.topic)
        })
        .slice(-MAX_SHOWN)
        .reverse(),
    [entries, filter, valid, events, withEvents]
  )

  return (
    <Card
      id={id}
      title={title}
      className="min-h-64 shrink-0"
      actions={
        <Button variant="ghost" size="icon" title={clearLabel} onClick={onClear}>
          <Trash2 className="size-3.5" />
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-end gap-4">
          <Field label={t('mqtt.log.filter')} className="w-96">
            <Input
              className={`font-mono ${valid ? '' : 'border-red-500/60'}`}
              placeholder="plant/+/temperature"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </Field>
          {withEvents && (
            <Checkbox
              className="mb-2"
              label={t('mqtt.log.events')}
              checked={events}
              onChange={(e) => setEvents(e.target.checked)}
            />
          )}
        </div>
        {shown.length ? (
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-ink-900 text-left text-xs text-slate-500">
                <tr>
                  <th className="pb-2 font-medium">{t('mqtt.log.time')}</th>
                  <th className="pb-2 font-medium">{t('mqtt.log.topic')}</th>
                  <th className="pb-2 font-medium">QoS</th>
                  <th className="pb-2 font-medium">{t('mqtt.log.payload')}</th>
                  {showFrom && <th className="pb-2 font-medium">{t('mqtt.log.from')}</th>}
                </tr>
              </thead>
              <tbody className="font-mono text-[13px]">
                {shown.map((e) =>
                  e.type && e.type !== 'publish' ? (
                    <tr key={e.id} className="border-t border-ink-800">
                      <td className="py-1 pr-3 text-slate-500 tabular-nums">{formatTime(e.time)}</td>
                      <td
                        colSpan={showFrom ? 4 : 3}
                        className={`py-1 font-sans text-xs ${e.type === 'error' ? 'text-red-300' : 'text-sky-300'}`}
                      >
                        {t(`mqtt.log.eventText.${e.type}`, e)}
                      </td>
                    </tr>
                  ) : (
                    <tr key={e.id} className="border-t border-ink-800 align-top">
                      <td className="py-1 pr-3 text-slate-500 tabular-nums">{formatTime(e.time)}</td>
                      <td className="py-1 pr-3 break-all text-sulfur-300">{e.topic}</td>
                      <td className="py-1 pr-3 whitespace-nowrap text-slate-400">
                        {e.qos}
                        {e.retain && <span className="ml-1 text-amber-300">R</span>}
                      </td>
                      <td
                        className="py-1 pr-3 break-all text-slate-200 select-text"
                        title={t('mqtt.log.bytes', { size: e.size })}
                      >
                        {e.payload}
                      </td>
                      {showFrom && <td className="py-1 text-slate-400">{e.clientId ?? t('mqtt.log.broker')}</td>}
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">{entries.length ? t('mqtt.log.noMatch') : emptyLabel}</p>
        )}
      </div>
    </Card>
  )
}
