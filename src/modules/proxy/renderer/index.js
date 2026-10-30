import { ArrowRightLeft } from 'lucide-react'
import { PROXY_MODULE } from '../shared/constants'
import ProxyView from './ProxyView'
import '../shared/locales'

/** Partie "renderer" du module Proxy TCP / UDP. */
export default {
  manifest: PROXY_MODULE,
  icon: ArrowRightLeft,
  Component: ProxyView
}
