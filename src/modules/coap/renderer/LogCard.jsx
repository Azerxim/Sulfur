import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button, Card } from '@azerxim/sulfur-sdk/ui'
import { formatTime } from '@azerxim/sulfur-sdk'
import { CODE_LABELS, codeName } from '../shared/codec'
import { MAX_LOG } from '../shared/constants'
import { t } from '../shared/i18n'

/** Distance au bas de la liste (px) en deçà de laquelle l'affichage suit les nouvelles entrées. */
const STICK_DISTANCE = 24

/** Code de réponse coloré selon sa classe (2.xx vert, 4.xx orange, 5.xx rouge). */
export function CodeBadge({ code }) {
  if (code === null || code === undefined) return null
  const cls = code >> 5
  const tone = cls === 2 ? 'text-emerald-300' : cls === 4 ? 'text-amber-300' : 'text-red-300'
  return (
    <span className={`font-mono ${tone}`} title={CODE_LABELS[code]}>
      {codeName(code)}
    </span>
  )
}

/**
 * Journal d'un rôle du module (serveur CoAP, serveur LwM2M, appareil) : entrées reçues en direct par
 * `subscribe`, rendues par `renderEntry`, collé au bas tant que l'utilisateur ne remonte pas.
 */
export default function LogCard({ id, load, subscribe, clear, renderEntry }) {
  const [entries, setEntries] = useState([])
  const listRef = useRef(null)
  const stick = useRef(true)

  useEffect(() => {
    load().then(setEntries)
    return subscribe((batch) => setEntries((list) => [...list, ...batch].slice(-MAX_LOG)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useLayoutEffect(() => {
    const list = listRef.current
    if (list && stick.current) list.scrollTop = list.scrollHeight
  }, [entries.length])

  return (
    <Card
      id={id}
      title={t('coap.log.title', { count: entries.length })}
      className="min-h-64 flex-1"
      actions={
        <Button variant="ghost" size="icon" title={t('coap.log.clear')} onClick={() => clear().then(setEntries)}>
          <Trash2 className="size-3.5" />
        </Button>
      }
    >
      {entries.length ? (
        <div
          ref={listRef}
          className="h-full max-h-96 min-h-40 overflow-auto font-mono text-xs"
          onScroll={(e) => {
            const el = e.currentTarget
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_DISTANCE
          }}
        >
          {entries.map((entry) => (
            <div key={entry.id} className="flex gap-3 border-t border-ink-800/60 py-1 first:border-t-0">
              <span className="shrink-0 text-slate-500 tabular-nums">{formatTime(entry.time)}</span>
              {entry.text ? (
                <span
                  className={`font-sans ${entry.level === 'error' ? 'text-red-300' : entry.level === 'warn' ? 'text-amber-300' : 'text-slate-400'}`}
                >
                  {entry.text}
                </span>
              ) : (
                renderEntry(entry)
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">{t('coap.log.empty')}</p>
      )}
    </Card>
  )
}
