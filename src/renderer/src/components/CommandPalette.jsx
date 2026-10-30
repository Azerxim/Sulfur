import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { StatusDot } from '@azerxim/sulfur-sdk/ui'
import { useI18n, useManifestText } from '../preferences'
import { useModuleActivity } from '../activity'

/** Texte comparable sans casse ni accents. */
const normalize = (text) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * Palette de commandes (Ctrl K) : aller à un module ou à une page en tapant son nom, sa description
 * ou son groupe. Flèches pour choisir, Entrée pour ouvrir, Échap ou clic à côté pour fermer.
 */
export default function CommandPalette({ groups, pages, onSelect, onClose }) {
  const { t } = useI18n()
  const text = useManifestText()
  const activity = useModuleActivity()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const list = useRef(null)

  const entries = [
    ...groups.flatMap((group) =>
      group.modules.map((m) => ({ item: m, group: t(`app.groups.${group.id}`), module: true }))
    ),
    ...pages.map((p) => ({ item: p, group: null, module: false }))
  ].map((e) => ({ ...e, id: e.item.manifest.id, ...text(e.item.manifest) }))
  const q = normalize(query.trim())
  const items = q
    ? entries.filter((e) => normalize(`${e.name} ${e.description} ${e.group ?? ''}`).includes(q))
    : entries
  const current = Math.min(index, Math.max(items.length - 1, 0))

  useEffect(() => {
    list.current?.children[current]?.scrollIntoView({ block: 'nearest' })
  }, [current])

  const pick = (entry) => {
    if (!entry) return
    onSelect(entry.id)
    onClose()
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      setIndex((current + step + items.length) % Math.max(items.length, 1))
    } else if (e.key === 'Enter') {
      pick(items[current])
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  const hint = (entry) => {
    if (!entry.module) return entry.description
    return activity(entry.id).active ? `${entry.group} · ${t('app.activity.active')}` : entry.group
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 px-4 pt-24 backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('app.search')}
        className="mx-auto flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-ink-800 bg-ink-900 shadow-2xl"
      >
        <label className="flex h-14 shrink-0 items-center gap-3 border-b border-ink-800 px-4">
          <Search className="size-4 text-slate-500" />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={items[current] ? `command-palette-${items[current].id}` : undefined}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setIndex(0)
            }}
            onKeyDown={onKeyDown}
            placeholder={t('app.searchPlaceholder')}
            className="h-full min-w-0 flex-1 bg-transparent text-base text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
          <kbd className="rounded border border-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">Esc</kbd>
        </label>

        <ul id="command-palette-list" role="listbox" ref={list} className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {items.map((entry, i) => (
            <li
              key={entry.id}
              id={`command-palette-${entry.id}`}
              role="option"
              aria-selected={i === current}
              onMouseMove={() => setIndex(i)}
              onClick={() => pick(entry)}
              className={`flex h-10 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm ${
                i === current ? 'bg-sulfur-400/12 text-slate-100' : 'text-slate-300'
              }`}
            >
              <span className="grid w-4 shrink-0 place-items-center">
                {entry.module ? (
                  <StatusDot on={activity(entry.id).active} />
                ) : (
                  <entry.item.icon className="size-4 text-slate-500" />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate">{entry.name}</span>
              <span className="max-w-[50%] truncate text-xs text-slate-500">{hint(entry)}</span>
            </li>
          ))}
        </ul>
        {!items.length && (
          <p className="px-4 pb-8 text-center text-sm text-slate-500">{t('app.noResult', { query })}</p>
        )}

        <footer className="flex shrink-0 flex-wrap items-center gap-4 border-t border-ink-800 px-4 py-2.5 text-xs text-slate-500">
          {[
            ['↑ ↓', 'navigate'],
            ['↵', 'open'],
            ['Esc', 'close']
          ].map(([key, action]) => (
            <span key={action} className="inline-flex items-center gap-1.5">
              <kbd className="rounded border border-ink-800 px-1.5 font-mono text-[10px]">{key}</kbd>
              {t(`app.paletteKeys.${action}`)}
            </span>
          ))}
        </footer>
      </div>
    </div>
  )
}
