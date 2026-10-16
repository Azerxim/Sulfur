import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Select } from '@renderer/components/ui'
import { t } from '../shared/i18n'

/** Libellé d'un groupe de points : « OPC UA · Serveur ». */
export const groupLabel = (p) => `${p.moduleName} · ${t(`simulator.groups.${p.group}`)}`

const grouped = (points) => Object.entries(Object.groupBy(points, groupLabel))

/** Choix d'un point (clé `<module>/<id>`), regroupés par module et par rôle. */
export function PointSelect({ points, value, onChange, ...props }) {
  const known = points.some((p) => p.key === value)
  return (
    <Select {...props} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      {!known && <option value={value ?? ''}>{value || '—'}</option>}
      {grouped(points).map(([group, list]) => (
        <optgroup key={group} label={group}>
          {list.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  )
}

/** Choix de plusieurs points ; aucun point choisi = `emptyLabel` (ex. « Tous les points »). */
export function PointsPicker({ points, value = [], onChange, emptyLabel, disabled, idOf = (p) => p.key }) {
  const [open, setOpen] = useState(false)
  const root = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => !root.current?.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const names = points.filter((p) => value.includes(idOf(p))).map((p) => p.name)
  const toggle = (id) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center gap-2 rounded-md border border-ink-700 bg-ink-950 px-3 text-left text-sm text-slate-100 disabled:opacity-50"
      >
        <span className="min-w-0 flex-1 truncate">{names.length ? names.join(', ') : emptyLabel}</span>
        <ChevronDown className="size-3.5 shrink-0 text-slate-500" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-72 w-full min-w-64 overflow-auto rounded-md border border-ink-700 bg-ink-900 p-2 shadow-2xl">
          {grouped(points).map(([group, list]) => (
            <div key={group} className="mb-1">
              <div className="px-1 py-1 text-[11px] font-medium tracking-wide text-slate-500 uppercase">{group}</div>
              {list.map((p) => (
                <label
                  key={idOf(p)}
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-slate-300 hover:bg-ink-800"
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-sulfur-400"
                    checked={value.includes(idOf(p))}
                    onChange={() => toggle(idOf(p))}
                  />
                  {p.name}
                </label>
              ))}
            </div>
          ))}
          {!points.length && <p className="p-1 text-sm text-slate-500">{t('simulator.noPoint')}</p>}
        </div>
      )}
    </div>
  )
}
