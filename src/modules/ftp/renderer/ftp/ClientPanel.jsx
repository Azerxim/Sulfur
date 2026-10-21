import { useEffect, useState } from 'react'
import {
  ArrowUp,
  Download,
  File,
  FileUp,
  Folder,
  FolderPlus,
  Link,
  Lock,
  Pencil,
  Plug,
  PlugZap,
  RefreshCw,
  Trash2
} from 'lucide-react'
import {
  Button,
  Card,
  Checkbox,
  ErrorBanner,
  Field,
  Input,
  Select,
  StatusDot,
  usePersistentState
} from '@azerxim/sulfur-sdk/ui'
import { formatDate, formatTime } from '@azerxim/sulfur-sdk'
import { DEFAULT_CLIENT_CONFIG, TLS_MODES } from '../../shared/constants'
import { formatSize } from '../format'
import { ftpApi } from '../api'
import { t } from '../../shared/i18n'

const ICONS = { dir: Folder, file: File, link: Link }

const DIRECTION_STYLES = { '>': 'text-sulfur-300', '<': 'text-slate-300' }

/** Dialogue de commandes du client (réponses du serveur, commandes envoyées, mots de passe masqués). */
function Dialog() {
  const [entries, setEntries] = useState([])
  useEffect(() => {
    ftpApi.client.dialog().then(setEntries)
    return ftpApi.client.onDialog((entry) => setEntries((list) => [...list.slice(-299), entry]))
  }, [])
  return (
    <Card
      id="ftp.client.dialog"
      title={t('ftp.client.dialog', { count: entries.length })}
      className="min-h-48 shrink-0"
      actions={
        <Button
          size="sm"
          variant="ghost"
          disabled={!entries.length}
          onClick={() => ftpApi.client.clearDialog().then(setEntries)}
        >
          <Trash2 className="size-3.5" /> {t('ftp.server.clearLog')}
        </Button>
      }
    >
      {entries.length ? (
        <div className="flex flex-col font-mono text-xs">
          {[...entries].reverse().map((e) => (
            <div
              key={e.id}
              className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2 border-t border-ink-800 py-0.5 first:border-t-0"
            >
              <span className="text-slate-500">{formatTime(e.time)}</span>
              <span className={`break-all whitespace-pre-wrap ${DIRECTION_STYLES[e.message[0]] ?? 'text-slate-500'}`}>
                {e.message}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-600">{t('ftp.client.noDialog')}</p>
      )}
    </Card>
  )
}

export default function ClientPanel({ status, serverPort }) {
  // Le mot de passe n'est pas enregistré.
  const [config, setConfig] = usePersistentState('ftp', 'client', DEFAULT_CLIENT_CONFIG, {
    persist: (c) => ({ ...c, password: '' })
  })
  const [listing, setListing] = useState(null)
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const connected = status.connected
  const update = (patch) => setConfig((c) => ({ ...c, ...patch }))

  useEffect(() => {
    if (serverPort && !connected) setConfig((c) => ({ ...c, port: serverPort }))
  }, [serverPort, connected, setConfig])
  useEffect(() => {
    if (!connected) setListing(null)
  }, [connected])

  async function run(action, done) {
    setBusy(true)
    setError(null)
    try {
      const result = await action()
      done?.(result)
      return result
    } catch (err) {
      setError(err.message)
      return undefined
    } finally {
      setBusy(false)
    }
  }

  const refresh = (dir) => run(() => ftpApi.client.list(dir), setListing)
  const connect = () =>
    run(
      () => ftpApi.client.connect(config),
      () => refresh()
    )
  const join = (name) => `${listing.path.replace(/\/$/, '')}/${name}`

  const open = (entry) => {
    if (entry.type === 'dir') refresh(join(entry.name))
  }
  const download = (entry) =>
    run(
      () => ftpApi.client.download(join(entry.name)),
      (result) => result && setMessage(t('ftp.client.downloaded', { path: result.local }))
    )
  const upload = () =>
    run(
      () => ftpApi.client.upload(),
      (result) => {
        if (!result) return
        setMessage(t('ftp.client.uploaded', { count: result.length }))
        refresh(listing.path)
      }
    )
  const mkdir = () => {
    const name = prompt(t('ftp.client.newFolder'))
    if (name)
      run(
        () => ftpApi.client.mkdir(join(name)),
        () => refresh(listing.path)
      )
  }
  const rename = (entry) => {
    const name = prompt(t('ftp.client.renameTo'), entry.name)
    if (name && name !== entry.name)
      run(
        () => ftpApi.client.rename(join(entry.name), join(name)),
        () => refresh(listing.path)
      )
  }
  const remove = (entry) => {
    if (!confirm(t('ftp.client.confirmRemove', { name: entry.name }))) return
    run(
      () => ftpApi.client.remove(join(entry.name), entry.type),
      () => refresh(listing.path)
    )
  }

  return (
    <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-2">
      <Card
        id="ftp.client.connection"
        title={t('ui.connection')}
        className="shrink-0"
        actions={
          <StatusDot
            on={connected}
            label={connected ? t('ftp.client.connectedTo', { endpoint: status.endpoint }) : t('ui.disconnected')}
          />
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[2fr_7rem_1.4fr_1.4fr_auto] items-end gap-3">
            <Field label={t('ftp.client.host')}>
              <Input
                className="font-mono"
                value={config.host}
                disabled={connected || busy}
                onChange={(e) => update({ host: e.target.value })}
              />
            </Field>
            <Field label={t('ftp.server.port')}>
              <Input
                type="number"
                value={config.port}
                disabled={connected || busy}
                onChange={(e) => update({ port: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('ftp.users.username')}>
              <Input
                value={config.username}
                disabled={connected || busy}
                onChange={(e) => update({ username: e.target.value })}
              />
            </Field>
            <Field label={t('ftp.users.password')}>
              <Input
                type="password"
                value={config.password}
                disabled={connected || busy}
                onChange={(e) => update({ password: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && !connected && connect()}
              />
            </Field>
            {connected ? (
              <Button variant="danger" disabled={busy} onClick={() => run(ftpApi.client.disconnect)}>
                <Plug className="size-4" /> {t('ui.disconnect')}
              </Button>
            ) : (
              <Button variant="primary" disabled={busy} onClick={connect}>
                <PlugZap className="size-4" /> {busy ? t('ui.connecting') : t('ui.connect')}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <Field label={t('ftp.server.tls')} className="w-64">
              <Select value={config.tls} disabled={connected || busy} onChange={(e) => update({ tls: e.target.value })}>
                {TLS_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {t(`ftp.tls.${mode}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Checkbox
              className="pb-2"
              label={t('ftp.client.verifyCertificate')}
              checked={config.verifyCertificate}
              disabled={connected || busy || config.tls === 'none'}
              onChange={(e) => update({ verifyCertificate: e.target.checked })}
            />
          </div>
          {connected && status.certificate && (
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <Lock className="size-3.5 text-emerald-400" />
              {t('ftp.client.certificate', {
                subject: status.certificate.subject,
                issuer: status.certificate.issuer,
                protocol: status.certificate.protocol
              })}
              <span className="font-mono select-text">{status.certificate.fingerprint}</span>
            </p>
          )}
          <ErrorBanner error={error} onClose={() => setError(null)} />
        </div>
      </Card>

      {connected && listing && (
        <Card
          id="ftp.client.files"
          title={t('ftp.client.files')}
          className="shrink-0"
          actions={
            <>
              <Button size="sm" disabled={busy} onClick={mkdir}>
                <FolderPlus className="size-3.5" /> {t('ftp.client.mkdir')}
              </Button>
              <Button size="sm" disabled={busy} onClick={upload}>
                <FileUp className="size-3.5" /> {t('ftp.client.upload')}
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => refresh(listing.path)}>
                <RefreshCw className="size-3.5" /> {t('ui.refresh')}
              </Button>
            </>
          }
        >
          <div className="mb-2 flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              title={t('ftp.client.up')}
              disabled={busy || listing.path === '/'}
              onClick={() => refresh(`${listing.path}/..`)}
            >
              <ArrowUp className="size-4" />
            </Button>
            <span className="font-mono text-sm text-slate-200 select-text">{listing.path}</span>
            {message && <span className="ml-auto text-xs text-emerald-300">{message}</span>}
          </div>
          {listing.entries.length ? (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-slate-500">
                  <th className="px-2 py-1 font-normal">{t('ui.name')}</th>
                  <th className="px-2 py-1 text-right font-normal">{t('ftp.client.size')}</th>
                  <th className="px-2 py-1 font-normal">{t('ftp.client.modified')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {listing.entries.map((entry) => {
                  const Icon = ICONS[entry.type]
                  return (
                    <tr key={entry.name} className="border-t border-ink-800 hover:bg-ink-800/40">
                      <td className="px-2 py-1">
                        <button
                          type="button"
                          className={`flex items-center gap-2 ${entry.type === 'dir' ? 'text-sulfur-300 hover:underline' : 'text-slate-200'}`}
                          onDoubleClick={() => open(entry)}
                          onClick={() => entry.type === 'dir' && open(entry)}
                        >
                          <Icon className="size-4 shrink-0" /> {entry.name}
                        </button>
                      </td>
                      <td className="px-2 py-1 text-right font-mono text-xs text-slate-400">
                        {entry.type === 'dir' ? '' : formatSize(entry.size)}
                      </td>
                      <td className="px-2 py-1 text-xs text-slate-400">
                        {entry.mtime && `${formatDate(entry.mtime)} ${formatTime(entry.mtime)}`}
                      </td>
                      <td className="px-2 py-1">
                        <div className="flex justify-end gap-1">
                          {entry.type !== 'dir' && (
                            <Button
                              size="icon"
                              variant="ghost"
                              title={t('ftp.client.download')}
                              onClick={() => download(entry)}
                            >
                              <Download className="size-3.5" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            title={t('ftp.client.rename')}
                            onClick={() => rename(entry)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" title={t('ui.remove')} onClick={() => remove(entry)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-slate-600">{t('ftp.client.empty')}</p>
          )}
        </Card>
      )}

      <Dialog />
    </div>
  )
}
