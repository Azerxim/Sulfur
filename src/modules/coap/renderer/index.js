import { RadioTower } from 'lucide-react'
import { COAP_MODULE } from '../shared/constants'
import CoapView from './CoapView'
import '../shared/locales'

/** Partie "renderer" du module CoAP / LwM2M. */
export default {
  manifest: COAP_MODULE,
  icon: RadioTower,
  Component: CoapView
}
