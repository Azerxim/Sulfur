import { Globe } from 'lucide-react'
import { HTTP_MODULE } from '../shared/constants'
import HttpView from './HttpView'
import '../shared/locales'

/** Partie "renderer" du module HTTP / REST. */
export default {
  manifest: HTTP_MODULE,
  icon: Globe,
  Component: HttpView
}
