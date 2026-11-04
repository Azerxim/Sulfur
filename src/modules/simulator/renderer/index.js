import { faFlask } from '@fortawesome/free-solid-svg-icons'
import { SIMULATOR_MODULE } from '../shared/constants'
import SimulatorView from './SimulatorView'
import '../shared/locales'

/** Partie "renderer" du simulateur. */
export default {
  manifest: SIMULATOR_MODULE,
  icon: faFlask,
  Component: SimulatorView
}
