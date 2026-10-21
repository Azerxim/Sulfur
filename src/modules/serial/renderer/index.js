import { Cable } from 'lucide-react'
import { SERIAL_MODULE } from '../shared/constants'
import SerialView from './SerialView'
import '../shared/locales'

/** Partie "renderer" du module Terminal série. */
export default {
  manifest: SERIAL_MODULE,
  icon: Cable,
  Component: SerialView
}
