import { faArrowRightArrowLeft } from '@fortawesome/free-solid-svg-icons'
import { PROXY_MODULE } from '../shared/constants'
import ProxyView from './ProxyView'
import '../shared/locales'

/** Partie "renderer" du module Proxy TCP / UDP. */
export default {
  manifest: PROXY_MODULE,
  icon: faArrowRightArrowLeft,
  Component: ProxyView
}
