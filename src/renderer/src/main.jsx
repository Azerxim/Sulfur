import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@shared/locales'
import { PreferencesProvider, applyLanguage, applyTheme, loadPreferences } from './preferences'
import { loadModuleConfigs } from './module-config'
import { loadDisabledModules } from './enabled-modules'
import { rendererModules } from './modules'
import App from './App'
import './index.css'

// Langue et thème appliqués avant le premier rendu (pas de flash de thème ni de texte).
const preferences = loadPreferences()
preferences.language = applyLanguage(preferences.language)
applyTheme(preferences.theme)

// Configurations enregistrées des modules et modules désactivés chargés avant le premier rendu
// (panneaux restaurés d'emblée, barre latérale sans les modules désactivés).
Promise.all([
  loadModuleConfigs(rendererModules.map((m) => m.manifest.id)),
  loadDisabledModules().then((list) => (preferences.disabledModules = list))
]).then(() =>
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <PreferencesProvider initial={preferences}>
        <App />
      </PreferencesProvider>
    </StrictMode>
  )
)
