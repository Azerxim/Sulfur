import { faComputer, faServer } from '@fortawesome/free-solid-svg-icons'
import { InstancesPage, useInstanceStatuses } from '@azerxim/sulfur-sdk/ui'
import FtpServerPanel from './ftp/ServerPanel'
import FtpClientPanel from './ftp/ClientPanel'
import SftpServerPanel from './sftp/ServerPanel'
import SftpClientPanel from './sftp/ClientPanel'
import { t } from '../shared/i18n'

/** États au repos, avant la première lecture. */
const IDLE = {
  server: { running: false },
  client: { connected: false },
  sftpServer: { running: false },
  sftpClient: { connected: false }
}

/** Page du module : un onglet par instance (aucune par défaut). */
export default function FtpView() {
  const serverStatuses = useInstanceStatuses('ftp', 'server')
  const clientStatuses = useInstanceStatuses('ftp', 'client')
  const sftpServerStatuses = useInstanceStatuses('ftp', 'sftpServer')
  const sftpClientStatuses = useInstanceStatuses('ftp', 'sftpClient')
  const statuses = { ...serverStatuses, ...clientStatuses, ...sftpServerStatuses, ...sftpClientStatuses }
  const roles = [
    { role: 'server', label: t('ftp.tabs.ftpServer'), icon: faServer },
    { role: 'client', label: t('ftp.tabs.ftpClient'), icon: faComputer },
    { role: 'sftpServer', label: t('ftp.tabs.sftpServer'), icon: faServer },
    { role: 'sftpClient', label: t('ftp.tabs.sftpClient'), icon: faComputer }
  ]
  return (
    <InstancesPage moduleId="ftp" roles={roles} statuses={statuses}>
      {(instance) => {
        const status = statuses[instance.id] ?? IDLE[instance.role]
        switch (instance.role) {
          case 'server':
            return <FtpServerPanel instance={instance} status={status} />
          case 'client':
            return <FtpClientPanel instance={instance} status={status} />
          case 'sftpServer':
            return <SftpServerPanel instance={instance} status={status} />
          default:
            return <SftpClientPanel instance={instance} status={status} />
        }
      }}
    </InstancesPage>
  )
}
