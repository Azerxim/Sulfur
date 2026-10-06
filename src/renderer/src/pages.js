import { Info } from 'lucide-react'
import InfoPage from './pages/InfoPage'

/** Pages de l'application (hors modules de simulation), affichées en bas de la barre latérale. */
export const appPages = [
  {
    manifest: { id: 'info', name: 'Informations', description: 'Adresses IP et informations système du PC' },
    icon: Info,
    Component: InfoPage
  }
]
