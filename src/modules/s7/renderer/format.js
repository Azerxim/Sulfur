import { getLocale } from '@azerxim/sulfur-sdk'
/** Valeur affichée : nombres à 7 chiffres significatifs, chaînes entre guillemets. */
export function formatValue(v) {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number' && !Number.isInteger(v)) return Number(v.toPrecision(7)).toString()
  return String(v)
}

/** Heure hh:mm:ss.mmm d'un horodatage ISO. */
export const formatTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString(getLocale(), { hour12: false }) + '.' + iso.slice(20, 23) : '—'

export const hex = (byte) => byte.toString(16).toUpperCase().padStart(2, '0')
