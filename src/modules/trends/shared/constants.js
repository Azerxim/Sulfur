import { builtinManifest } from '@modules/builtin'
export const TRENDS_MODULE = builtinManifest({
  id: 'trends',
  name: 'Courbes',
  description: 'Courbes des valeurs des autres modules, enregistrement et export CSV'
})

/** Période d'échantillonnage par défaut et minimale (ms). */
export const DEFAULT_INTERVAL = 500
export const MIN_INTERVAL = 50

/** Nombre maximal d'échantillons conservés (les plus anciens sont supprimés). */
export const MAX_ROWS = 100_000

/** Fenêtres d'affichage proposées (ms, 0 = tout l'enregistrement). */
export const WINDOWS = [60_000, 300_000, 900_000, 3_600_000, 0]

export const DEFAULT_CONFIG = {
  interval: DEFAULT_INTERVAL,
  window: 300_000,
  /** Courbes affichées : [{ key, color, hidden }] */
  series: [],
  /** 'shared' : un graphique commun ; 'split' : un graphique par point (axes distincts). */
  layout: 'shared',
  decimal: '.'
}
