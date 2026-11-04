import { faNetworkWired } from '@fortawesome/free-solid-svg-icons'
import { DHCP_MODULE } from '../shared/constants'
import DhcpView from './DhcpView'
import '../shared/locales'

/** Partie "renderer" du module DHCP. */
export default {
  manifest: DHCP_MODULE,
  icon: faNetworkWired,
  Component: DhcpView
}
