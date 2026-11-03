import { faSitemap } from '@fortawesome/free-solid-svg-icons'
import { OPCUA_MODULE } from '../shared/constants'
import OpcuaView from './OpcuaView'
import '../shared/locales'

/** Partie "renderer" du module OPC UA. */
export default {
  manifest: OPCUA_MODULE,
  icon: faSitemap,
  Component: OpcuaView
}
