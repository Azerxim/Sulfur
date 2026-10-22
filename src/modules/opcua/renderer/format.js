import { getLocale } from '@azerxim/sulfur-sdk'
/** Valeur lue par le client (tableaux et structures en JSON). */
export const formatValue = (v) =>
  v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v)

/** Heure locale avec millisecondes. */
export const formatTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString(getLocale(), { hour12: false }) + '.' + iso.slice(20, 23) : '—'

/** Date et heure locales avec millisecondes (historique, événements). */
export const formatDateTime = (iso) =>
  iso ? `${new Date(iso).toLocaleDateString(getLocale())} ${formatTime(iso)}` : '—'
