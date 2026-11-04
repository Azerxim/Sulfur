import { faHardDrive } from '@fortawesome/free-solid-svg-icons'
import { TFTP_MODULE } from '../shared/constants'
import TftpView from './TftpView'
import '../shared/locales'

/** Partie "renderer" du module TFTP. */
export default {
  manifest: TFTP_MODULE,
  icon: faHardDrive,
  Component: TftpView
}
