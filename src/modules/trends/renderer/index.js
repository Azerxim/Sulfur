import { ChartLine } from 'lucide-react'
import { TRENDS_MODULE } from '../shared/constants'
import TrendsView from './TrendsView'
import '../shared/locales'

/** Partie "renderer" du module courbes. */
export default {
  manifest: TRENDS_MODULE,
  icon: ChartLine,
  Component: TrendsView
}
