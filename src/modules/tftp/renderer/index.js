import { HardDriveDownload } from 'lucide-react'
import { TFTP_MODULE } from '../shared/constants'
import TftpView from './TftpView'
import '../shared/locales'

/** Partie "renderer" du module TFTP. */
export default {
  manifest: TFTP_MODULE,
  icon: HardDriveDownload,
  Component: TftpView
}
