import { FolderSync } from 'lucide-react'
import { SFTP_MODULE } from '../shared/constants'
import SftpView from './SftpView'
import '../shared/locales'

/** Partie "renderer" du module SFTP. */
export default {
  manifest: SFTP_MODULE,
  icon: FolderSync,
  Component: SftpView
}
