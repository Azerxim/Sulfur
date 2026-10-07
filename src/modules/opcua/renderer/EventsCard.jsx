import { useEffect, useState } from 'react'
import { Bell, BellOff, Check, Eraser } from 'lucide-react'
import { Button, Card } from '@renderer/components/ui'
import { opcuaApi } from './api'
import { formatDateTime } from './format'
import { t } from '../shared/i18n'

/** Nombre d'événements conservés (les plus récents). */
const MAX_EVENTS = 200

const severityStyle = (s) => (s >= 700 ? 'text-red-300' : s >= 400 ? 'text-amber-300' : 'text-slate-300')

function State({ event }) {
  if (event.disabled) return <span className="text-slate-500">{t('opcua.client.disabled')}</span>
  if (!event.conditionId) return '—'
  return (
    <span className="flex flex-wrap gap-1">
      <span className={event.active ? 'text-red-300' : 'text-emerald-300'}>
        {event.active ? t('opcua.client.active') : t('opcua.client.inactive')}
      </span>
      ·
      <span className={event.acked ? 'text-slate-400' : 'text-amber-300'}>
        {event.acked ? t('opcua.client.acked') : t('opcua.client.unacked')}
      </span>
    </span>
  )
}

/** Événements et alarmes reçus de l'objet Server, avec acquittement des alarmes. */
export default function EventsCard({ connected, subscribed, onError }) {
  const [events, setEvents] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => opcuaApi.client.onEvent((e) => setEvents((all) => [e, ...all].slice(0, MAX_EVENTS))), [])
  useEffect(() => {
    if (!connected) setEvents([])
  }, [connected])

  async function run(action) {
    setBusy(true)
    try {
      await action()
    } catch (err) {
      onError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // Seul le dernier événement d'une alarme peut l'acquitter (EventId courant).
  const latest = new Set()
  const seen = new Set()
  for (const e of events) {
    if (e.conditionId && !seen.has(e.conditionId)) {
      seen.add(e.conditionId)
      latest.add(e)
    }
  }

  return (
    <Card
      id="opcua.client.events"
      title={t('opcua.client.events', { count: events.length })}
      className="min-h-64 shrink-0"
      actions={
        <>
          <Button variant="ghost" size="sm" disabled={!events.length} onClick={() => setEvents([])}>
            <Eraser className="size-3.5" /> {t('opcua.client.clearEvents')}
          </Button>
          <Button
            size="sm"
            disabled={!connected || busy}
            onClick={() => run(subscribed ? opcuaApi.client.unsubscribeEvents : opcuaApi.client.subscribeEvents)}
          >
            {subscribed ? <BellOff className="size-3.5" /> : <Bell className="size-3.5" />}
            {subscribed ? t('opcua.client.unsubscribeEvents') : t('opcua.client.subscribeEvents')}
          </Button>
        </>
      }
    >
      <div className="h-full max-h-96 overflow-auto">
        {!events.length ? (
          <p className="text-sm text-slate-500">
            {connected ? t('opcua.client.noEvents') : t('opcua.client.connectToBrowse')}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-ink-900 text-left text-xs text-slate-500">
              <tr>
                <th className="pb-2 font-medium">{t('opcua.client.time')}</th>
                <th className="pb-2 font-medium">{t('opcua.client.source')}</th>
                <th className="pb-2 font-medium">{t('ui.type')}</th>
                <th className="pb-2 font-medium">{t('opcua.client.severity')}</th>
                <th className="pb-2 font-medium">{t('opcua.client.message')}</th>
                <th className="pb-2 font-medium">{t('opcua.client.state')}</th>
                <th />
              </tr>
            </thead>
            <tbody className="text-[13px]">
              {events.map((e, i) => (
                <tr key={`${e.eventId}-${i}`} className="border-t border-ink-800 align-top">
                  <td className="py-1.5 pr-3 font-mono whitespace-nowrap text-slate-400 tabular-nums">
                    {formatDateTime(e.time)}
                  </td>
                  <td className="py-1.5 pr-3 text-slate-300">{e.conditionName ?? e.sourceName ?? '—'}</td>
                  <td className="py-1.5 pr-3 font-mono text-slate-400">{e.eventType ?? '—'}</td>
                  <td className={`py-1.5 pr-3 tabular-nums ${severityStyle(e.severity)}`}>{e.severity ?? '—'}</td>
                  <td className="py-1.5 pr-3 text-slate-200">{e.message ?? '—'}</td>
                  <td className="py-1.5 pr-3 text-xs">
                    <State event={e} />
                  </td>
                  <td className="py-1.5 text-right">
                    {latest.has(e) && e.acked === false && !e.disabled && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          run(() => opcuaApi.client.acknowledge(e.conditionId, e.eventId, t('opcua.client.ackComment')))
                        }
                      >
                        <Check className="size-3.5" /> {t('opcua.client.acknowledge')}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  )
}
