import { Download } from 'lucide-react'
import { useI18n, useManifestText } from '../preferences'
import { useUpdater } from '../updater'
// Seul le champ `version` est intégré au build (import nommé d'un fichier JSON).
import { version } from '../../../../package.json'

function NavItem({ item: { manifest, icon: Icon }, active, onSelect }) {
  const text = useManifestText()
  return (
    <button
      onClick={() => onSelect(manifest.id)}
      className={`flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
        active ? 'bg-ink-800 text-slate-100' : 'text-slate-400 hover:bg-ink-850 hover:text-slate-200'
      }`}
    >
      <Icon className={`size-4 ${active ? 'text-sulfur-400' : ''}`} />
      {text(manifest).name}
    </button>
  )
}

/** Rappel discret d'une mise à jour disponible ou prête, qui ouvre les paramètres. */
function UpdateNotice({ onSelect }) {
  const { t } = useI18n()
  const { state } = useUpdater()
  if (!state || !['available', 'downloading', 'downloaded'].includes(state.status)) return null
  return (
    <button
      onClick={() => onSelect('settings')}
      className="mx-2 mt-2 flex items-center gap-2 rounded-md bg-sulfur-400/10 px-3 py-2 text-left text-xs text-sulfur-300 hover:bg-sulfur-400/20"
    >
      <Download className="size-3.5 shrink-0" />
      {t(state.status === 'downloaded' ? 'app.updateReady' : 'app.updateAvailable', { version: state.version })}
    </button>
  )
}

export default function Sidebar({ groups, pages = [], activeId, onSelect }) {
  const { t } = useI18n()
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-ink-800 bg-ink-900">
      <button
        onClick={() => onSelect('home')}
        title={t('home.name')}
        className="flex items-center gap-2 px-5 py-5 text-left"
      >
        <div className="grid size-8 place-items-center rounded-md bg-sulfur-400 font-bold text-on-accent">S</div>
        <div>
          <div className="text-sm font-semibold tracking-wide text-slate-100">Sulfur</div>
          <div className="text-[11px] text-slate-500">{t('app.tagline')}</div>
        </div>
      </button>

      <nav className="flex min-h-0 flex-col gap-3 overflow-y-auto px-2 pb-2">
        {groups.map((group) => (
          <div key={group.id} className="flex flex-col gap-0.5">
            <div className="px-3 pt-2 pb-1 text-[11px] font-medium tracking-wider text-slate-500 uppercase">
              {t(`app.groups.${group.id}`)}
            </div>
            {group.modules.map((m) => (
              <NavItem key={m.manifest.id} item={m} active={m.manifest.id === activeId} onSelect={onSelect} />
            ))}
          </div>
        ))}
      </nav>

      <nav className="mt-auto flex flex-col gap-0.5 border-t border-ink-800 px-2 pt-2">
        {pages.map((p) => (
          <NavItem key={p.manifest.id} item={p} active={p.manifest.id === activeId} onSelect={onSelect} />
        ))}
      </nav>
      <UpdateNotice onSelect={onSelect} />
      <div className="px-5 py-3 text-[11px] text-slate-600">v{version}</div>
    </aside>
  )
}
