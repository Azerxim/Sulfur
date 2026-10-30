import { Search } from 'lucide-react'
import { StatusDot } from '@azerxim/sulfur-sdk/ui'
import { useI18n, useManifestText } from '../preferences'
import { useModuleActivity } from '../activity'

/** Raccourci de la palette de commandes, tel qu'il s'écrit sur ce système. */
export const PALETTE_SHORTCUT = /Mac/.test(navigator.platform) ? '⌘ K' : 'Ctrl K'

/** Page de l'application : icône et nom. */
function PageItem({ item: { manifest, icon: Icon }, active, onSelect }) {
  const text = useManifestText()
  return (
    <button
      onClick={() => onSelect(manifest.id)}
      aria-current={active ? 'page' : undefined}
      className={`flex h-8 items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] transition-colors ${
        active ? 'bg-ink-850 font-medium text-slate-100' : 'text-slate-400 hover:bg-ink-850 hover:text-slate-200'
      }`}
    >
      <Icon className={`size-4 ${active ? 'text-sulfur-400' : ''}`} />
      {text(manifest).name}
    </button>
  )
}

/** Module : point d'activité (plein en marche, creux à l'arrêt), nom et port du serveur en marche. */
function ModuleItem({ manifest, activity, active, onSelect }) {
  const text = useManifestText()
  return (
    <button
      onClick={() => onSelect(manifest.id)}
      aria-current={active ? 'page' : undefined}
      className={`flex h-7 items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] transition-colors ${
        active ? 'bg-ink-850 font-medium text-slate-100' : 'text-slate-400 hover:bg-ink-850 hover:text-slate-200'
      }`}
    >
      <StatusDot on={activity.active} />
      <span className="min-w-0 flex-1 truncate">{text(manifest).name}</span>
      {activity.port && <span className="font-mono text-[11px] font-normal text-slate-500">{activity.port}</span>}
    </button>
  )
}

/**
 * Barre latérale : recherche (palette de commandes), accueil, modules par groupe avec leur activité,
 * puis les autres pages de l'application en pied de barre.
 */
export default function Sidebar({ groups, pages = [], activeId, onSelect, onSearch }) {
  const { t } = useI18n()
  const activity = useModuleActivity()
  const [home, ...others] = pages

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-ink-800 bg-ink-900">
      <button
        onClick={() => onSelect('home')}
        title={t('home.name')}
        className="mx-2.5 mt-3 flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-ink-850"
      >
        <div className="grid size-8 place-items-center rounded-lg bg-sulfur-400 font-bold text-on-accent">S</div>
        <div>
          <div className="text-sm font-semibold text-slate-100">Sulfur</div>
          <div className="text-[11px] text-slate-500">{t('app.tagline')}</div>
        </div>
      </button>

      <button
        onClick={onSearch}
        className="mx-2.5 mt-3 mb-2 flex h-8 items-center gap-2 rounded-lg border border-ink-800 bg-ink-950 px-2.5 text-left text-[13px] text-slate-500 transition-colors hover:border-ink-700 hover:text-slate-400"
      >
        <Search className="size-3.5" />
        <span className="flex-1">{t('app.search')}</span>
        <kbd className="rounded border border-ink-800 px-1.5 font-mono text-[10px]">{PALETTE_SHORTCUT}</kbd>
      </button>

      {home && (
        <nav className="flex flex-col px-2.5">
          <PageItem item={home} active={home.manifest.id === activeId} onSelect={onSelect} />
        </nav>
      )}

      <nav className="mt-3 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2.5 pb-3">
        {groups.map((group) => {
          const running = group.modules.filter((m) => activity(m.manifest.id).active).length
          return (
            <div key={group.id} className="flex flex-col gap-px">
              <div className="flex items-center justify-between gap-2 px-2.5 pb-1 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                <span className="truncate">{t(`app.groups.${group.id}`)}</span>
                {running > 0 && (
                  <span className="font-mono font-normal tracking-normal">
                    {running}/{group.modules.length}
                  </span>
                )}
              </div>
              {group.modules.map(({ manifest }) => (
                <ModuleItem
                  key={manifest.id}
                  manifest={manifest}
                  activity={activity(manifest.id)}
                  active={manifest.id === activeId}
                  onSelect={onSelect}
                />
              ))}
            </div>
          )
        })}
      </nav>

      <nav className="flex flex-col gap-px border-t border-ink-800 px-2.5 py-2">
        {others.map((p) => (
          <PageItem key={p.manifest.id} item={p} active={p.manifest.id === activeId} onSelect={onSelect} />
        ))}
      </nav>
    </aside>
  )
}
