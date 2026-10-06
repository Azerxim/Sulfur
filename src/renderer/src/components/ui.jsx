/** Composants d'interface partagés par tous les modules. */

import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'

const buttonVariants = {
  primary: 'bg-sulfur-400 text-ink-950 hover:bg-sulfur-300 disabled:bg-ink-700 disabled:text-slate-500',
  secondary: 'bg-ink-800 text-slate-200 hover:bg-ink-700 disabled:text-slate-600',
  danger: 'bg-red-500/15 text-red-300 hover:bg-red-500/25 disabled:text-slate-600',
  ghost: 'text-slate-400 hover:bg-ink-800 hover:text-slate-200 disabled:text-slate-600'
}

export function Button({ variant = 'secondary', size = 'md', className = '', ...props }) {
  const sizes = { sm: 'h-7 px-2.5 text-xs', md: 'h-9 px-3.5 text-sm', icon: 'size-7' }
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed ${sizes[size]} ${buttonVariants[variant]} ${className}`}
      {...props}
    />
  )
}

/** État replié d'une section, mémorisé localement par identifiant (sans effet si le stockage est indisponible). */
function useCollapsed(id, initial) {
  const key = id && `sulfur:collapsed:${id}`
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const saved = key && localStorage.getItem(key)
      return saved === null || saved === undefined ? initial : saved === '1'
    } catch {
      return initial
    }
  })
  const toggle = () =>
    setCollapsed((c) => {
      try {
        if (key) localStorage.setItem(key, c ? '0' : '1')
      } catch {
        // stockage indisponible : l'état n'est simplement pas mémorisé
      }
      return !c
    })
  return [collapsed, toggle]
}

/**
 * Section à en-tête. Elle peut être repliée par un clic sur l'en-tête (`collapsible`, actif par défaut) ;
 * `id` permet de mémoriser cet état entre deux lancements.
 */
export function Card({ id, title, actions, className = '', collapsible = true, defaultCollapsed = false, children }) {
  const [collapsed, toggle] = useCollapsed(id, defaultCollapsed)
  const canCollapse = collapsible && !!title
  const isCollapsed = canCollapse && collapsed

  return (
    <section
      className={`flex min-h-0 flex-col rounded-lg border border-ink-800 bg-ink-900 ${className} ${
        isCollapsed ? 'h-fit min-h-0! flex-none!' : ''
      }`}
    >
      {(title || actions) && (
        <div
          className={`flex items-center justify-between gap-2 px-4 py-2.5 ${isCollapsed ? '' : 'border-b border-ink-800'} ${
            canCollapse ? 'cursor-pointer select-none' : ''
          }`}
          onClick={canCollapse ? toggle : undefined}
        >
          <h2 className="flex items-center gap-1.5 text-sm font-medium text-slate-200">
            {canCollapse && (
              <button
                type="button"
                aria-expanded={!isCollapsed}
                title={isCollapsed ? 'Déplier' : 'Réduire'}
                className="-ml-1 grid size-5 place-items-center rounded text-slate-500 hover:bg-ink-800 hover:text-slate-200"
                onClick={(e) => {
                  e.stopPropagation()
                  toggle()
                }}
              >
                <ChevronDown className={`size-4 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
              </button>
            )}
            {title}
          </h2>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        </div>
      )}
      {!isCollapsed && <div className="min-h-0 flex-1 p-4">{children}</div>}
    </section>
  )
}

const inputClass =
  'h-9 w-full rounded-md border border-ink-700 bg-ink-950 px-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sulfur-500 focus:outline-none disabled:opacity-50'

export function Input({ className = '', ...props }) {
  return <input className={`${inputClass} ${className}`} {...props} />
}

/** Champ texte qui ne valide qu'à la sortie du champ ou sur Entrée (Échap annule). */
export function CommitInput({ value, onCommit, className = '', ...props }) {
  const [draft, setDraft] = useState(String(value))
  const [editing, setEditing] = useState(false)
  // Ne pas écraser la saisie en cours quand la valeur change (ex : valeur en direct).
  useEffect(() => {
    if (!editing) setDraft(String(value))
  }, [value, editing])
  const commit = () => {
    setEditing(false)
    if (draft !== String(value)) onCommit(draft)
  }
  return (
    <Input
      {...props}
      className={className}
      value={draft}
      onFocus={() => setEditing(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') setDraft(String(value))
      }}
    />
  )
}

export function Select({ className = '', children, ...props }) {
  return (
    <select className={`${inputClass} ${className}`} {...props}>
      {children}
    </select>
  )
}

export function Field({ label, children, className = '' }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-xs text-slate-400">{label}</span>
      {children}
    </label>
  )
}

export function StatusDot({ on, label }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-slate-400">
      <span className={`size-2 rounded-full ${on ? 'bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400/60' : 'bg-slate-600'}`} />
      {label}
    </span>
  )
}

export function ErrorBanner({ error, onClose }) {
  if (!error) return null
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
      <span className="break-all">{error}</span>
      {onClose && (
        <button onClick={onClose} className="text-red-300/70 hover:text-red-200">
          ✕
        </button>
      )}
    </div>
  )
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="flex gap-1 rounded-lg bg-ink-900 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex items-center gap-2 rounded-md px-4 py-1.5 text-sm transition-colors ${
            value === t.id ? 'bg-ink-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {t.icon && <t.icon className="size-4" />}
          {t.label}
          {t.badge}
        </button>
      ))}
    </div>
  )
}

export function Checkbox({ label, className = '', ...props }) {
  return (
    <label className={`inline-flex items-center gap-2 text-sm text-slate-300 has-disabled:opacity-50 ${className}`}>
      <input type="checkbox" className="size-4 accent-sulfur-400" {...props} />
      {label}
    </label>
  )
}

/** Fenêtre modale simple (fermeture par Échap ou clic sur le fond). */
export function Modal({ title, onClose, actions, children, className = 'max-w-4xl' }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div className={`flex max-h-full w-full flex-col rounded-lg border border-ink-700 bg-ink-900 shadow-2xl ${className}`}>
        <div className="flex items-center justify-between gap-2 border-b border-ink-800 px-4 py-3">
          <h2 className="text-sm font-medium text-slate-100">{title}</h2>
          <div className="flex items-center gap-2">
            {actions}
            <button onClick={onClose} className="text-slate-500 hover:text-slate-200" autoFocus>
              ✕
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
      </div>
    </div>
  )
}
