import { getLocale } from '@azerxim/sulfur-sdk'
import { t } from '../shared/i18n'

/** Date et heure complètes (avec millisecondes) dans la langue de l'interface. */
export const formatDateTime = (ms) =>
  ms === null || ms === undefined
    ? '—'
    : new Date(ms).toLocaleString(getLocale(), {
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3
      })

/** Écart signé lisible : « +2 h 03 min 05 s », « −250 ms ». `ms` en millisecondes. */
export function formatOffset(ms) {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—'
  const sign = ms < 0 ? '−' : '+'
  let rest = Math.abs(ms)
  if (rest < 1000) return `${sign}${rest.toFixed(rest < 10 ? 2 : 0)} ms`
  // Au-delà d'une minute, la seconde suffit (évite « 23 h 59 min 59 s » pour un jour moins 3 ms).
  if (rest >= 60_000) rest = Math.round(rest / 1000) * 1000
  const parts = []
  const units = [
    ['days', 86_400_000],
    ['hours', 3_600_000],
    ['minutes', 60_000]
  ]
  for (const [unit, size] of units) {
    if (rest >= size) {
      parts.push(t(`ntp.units.${unit}`, { n: Math.floor(rest / size) }))
      rest %= size
    }
  }
  parts.push(t('ntp.units.seconds', { n: parts.length ? Math.floor(rest / 1000) : (rest / 1000).toFixed(3) }))
  return `${sign}${parts.join(' ')}`
}

/** Valeur d'un champ datetime-local (heure locale) ↔ date ISO. */
export const toLocalInput = (iso) => {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000)
  return d.toISOString().slice(0, 19)
}
export const fromLocalInput = (value) => (value ? new Date(value).toISOString() : '')
