import { Network } from 'lucide-react'
import { DHCP_MODULE } from '../shared/constants'
import DhcpView from './DhcpView'
import '../shared/locales'

/** Partie "renderer" du module DHCP. */
export default {
  manifest: DHCP_MODULE,
  icon: Network,
  Component: DhcpView
}
