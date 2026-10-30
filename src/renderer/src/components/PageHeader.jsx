import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@azerxim/sulfur-sdk/ui'
import { useI18n } from '../preferences'

/** Libellé de l'activité d'un module : serveur en marche (et sessions), client connecté, outil actif. */
export function activityLabel(t, activity) {
  if (activity.server)
    return activity.sessions > 0 ? t('app.activity.sessions', { count: activity.sessions }) : t('app.activity.running')
  if (activity.client) return t('app.activity.client')
  return t(activity.active ? 'app.activity.active' : 'app.activity.stopped')
}

/** Pastille d'activité : verte en marche, neutre à l'arrêt. */
export function ActivityPill({ activity }) {
  const { t } = useI18n()
  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ${
        activity.active ? 'bg-emerald-400/12 text-emerald-300' : 'bg-ink-850 text-slate-400'
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${activity.active ? 'bg-emerald-400' : 'border-[1.5px] border-slate-500'}`}
      />
      {activityLabel(t, activity)}
    </span>
  )
}

/** Point d'accès d'un serveur en marche, copiable. */
function EndpointChip({ endpoint }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  return (
    <span className="inline-flex h-7 max-w-full items-center gap-1 rounded-[7px] border border-ink-800 bg-ink-950 pr-0.5 pl-2.5">
      <span className="truncate font-mono text-xs text-slate-200 select-text">{endpoint}</span>
      <Button
        variant="ghost"
        size="icon"
        className="size-6!"
        title={t('ui.copy')}
        onClick={() => {
          navigator.clipboard.writeText(endpoint)
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        }}
      >
        {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
      </Button>
    </span>
  )
}

/**
 * En-tête d'une page : icône, nom et description ; pour un module, son activité et le point d'accès
 * de son serveur en marche.
 */
export default function PageHeader({ icon: Icon, name, description, activity }) {
  return (
    <header className="flex items-center gap-3 border-b border-ink-800 bg-ink-900 px-6 py-3.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-[9px] bg-sulfur-400/12 text-sulfur-400">
        <Icon className="size-[18px]" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-lg font-semibold tracking-tight text-slate-100">{name}</h1>
          {activity && <ActivityPill activity={activity} />}
          {activity?.endpoint && <EndpointChip endpoint={activity.endpoint} />}
        </div>
        <p className="truncate text-xs text-slate-400">{description}</p>
      </div>
    </header>
  )
}
