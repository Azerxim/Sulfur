import { faClock } from '@fortawesome/free-solid-svg-icons'
import { NTP_MODULE } from '../shared/constants'
import NtpView from './NtpView'
import '../shared/locales'

/** Partie "renderer" du module NTP. */
export default {
  manifest: NTP_MODULE,
  icon: faClock,
  Component: NtpView
}
