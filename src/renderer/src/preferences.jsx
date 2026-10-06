import { createContext, useContext, useEffect, useState } from 'react'
import { getLocale, moduleT, setLanguage, t } from '@shared/i18n'
import { DEFAULT_LANGUAGE } from '@shared/languages'

/** Préférences de l'utilisateur (langue, thème), mémorisées localement. */
const STORAGE_KEY = 'sulfur:preferences'
export const THEMES = ['dark', 'light', 'system']

export function loadPreferences() {
  // Par défaut : anglais et thème sombre, ou les préférences connues du process principal.
  const defaults = { language: DEFAULT_LANGUAGE, theme: 'dark', ...window.sulfur?.initialPreferences }
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') }
  } catch {
    return defaults
  }
}

function savePreferences(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // stockage indisponible : les préférences valent pour la session
  }
}

const systemPrefersLight = () => window.matchMedia('(prefers-color-scheme: light)').matches

/** Applique le thème au document (`data-theme` + `color-scheme` pour les contrôles natifs). */
export function applyTheme(theme) {
  const resolved = theme === 'system' ? (systemPrefersLight() ? 'light' : 'dark') : theme === 'light' ? 'light' : 'dark'
  document.documentElement.dataset.theme = resolved
  return resolved
}

/** Applique la langue au document et au process principal (messages d'erreur, journaux). */
export function applyLanguage(language) {
  const lang = setLanguage(language)
  document.documentElement.lang = lang
  window.sulfur?.invoke('system:setLanguage', lang).catch(() => {})
  return lang
}

const PreferencesContext = createContext(null)

export function PreferencesProvider({ initial, children }) {
  const [prefs, setPrefs] = useState(initial)

  useEffect(() => {
    applyTheme(prefs.theme)
    window.sulfur?.invoke('system:setTheme', prefs.theme).catch(() => {})
    if (prefs.theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => applyTheme('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [prefs.theme])

  function update(patch) {
    // La langue est appliquée avant le rendu suivant pour que tous les composants la voient.
    if (patch.language) patch = { ...patch, language: applyLanguage(patch.language) }
    setPrefs((p) => {
      const next = { ...p, ...patch }
      savePreferences(next)
      return next
    })
  }

  return <PreferencesContext.Provider value={{ prefs, update }}>{children}</PreferencesContext.Provider>
}

export const usePreferences = () => useContext(PreferencesContext)

/** Traductions dans les composants : se met à jour lorsque la langue change. */
export function useI18n() {
  const { prefs } = usePreferences()
  return { t, lang: prefs.language, locale: getLocale() }
}

/**
 * Nom et description traduits d'un module ou d'une page (repli sur le manifeste).
 * Un module qui ne fournit pas la langue courante est présenté en anglais.
 */
export function useManifestText() {
  useI18n()
  return (manifest) => {
    const tm = moduleT(manifest.id)
    return {
      name: tm(`${manifest.id}.name`, null, manifest.name),
      description: tm(`${manifest.id}.description`, null, manifest.description ?? '')
    }
  }
}
