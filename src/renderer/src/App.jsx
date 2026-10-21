import { useState } from 'react'
import { rendererModules } from './modules'
import { useEnabledModules } from './enabled-modules'
import { appPages } from './pages'
import { useI18n, useManifestText, usePreferences } from './preferences'
import { useStoredState } from './components/ui'
import Sidebar from './components/Sidebar'
import ModuleErrorBoundary from './components/ModuleErrorBoundary'

const allPages = [...rendererModules, ...appPages]
const pageIds = allPages.map((p) => p.manifest.id)

export default function App() {
  const { t } = useI18n()
  const text = useManifestText()
  const { prefs } = usePreferences()
  // Au démarrage : la page choisie dans les paramètres, sinon la dernière page affichée.
  const [lastId, setLastId] = useStoredState('sulfur:lastPage', 'home', pageIds)
  const [activeId, setActiveId] = useState(() => (pageIds.includes(prefs.startPage) ? prefs.startPage : lastId))
  const { groups, isDisabled } = useEnabledModules()
  // Module désactivé (page de démarrage, dernière page, lien) : page d'accueil à la place.
  const shownId = isDisabled(activeId) ? 'home' : activeId
  const active = allPages.find((m) => m.manifest.id === shownId)
  const select = (id) => {
    // Lien vers un module désactivé : les Paramètres, où il peut être réactivé.
    const target = isDisabled(id) ? 'settings' : id
    setActiveId(target)
    setLastId(target)
  }

  return (
    <div className="flex h-full">
      <Sidebar groups={groups} pages={appPages} activeId={shownId} onSelect={select} />
      <main className="flex min-w-0 flex-1 flex-col">
        {active ? (
          <>
            <header className="flex items-center gap-3 border-b border-ink-800 px-6 py-4">
              <active.icon className="size-5 text-sulfur-400" />
              <div>
                <h1 className="text-base font-semibold text-slate-100">{text(active.manifest).name}</h1>
                <p className="text-xs text-slate-400">{text(active.manifest).description}</p>
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-auto">
              <ModuleErrorBoundary
                key={active.manifest.id}
                moduleId={rendererModules.includes(active) ? active.manifest.id : null}
              >
                <active.Component onNavigate={select} />
              </ModuleErrorBoundary>
            </div>
          </>
        ) : (
          <div className="m-auto text-slate-500">{t('app.noModule')}</div>
        )}
      </main>
    </div>
  )
}
