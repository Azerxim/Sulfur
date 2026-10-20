import { useEffect, useState } from 'react'
import {
  ArrowUp,
  Download,
  File,
  FileUp,
  Folder,
  FolderPlus,
  Link,
  Pencil,
  Plug,
  PlugZap,
  RefreshCw,
  Trash2
} from 'lucide-react'
import { Button, Card, ErrorBanner, Field, Input, Select, StatusDot } from '@renderer/components/ui'
import { formatDate, formatTime } from '@shared/i18n'
import { usePersistentState } from '@renderer/module-config'
import { DEFAULT_CLIENT_CONFIG } from '../../shared/sftp'
import { sftpApi } from '../api'
import { formatSize } from '../format'
import { t } from '../../shared/i18n'

const ICONS = { dir: Folder, file: File, link: Link }

export default function ClientPanel({ status, serverPort }) {
  // Mot de passe, clé privée et phrase secrète ne sont pas enregistrés.
  const [config, setConfig] = usePersistentState('ftp', 'sftpClient', DEFAULT_CLIENT_CONFIG, {
    persist: (c) => ({ ...c, password: '', privateKey: '', passphrase: '' })
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

  const refresh = (dir) => run(() => sftpApi.client.list(dir), setListing)
  const connect = () =>
    run(
      () => sftpApi.client.connect(config),
      () => refresh()
    )
  const join = (name) => `${listing.path.replace(/\/$/, '')}/${name}`

  const open = (entry) => {
    if (entry.type === 'dir') refresh(join(entry.name))
  }
  const download = (entry) =>
    run(
      () => sftpApi.client.download(join(entry.name)),
      (result) => result && setMessage(t('sftp.client.downloaded', { path: result.local }))
    )
  const upload = () =>
    run(
      () => sftpApi.client.upload(),
      (result) => {
        if (!result) return
        setMessage(t('sftp.client.uploaded', { count: result.length }))
        refresh(listing.path)
      }
    )
  const mkdir = () => {
    const name = prompt(t('sftp.client.newFolder'))
    if (name)
      run(
        () => sftpApi.client.mkdir(join(name)),
        () => refresh(listing.path)
      )
  }
  const rename = (entry) => {
    const name = prompt(t('sftp.client.renameTo'), entry.name)
    if (name && name !== entry.name)
      run(
        () => sftpApi.client.rename(join(entry.name), join(name)),
        () => refresh(listing.path)
      )
  }
  const remove = (entry) => {
    if (!confirm(t('sftp.client.confirmRemove', { name: entry.name }))) return
    run(
      () => sftpApi.client.remove(join(entry.name), entry.type),
      () => refresh(listing.path)
    )
  }

  return (
    <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-2">
      <Card
        id="sftp.client.connection"
        title={t('ui.connection')}
        className="shrink-0"
        actions={
          <StatusDot
            on={connected}
            label={connected ? t('sftp.client.connectedTo', { endpoint: status.endpoint }) : t('ui.disconnected')}
          />
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[2fr_7rem_1.4fr_10rem_auto] items-end gap-3">
            <Field label={t('sftp.client.host')}>
              <Input
                className="font-mono"
                value={config.host}
                disabled={connected || busy}
                onChange={(e) => update({ host: e.target.value })}
              />
            </Field>
            <Field label={t('sftp.server.port')}>
              <Input
                type="number"
                value={config.port}
                disabled={connected || busy}
                onChange={(e) => update({ port: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('sftp.users.username')}>
              <Input
                value={config.username}
                disabled={connected || busy}
                onChange={(e) => update({ username: e.target.value })}
              />
            </Field>
            <Field label={t('sftp.client.auth')}>
              <Select
                value={config.auth}
                disabled={connected || busy}
                onChange={(e) => update({ auth: e.target.value })}
              >
                <option value="password">{t('sftp.client.auths.password')}</option>
                <option value="key">{t('sftp.client.auths.key')}</option>
              </Select>
            </Field>
            {connected ? (
              <Button variant="danger" disabled={busy} onClick={() => run(sftpApi.client.disconnect)}>
                <Plug className="size-4" /> {t('ui.disconnect')}
              </Button>
            ) : (
              <Button variant="primary" disabled={busy} onClick={connect}>
                <PlugZap className="size-4" /> {busy ? t('ui.connecting') : t('ui.connect')}
              </Button>
            )}
          </div>
          {config.auth === 'password' ? (
            <Field label={t('sftp.users.password')} className="max-w-sm">
              <Input
                type="password"
                value={config.password}
                disabled={connected || busy}
                onChange={(e) => update({ password: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && !connected && connect()}
              />
            </Field>
          ) : (
            <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3">
              <Field label={t('sftp.client.privateKey')}>
                <textarea
                  spellCheck={false}
                  rows={3}
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                  value={config.privateKey}
                  disabled={connected || busy}
                  onChange={(e) => update({ privateKey: e.target.value })}
                  className="w-full rounded-md border border-ink-700 bg-ink-950 px-3 py-1.5 font-mono text-xs text-slate-100 focus:border-sulfur-500 focus:outline-none"
                />
                <Button
                  size="sm"
                  className="self-start"
                  disabled={connected || busy}
                  onClick={() => sftpApi.client.pickKey().then((key) => key && update({ privateKey: key }))}
                >
                  {t('sftp.client.pickKey')}
                </Button>
              </Field>
              <Field label={t('sftp.client.passphrase')}>
                <Input
                  type="password"
                  value={config.passphrase}
                  disabled={connected || busy}
                  onChange={(e) => update({ passphrase: e.target.value })}
                />
              </Field>
            </div>
          )}
          <Field label={t('sftp.client.expectedFingerprint')}>
            <Input
              className="font-mono"
              placeholder="SHA256:…"
              value={config.hostFingerprint}
              disabled={connected || busy}
              onChange={(e) => update({ hostFingerprint: e.target.value })}
            />
          </Field>
          {connected && status.hostFingerprint && (
            <p className="text-xs text-slate-500">
              {t('sftp.client.hostKey', { fingerprint: status.hostFingerprint })}
              {!config.hostFingerprint && (
                <button
                  type="button"
                  className="ml-2 text-sulfur-300 hover:underline"
                  onClick={() => update({ hostFingerprint: status.hostFingerprint })}
                >
                  {t('sftp.client.pin')}
                </button>
              )}
            </p>
          )}
          <ErrorBanner error={error} onClose={() => setError(null)} />
        </div>
      </Card>

      {connected && listing && (
        <Card
          id="sftp.client.files"
          title={t('sftp.client.files')}
          className="shrink-0"
          actions={
            <>
              <Button size="sm" disabled={busy} onClick={mkdir}>
                <FolderPlus className="size-3.5" /> {t('sftp.client.mkdir')}
              </Button>
              <Button size="sm" disabled={busy} onClick={upload}>
                <FileUp className="size-3.5" /> {t('sftp.client.upload')}
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
              title={t('sftp.client.up')}
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
                  <th className="px-2 py-1 text-right font-normal">{t('sftp.client.size')}</th>
                  <th className="px-2 py-1 font-normal">{t('sftp.client.modified')}</th>
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
                        {formatDate(entry.mtime)} {formatTime(entry.mtime)}
                      </td>
                      <td className="px-2 py-1">
                        <div className="flex justify-end gap-1">
                          {entry.type !== 'dir' && (
                            <Button
                              size="icon"
                              variant="ghost"
                              title={t('sftp.client.download')}
                              onClick={() => download(entry)}
                            >
                              <Download className="size-3.5" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            title={t('sftp.client.rename')}
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
            <p className="text-sm text-slate-600">{t('sftp.client.empty')}</p>
          )}
        </Card>
      )}
    </div>
  )
}
