import { Network } from 'lucide-react'
import { OPCUA_MODULE } from '../shared/constants'
import OpcuaView from './OpcuaView'
import '../shared/locales'

/** Partie "renderer" du module OPC UA. */
export default {
  manifest: OPCUA_MODULE,
  icon: Network,
  Component: OpcuaView
}
