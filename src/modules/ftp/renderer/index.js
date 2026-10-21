import { FolderSync } from 'lucide-react'
import { FTP_MODULE } from '../shared/constants'
import FtpView from './FtpView'
import '../shared/locales'

/** Partie "renderer" du module FTP / SFTP. */
export default {
  manifest: FTP_MODULE,
  icon: FolderSync,
  Component: FtpView
}
