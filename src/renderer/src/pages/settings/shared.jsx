import { compareVersions, parseVersion } from '@azerxim/sulfur-sdk'

/** Interrupteur (case à cocher accessible) : jaune activé, neutre désactivé. */
export function Switch({ checked, onChange, label, disabled = false, title }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex h-5 w-[34px] shrink-0 rounded-full p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${
        checked ? 'bg-sulfur-400' : 'bg-ink-700'
      }`}
    >
      <span
        className={`size-4 rounded-full transition-transform ${
          checked ? 'translate-x-3.5 bg-on-accent' : 'translate-x-0 bg-slate-400'
        }`}
      />
    </button>
  )
}

/** Réglage sur une ligne : libellé et explication à gauche, contrôle à droite (dessous si la place manque). */
export function SettingRow({ label, hint, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1 basis-64">
        <div className="text-sm font-medium text-slate-100">{label}</div>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

/** Choix unique parmi quelques options, en sélecteur compact. */
export function Segmented({ label, options, value, onChange, size = 'md' }) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex flex-wrap gap-0.5 rounded-lg border border-ink-800 bg-ink-950 p-0.5"
    >
      {options.map(({ id, label: text, title, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          title={title}
          onClick={() => onChange(id)}
          className={`flex items-center gap-1.5 rounded-md transition-colors ${size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm'} ${
            value === id ? 'bg-ink-850 font-medium text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {Icon && <Icon className={`size-4 ${value === id ? 'text-sulfur-400' : ''}`} />}
          {text}
        </button>
      ))}
    </div>
  )
}

/**
 * Panneau des Paramètres : en-tête (titre, sous-titre, actions) et contenu sans marge intérieure,
 * pour des listes dont les lignes vont d'un bord à l'autre.
 */
export function Panel({ title, subtitle, actions, children, labelledBy }) {
  return (
    <section aria-labelledby={labelledBy} className="overflow-hidden rounded-[10px] border border-ink-800 bg-ink-900">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-ink-800 px-3.5 py-2.5">
        <div className="flex min-w-0 flex-1 basis-56 flex-col">
          <h2 id={labelledBy} className="text-sm font-semibold text-slate-100">
            {title}
          </h2>
          {subtitle && <span className="text-xs text-slate-500">{subtitle}</span>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  )
}

/** Petite étiquette (Additionnel, Chargé, Nouvelle…), colorée selon `tone`. */
const BADGE_TONES = {
  neutral: 'bg-ink-850 text-slate-400',
  accent: 'bg-sulfur-400/12 text-sulfur-300',
  ok: 'bg-emerald-400/12 text-emerald-300',
  warn: 'bg-amber-400/12 text-amber-300'
}

export function Badge({ tone = 'neutral', children }) {
  return (
    <span className={`rounded px-1.5 py-px text-[11px] font-medium whitespace-nowrap ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  )
}

/** Comparaison d'une version à une autre (null si l'une n'est pas semver). */
export const versionOrder = (version, current) =>
  parseVersion(version) && parseVersion(current) ? compareVersions(version, current) : null
