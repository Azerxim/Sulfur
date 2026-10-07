/**
 * Palette catégorielle des courbes, dans un ordre fixe (jamais recyclée) : chaque point garde sa
 * couleur (son « emplacement ») tant qu'il est affiché. Palette de référence validée (daltonisme,
 * contraste), une variante par thème.
 */
export const SERIES_COLORS = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']
}

/** Nombre maximal de courbes affichées (une couleur par courbe). */
export const MAX_SERIES = SERIES_COLORS.light.length

export const seriesColor = (slot, theme) => SERIES_COLORS[theme === 'light' ? 'light' : 'dark'][slot % MAX_SERIES]

/** Premier emplacement de couleur libre. */
export function freeSlot(series) {
  const used = new Set(series.map((s) => s.slot))
  for (let slot = 0; slot < MAX_SERIES; slot++) if (!used.has(slot)) return slot
  return -1
}
