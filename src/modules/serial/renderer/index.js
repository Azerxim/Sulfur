import { faPlug } from '@fortawesome/free-solid-svg-icons'
import { SERIAL_MODULE } from '../shared/constants'
import SerialView from './SerialView'
import '../shared/locales'

/** Partie "renderer" du module Terminal série. */
export default {
  manifest: SERIAL_MODULE,
  icon: faPlug,
  Component: SerialView
}
