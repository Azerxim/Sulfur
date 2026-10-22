import { app, nativeTheme } from 'electron'
import fs from 'fs'
import path from 'path'

/**
 * Préférences connues du process principal (thème, langue), pour ouvrir la fenêtre directement
 * avec le bon thème et produire les messages dans la bonne langue avant le chargement de l'interface.
 * L'interface reste la source des choix : elle les transmet à chaque changement.
 */
const file = () => path.join(app.getPath('userData'), 'preferences.json')

export const THEMES = ['dark', 'light', 'system']
export const WINDOW_BACKGROUNDS = { dark: '#0b0d12', light: '#f1f3f6' }

/** Préférences lues une fois, puis tenues en mémoire : le fichier n'est relu qu'au démarrage. */
let current = null
let writing = Promise.resolve()

export function loadPreferences() {
  if (!current) {
    try {
      current = JSON.parse(fs.readFileSync(file(), 'utf8'))
    } catch {
      current = {}
    }
  }
  return { ...current }
}

/**
 * Enregistre `patch` dans les préférences. Les écritures se suivent et remplacent le fichier d'un
 * bloc (fichier temporaire renommé) : deux enregistrements rapprochés (langue et thème au
 * démarrage) ne perdent rien et le fichier n'est jamais lu à moitié écrit.
 */
export function savePreferences(patch) {
  current = { ...loadPreferences(), ...patch }
  const data = JSON.stringify(current, null, 2)
  writing = writing
    .then(async () => {
      const tmp = `${file()}.tmp`
      await fs.promises.writeFile(tmp, data)
      await fs.promises.rename(tmp, file())
    })
    .catch(() => {})
  return { ...current }
}

/** Attend la fin des écritures en cours (avant de quitter). */
export const flushPreferences = () => writing

/** Applique le thème aux éléments natifs et retourne le thème effectif ('dark' | 'light'). */
export function applyNativeTheme(theme) {
  nativeTheme.themeSource = THEMES.includes(theme) ? theme : 'system'
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}
