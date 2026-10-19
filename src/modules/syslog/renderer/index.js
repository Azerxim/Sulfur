import { ScrollText } from 'lucide-react'
import { SYSLOG_MODULE } from '../shared/constants'
import SyslogView from './SyslogView'
import '../shared/locales'

/** Partie "renderer" du module Syslog. */
export default {
  manifest: SYSLOG_MODULE,
  icon: ScrollText,
  Component: SyslogView
}
