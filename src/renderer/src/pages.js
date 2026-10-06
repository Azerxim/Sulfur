import { Info, Settings } from 'lucide-react'
import InfoPage from './pages/InfoPage'
import SettingsPage from './pages/SettingsPage'

/**
 * Pages de l'application (hors modules de simulation), affichées en bas de la barre latérale.
 * Nom et description sont traduits via les clés `<id>.name` et `<id>.description`.
 */
export const appPages = [
  { manifest: { id: 'info', name: 'Informations' }, icon: Info, Component: InfoPage },
  { manifest: { id: 'settings', name: 'Paramètres' }, icon: Settings, Component: SettingsPage }
]
