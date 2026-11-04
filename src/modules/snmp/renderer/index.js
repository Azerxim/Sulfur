import { faCircleNodes } from '@fortawesome/free-solid-svg-icons'
import { SNMP_MODULE } from '../shared/constants'
import SnmpView from './SnmpView'
import '../shared/locales'

/** Partie "renderer" du module SNMP. */
export default {
  manifest: SNMP_MODULE,
  icon: faCircleNodes,
  Component: SnmpView
}
