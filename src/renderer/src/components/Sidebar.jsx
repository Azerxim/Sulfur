import { useI18n, useManifestText } from '../preferences'

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

export default function Sidebar({ modules, pages = [], activeId, onSelect }) {
  const { t } = useI18n()
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-ink-800 bg-ink-900">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="grid size-8 place-items-center rounded-md bg-sulfur-400 font-bold text-on-accent">S</div>
        <div>
          <div className="text-sm font-semibold tracking-wide text-slate-100">Sulfur</div>
          <div className="text-[11px] text-slate-500">{t('app.tagline')}</div>
        </div>
      </div>

      <div className="px-5 pt-2 pb-2 text-[11px] font-medium tracking-wider text-slate-500 uppercase">{t('app.modules')}</div>
      <nav className="flex flex-col gap-0.5 px-2">
        {modules.map((m) => (
          <NavItem key={m.manifest.id} item={m} active={m.manifest.id === activeId} onSelect={onSelect} />
        ))}
      </nav>

      <nav className="mt-auto flex flex-col gap-0.5 border-t border-ink-800 px-2 pt-2">
        {pages.map((p) => (
          <NavItem key={p.manifest.id} item={p} active={p.manifest.id === activeId} onSelect={onSelect} />
        ))}
      </nav>
      <div className="px-5 py-3 text-[11px] text-slate-600">v0.1.0</div>
    </aside>
  )
}
