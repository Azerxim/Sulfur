import { FolderTree } from 'lucide-react'
import { FTP_MODULE } from '../shared/constants'
import FtpView from './FtpView'
import '../shared/locales'

/** Partie "renderer" du module FTP. */
export default {
  manifest: FTP_MODULE,
  icon: FolderTree,
  Component: FtpView
}
