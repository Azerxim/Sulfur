import { Signpost } from 'lucide-react'
import { DNS_MODULE } from '../shared/constants'
import DnsView from './DnsView'
import '../shared/locales'

/** Partie "renderer" du module DNS. */
export default {
  manifest: DNS_MODULE,
  icon: Signpost,
  Component: DnsView
}
