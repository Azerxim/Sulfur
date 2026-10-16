import { useEffect, useRef } from 'react'
import { Eraser } from 'lucide-react'
import { Button, Checkbox } from '@renderer/components/ui'
import { getLocale } from '@shared/i18n'
import { t } from '../shared/i18n'

const LEVEL_STYLES = {
  info: 'text-slate-200',
  warn: 'text-amber-300',
  error: 'text-red-300'
}

function format(value) {
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const time = (ms) => new Date(ms).toLocaleTimeString(getLocale(), { hour12: false, fractionalSecondDigits: 3 })

/**
 * Messages des nœuds « Débogage », avertissements et erreurs des nœuds (les plus récents en bas).
 * Un clic sur l'en-tête d'un message sélectionne le nœud qui l'a produit.
 */
export default function DebugPanel({
  messages,
  flows,
  onlyCurrent,
  onOnlyCurrent,
  currentFlowId,
  labelOf,
  onSelect,
  onClear
}) {
  const list = onlyCurrent ? messages.filter((m) => m.flowId === currentFlowId) : messages
  const end = useRef(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [list.length])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-ink-800 px-3 py-2">
        <Checkbox
          className="text-xs!"
          label={t('simulator.debug.currentFlow')}
          checked={onlyCurrent}
          onChange={(e) => onOnlyCurrent(e.target.checked)}
        />
        <Button variant="ghost" size="sm" className="ml-auto" title={t('simulator.debug.clear')} onClick={onClear}>
          <Eraser className="size-3.5" /> {t('simulator.debug.clear')}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {!list.length && <p className="p-1 text-xs text-slate-500">{t('simulator.debug.empty')}</p>}
        {list.map((m) => {
          const flow = flows.find((f) => f.id === m.flowId)
          const node = flow?.nodes.find((n) => n.id === m.nodeId)
          return (
            <div key={m.id} className="mb-1.5 rounded border border-ink-800 bg-ink-950 text-xs">
              <button
                type="button"
                className="flex w-full items-center gap-2 border-b border-ink-800 px-2 py-1 text-left text-[11px] text-slate-500 hover:text-slate-300"
                onClick={() => node && onSelect(m.flowId, m.nodeId)}
              >
                <span className="shrink-0 tabular-nums">{time(m.time)}</span>
                <span className="min-w-0 flex-1 truncate">
                  {node ? labelOf(node) : m.name || t(`simulator.nodes.${m.type}`)}
                  {flow && !onlyCurrent && flow.id !== currentFlowId && ` · ${flow.name}`}
                </span>
              </button>
              <pre
                className={`overflow-x-auto px-2 py-1 font-mono break-all whitespace-pre-wrap select-text ${LEVEL_STYLES[m.level]}`}
              >
                {format(m.value)}
              </pre>
            </div>
          )
        })}
        <div ref={end} />
      </div>
    </div>
  )
}
