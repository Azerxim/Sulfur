import { faScroll } from '@fortawesome/free-solid-svg-icons'
import { SYSLOG_MODULE } from '../shared/constants'
import SyslogView from './SyslogView'
import '../shared/locales'

/** Partie "renderer" du module Syslog. */
export default {
  manifest: SYSLOG_MODULE,
  icon: faScroll,
  Component: SyslogView
}
