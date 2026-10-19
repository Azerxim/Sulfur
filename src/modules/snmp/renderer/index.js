import { Router } from 'lucide-react'
import { SNMP_MODULE } from '../shared/constants'
import SnmpView from './SnmpView'
import '../shared/locales'

/** Partie "renderer" du module SNMP. */
export default {
  manifest: SNMP_MODULE,
  icon: Router,
  Component: SnmpView
}
