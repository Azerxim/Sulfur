import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@shared/locales'
import { PreferencesProvider, applyLanguage, applyTheme, loadPreferences } from './preferences'
import { loadModuleConfigs } from './module-config'
import { rendererModules } from './modules'
import App from './App'
import './index.css'

// Langue et thème appliqués avant le premier rendu (pas de flash de thème ni de texte).
const preferences = loadPreferences()
preferences.language = applyLanguage(preferences.language)
applyTheme(preferences.theme)

// Configurations enregistrées des modules chargées avant le premier rendu (panneaux restaurés d'emblée).
loadModuleConfigs(rendererModules.map((m) => m.manifest.id)).then(() =>
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <PreferencesProvider initial={preferences}>
        <App />
      </PreferencesProvider>
    </StrictMode>
  )
)
