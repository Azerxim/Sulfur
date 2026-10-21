import { BadgeCheck } from 'lucide-react'
import { CA_MODULE } from '../shared/constants'
import CaView from './CaView'
import '../shared/locales'

/** Partie "renderer" du module Autorité de certification. */
export default {
  manifest: CA_MODULE,
  icon: BadgeCheck,
  Component: CaView
}
