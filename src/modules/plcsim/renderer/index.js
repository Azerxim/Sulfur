import { Factory } from 'lucide-react'
import { PLCSIM_MODULE } from '../shared/constants'
import PlcsimView from './PlcsimView'
import '../shared/locales'

/** Partie "renderer" du module PLCSim Advanced. */
export default {
  manifest: PLCSIM_MODULE,
  icon: Factory,
  Component: PlcsimView
}
