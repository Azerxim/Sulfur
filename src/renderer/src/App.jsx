import { useState } from 'react'
import { rendererModules } from './modules'
import Sidebar from './components/Sidebar'

export default function App() {
  const [activeId, setActiveId] = useState(rendererModules[0]?.manifest.id)
  const active = rendererModules.find((m) => m.manifest.id === activeId)

  return (
    <div className="flex h-full">
      <Sidebar modules={rendererModules} activeId={activeId} onSelect={setActiveId} />
      <main className="flex min-w-0 flex-1 flex-col">
        {active ? (
          <>
            <header className="flex items-center gap-3 border-b border-ink-800 px-6 py-4">
              <active.icon className="size-5 text-sulfur-400" />
              <div>
                <h1 className="text-base font-semibold text-slate-100">{active.manifest.name}</h1>
                <p className="text-xs text-slate-400">{active.manifest.description}</p>
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-auto">
              <active.Component />
            </div>
          </>
        ) : (
          <div className="m-auto text-slate-500">Aucun module chargé</div>
        )}
      </main>
    </div>
  )
}
