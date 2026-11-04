import { faSignsPost } from '@fortawesome/free-solid-svg-icons'
import { DNS_MODULE } from '../shared/constants'
import DnsView from './DnsView'
import '../shared/locales'

/** Partie "renderer" du module DNS. */
export default {
  manifest: DNS_MODULE,
  icon: faSignsPost,
  Component: DnsView
}
