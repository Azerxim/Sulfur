import { Radar } from 'lucide-react'
import { EXPLORER_MODULE } from '../shared/constants'
import ExplorerView from './ExplorerView'
import '../shared/locales'

/** Partie "renderer" du module Explorateur réseau. */
export default {
  manifest: EXPLORER_MODULE,
  icon: Radar,
  Component: ExplorerView
}
