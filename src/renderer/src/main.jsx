import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@shared/locales'
import { PreferencesProvider, applyLanguage, applyTheme, loadPreferences } from './preferences'
import App from './App'
import './index.css'

// Langue et thème appliqués avant le premier rendu (pas de flash de thème ni de texte).
const preferences = loadPreferences()
preferences.language = applyLanguage(preferences.language)
applyTheme(preferences.theme)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PreferencesProvider initial={preferences}>
      <App />
    </PreferencesProvider>
  </StrictMode>
)
