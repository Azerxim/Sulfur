import { faSatelliteDish } from '@fortawesome/free-solid-svg-icons'
import { EXPLORER_MODULE } from '../shared/constants'
import ExplorerView from './ExplorerView'
import '../shared/locales'

/** Partie "renderer" du module Explorateur réseau. */
export default {
  manifest: EXPLORER_MODULE,
  icon: faSatelliteDish,
  Component: ExplorerView
}
