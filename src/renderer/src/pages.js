import { Info, LayoutDashboard, Settings } from 'lucide-react'
import HomePage from './pages/HomePage'
import InfoPage from './pages/InfoPage'
import SettingsPage from './pages/SettingsPage'

/**
 * Pages de l'application (hors modules de simulation), affichées en bas de la barre latérale.
 * Les pages reçoivent `onNavigate(id)` pour ouvrir une autre page ou un module.
 * Nom et description sont traduits via les clés `<id>.name` et `<id>.description`.
 */
export const appPages = [
  { manifest: { id: 'home', name: "Vue d'ensemble" }, icon: LayoutDashboard, Component: HomePage },
  { manifest: { id: 'info', name: 'Informations' }, icon: Info, Component: InfoPage },
  { manifest: { id: 'settings', name: 'Paramètres' }, icon: Settings, Component: SettingsPage }
]
