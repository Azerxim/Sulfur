import { useEffect, useState } from 'react'
import { faComputer, faServer } from '@fortawesome/free-solid-svg-icons'
import { TabbedPage, useStoredState } from '@azerxim/sulfur-sdk/ui'
import { ftpApi, sftpApi } from './api'
import FtpServerPanel from './ftp/ServerPanel'
import FtpClientPanel from './ftp/ClientPanel'
import SftpServerPanel from './sftp/ServerPanel'
import SftpClientPanel from './sftp/ClientPanel'
import { t } from '../shared/i18n'

const TABS = ['ftpServer', 'ftpClient', 'sftpServer', 'sftpClient']

const dot = (on) => <span className={`size-1.5 rounded-full ${on ? 'bg-emerald-400' : 'bg-slate-600'}`} />

/** Statut d'une partie (serveur ou client), suivi en direct. */
function useStatus(api, initial) {
  const [status, setStatus] = useState(initial)
  useEffect(() => {
    api.status().then(setStatus)
    return api.onStatus(setStatus)
  }, [api])
  return status
}

export default function FtpView() {
  const [tab, setTab] = useStoredState('sulfur:tab:ftp', 'sftpServer', TABS)
  const ftpServer = useStatus(ftpApi.server, { running: false })
  const ftpClient = useStatus(ftpApi.client, { connected: false })
  const sftpServer = useStatus(sftpApi.server, { running: false })
  const sftpClient = useStatus(sftpApi.client, { connected: false })

  return (
    <TabbedPage
      value={tab}
      onChange={setTab}
      tabs={[
        { id: 'ftpServer', label: t('ftp.tabs.ftpServer'), icon: faServer, badge: dot(ftpServer.running) },
        { id: 'ftpClient', label: t('ftp.tabs.ftpClient'), icon: faComputer, badge: dot(ftpClient.connected) },
        { id: 'sftpServer', label: t('ftp.tabs.sftpServer'), icon: faServer, badge: dot(sftpServer.running) },
        {
          id: 'sftpClient',
          label: t('ftp.tabs.sftpClient'),
          icon: faComputer,
          badge: dot(sftpClient.connected)
        }
      ]}
    >
      {/* Les panneaux restent montés pour conserver leur état local. */}
      <div className={tab === 'ftpServer' ? 'contents' : 'hidden'}>
        <FtpServerPanel status={ftpServer} />
      </div>
      <div className={tab === 'ftpClient' ? 'contents' : 'hidden'}>
        <FtpClientPanel status={ftpClient} serverPort={ftpServer.running ? ftpServer.config?.port : null} />
      </div>
      <div className={tab === 'sftpServer' ? 'contents' : 'hidden'}>
        <SftpServerPanel status={sftpServer} />
      </div>
      <div className={tab === 'sftpClient' ? 'contents' : 'hidden'}>
        <SftpClientPanel status={sftpClient} serverPort={sftpServer.running ? sftpServer.config?.port : null} />
      </div>
    </TabbedPage>
  )
}
