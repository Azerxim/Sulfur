import { faMicrochip } from '@fortawesome/free-solid-svg-icons'
import { S7_MODULE } from '../shared/constants'
import S7View from './S7View'
import '../shared/locales'

/** Partie "renderer" du module Siemens S7. */
export default {
  manifest: S7_MODULE,
  icon: faMicrochip,
  Component: S7View
}
