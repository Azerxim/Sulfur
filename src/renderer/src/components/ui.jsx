/** Composants d'interface partagés par tous les modules. */

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

export function Card({ title, actions, className = '', children }) {
  return (
    <section className={`flex min-h-0 flex-col rounded-lg border border-ink-800 bg-ink-900 ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-ink-800 px-4 py-2.5">
          <h2 className="text-sm font-medium text-slate-200">{title}</h2>
          <div className="flex items-center gap-2">{actions}</div>
        </div>
      )}
      <div className="min-h-0 flex-1 p-4">{children}</div>
    </section>
  )
}

const inputClass =
  'h-9 w-full rounded-md border border-ink-700 bg-ink-950 px-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sulfur-500 focus:outline-none disabled:opacity-50'

export function Input({ className = '', ...props }) {
  return <input className={`${inputClass} ${className}`} {...props} />
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
