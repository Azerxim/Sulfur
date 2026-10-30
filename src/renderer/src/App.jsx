import { useEffect, useState } from 'react'
import { rendererModules } from './modules'
import { useEnabledModules } from './enabled-modules'
import { appPages } from './pages'
import { useI18n, useManifestText, usePreferences } from './preferences'
import { useModuleActivity } from './activity'
import { useStoredState } from '@azerxim/sulfur-sdk/ui'
import Sidebar from './components/Sidebar'
import StatusBar from './components/StatusBar'
import PageHeader from './components/PageHeader'
import CommandPalette from './components/CommandPalette'
import ModuleErrorBoundary from './components/ModuleErrorBoundary'
import { selectSettingsTab } from './pages/SettingsPage'

export default function App() {
  // Modules externes compris : ajoutés avant le premier rendu.
  const allPages = [...rendererModules, ...appPages]
  const pageIds = allPages.map((p) => p.manifest.id)
  const { t } = useI18n()
  const text = useManifestText()
  const { prefs } = usePreferences()
  const activity = useModuleActivity()
  // Au démarrage : la page choisie dans les paramètres, sinon la dernière page affichée.
  const [lastId, setLastId] = useStoredState('sulfur:lastPage', 'home', pageIds)
  const [activeId, setActiveId] = useState(() => (pageIds.includes(prefs.startPage) ? prefs.startPage : lastId))
  const [palette, setPalette] = useState(false)
  const { groups, modules, isDisabled } = useEnabledModules()
  // Module désactivé (page de démarrage, dernière page, lien) : page d'accueil à la place.
  const shownId = isDisabled(activeId) ? 'home' : activeId
  const active = allPages.find((m) => m.manifest.id === shownId)
  const isModule = rendererModules.includes(active)
  const select = (id) => {
    // Lien vers un module désactivé : l'onglet Modules des Paramètres, où il peut être réactivé.
    if (isDisabled(id)) selectSettingsTab('modules')
    const target = isDisabled(id) ? 'settings' : id
    setActiveId(target)
    setLastId(target)
  }

  // Palette de commandes : Ctrl K (⌘ K sous macOS), depuis n'importe quelle page.
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((open) => !open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        <Sidebar
          groups={groups}
          pages={appPages}
          activeId={shownId}
          onSelect={select}
          onSearch={() => setPalette(true)}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          {active ? (
            <>
              <PageHeader
                icon={active.icon}
                name={text(active.manifest).name}
                description={text(active.manifest).description}
                activity={isModule ? activity(active.manifest.id) : null}
              />
              <div className="min-h-0 flex-1 overflow-auto">
                <ModuleErrorBoundary key={active.manifest.id} moduleId={isModule ? active.manifest.id : null}>
                  <active.Component onNavigate={select} />
                </ModuleErrorBoundary>
              </div>
            </>
          ) : (
            <div className="m-auto text-slate-500">{t('app.noModule')}</div>
          )}
        </main>
      </div>
      <StatusBar modules={modules} onSelect={select} />
      {palette && (
        <CommandPalette groups={groups} pages={appPages} onSelect={select} onClose={() => setPalette(false)} />
      )}
    </div>
  )
}
