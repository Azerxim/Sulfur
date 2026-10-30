import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@shared/locales'
import { PreferencesProvider, applyLanguage, applyTheme, loadPreferences } from './preferences'
import { loadModuleConfigs } from '@azerxim/sulfur-sdk/host'
import { availableModules, loadDisabledModules, loadRejectedModules } from './enabled-modules'
import { loadExternalModules } from './external-modules'
import { loadModuleActivity } from './activity'
import App from './App'
import './index.css'

// Langue et thème appliqués avant le premier rendu (pas de flash de thème ni de texte).
const preferences = loadPreferences()
preferences.language = applyLanguage(preferences.language)
applyTheme(preferences.theme)

// Modules externes, modules refusés, configurations enregistrées des modules et modules désactivés
// chargés avant le premier rendu (panneaux restaurés d'emblée, barre latérale sans les modules
// désactivés).
loadExternalModules()
  .then(loadRejectedModules)
  .then(() =>
    Promise.all([
      loadModuleConfigs(availableModules().modules.map((m) => m.manifest.id)),
      loadDisabledModules().then((list) => (preferences.disabledModules = list))
    ])
  )
  .then(() => {
    // Activité des modules (barre latérale, accueil) : suivie sans retarder le premier rendu.
    loadModuleActivity()
    createRoot(document.getElementById('root')).render(
      <StrictMode>
        <PreferencesProvider initial={preferences}>
          <App />
        </PreferencesProvider>
      </StrictMode>
    )
  })
