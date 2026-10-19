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

export function loadPreferences() {
  try {
    return JSON.parse(fs.readFileSync(file(), 'utf8'))
  } catch {
    return {}
  }
}

export function savePreferences(patch) {
  const next = { ...loadPreferences(), ...patch }
  fs.promises.writeFile(file(), JSON.stringify(next, null, 2)).catch(() => {})
  return next
}

/** Applique le thème aux éléments natifs et retourne le thème effectif ('dark' | 'light'). */
export function applyNativeTheme(theme) {
  nativeTheme.themeSource = THEMES.includes(theme) ? theme : 'system'
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}
