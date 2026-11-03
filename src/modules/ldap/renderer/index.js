import { faAddressBook } from '@fortawesome/free-solid-svg-icons'
import { LDAP_MODULE } from '../shared/constants'
import LdapView from './LdapView'
import '../shared/locales'

/** Partie "renderer" du module LDAP. */
export default {
  manifest: LDAP_MODULE,
  icon: faAddressBook,
  Component: LdapView
}
