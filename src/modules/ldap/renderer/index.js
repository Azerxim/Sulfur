import { BookUser } from 'lucide-react'
import { LDAP_MODULE } from '../shared/constants'
import LdapView from './LdapView'
import '../shared/locales'

/** Partie "renderer" du module LDAP. */
export default {
  manifest: LDAP_MODULE,
  icon: BookUser,
  Component: LdapView
}
