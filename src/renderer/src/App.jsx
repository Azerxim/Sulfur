import { useState } from 'react'
import { rendererModules } from './modules'
import { appPages } from './pages'
import { useI18n, useManifestText } from './preferences'
import Sidebar from './components/Sidebar'

const allPages = [...rendererModules, ...appPages]

export default function App() {
  const { t } = useI18n()
  const text = useManifestText()
  const [activeId, setActiveId] = useState(allPages[0]?.manifest.id)
  const active = allPages.find((m) => m.manifest.id === activeId)

  return (
    <div className="flex h-full">
      <Sidebar modules={rendererModules} pages={appPages} activeId={activeId} onSelect={setActiveId} />
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
              <active.Component />
            </div>
          </>
        ) : (
          <div className="m-auto text-slate-500">{t('app.noModule')}</div>
        )}
      </main>
    </div>
  )
}
