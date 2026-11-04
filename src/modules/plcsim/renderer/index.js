import { faIndustry } from '@fortawesome/free-solid-svg-icons'
import { PLCSIM_MODULE } from '../shared/constants'
import PlcsimView from './PlcsimView'
import '../shared/locales'

/** Partie "renderer" du module PLCSim Advanced. */
export default {
  manifest: PLCSIM_MODULE,
  icon: faIndustry,
  Component: PlcsimView
}
