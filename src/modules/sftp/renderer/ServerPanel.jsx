import { useEffect, useRef, useState } from 'react'
import { Copy, FolderOpen, Play, Plus, Square, Trash2 } from 'lucide-react'
import { Button, Card, Checkbox, ErrorBanner, Field, Input, StatusDot } from '@renderer/components/ui'
import { formatTime } from '@shared/i18n'
import { usePersistentState } from '@renderer/module-config'
import { DEFAULT_SERVER_CONFIG } from '../shared/constants'
import { sftpApi } from './api'
import { t } from '../shared/i18n'

const MAX_SHOWN = 300
const LIVE_DEBOUNCE = 500
const LEVEL_STYLES = { info: 'text-slate-300', warn: 'text-amber-300', error: 'text-red-300' }

/** Mot de passe : saisi puis haché aussitôt (seule l'empreinte est conservée). */
function PasswordField({ hasHash, onHash, onError }) {
  const [draft, setDraft] = useState('')
  const commit = async () => {
    if (!draft) return
    try {
      onHash(await sftpApi.server.hashPassword(draft))
      setDraft('')
    } catch (err) {
      onError(err.message)
    }
  }
  return (
    <Input
      type="password"
      autoComplete="new-password"
      placeholder={hasHash ? t('sftp.users.passwordSet') : t('sftp.users.password')}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}

function ServerLog() {
  const [entries, setEntries] = useState([])
  useEffect(() => {
    sftpApi.server.logs().then(setEntries)
    return sftpApi.server.onLog((entry) => setEntries((list) => [...list.slice(-(MAX_SHOWN - 1)), entry]))
  }, [])
  return (
    <Card
      id="sftp.server.log"
      title={t('sftp.server.log', { count: entries.length })}
      className="min-h-56 shrink-0"
      actions={
        <Button
          size="sm"
          variant="ghost"
          disabled={!entries.length}
          onClick={() => sftpApi.server.clearLogs().then(setEntries)}
        >
          <Trash2 className="size-3.5" /> {t('sftp.server.clearLog')}
        </Button>
      }
    >
      {entries.length ? (
        <div className="flex flex-col font-mono text-xs">
          {[...entries].reverse().map((e) => (
            <div
              key={e.id}
              className="grid grid-cols-[5rem_10rem_minmax(0,1fr)] gap-2 border-t border-ink-800 py-1 first:border-t-0"
            >
              <span className="text-slate-500">{formatTime(e.time)}</span>
              <span className="truncate text-slate-500">{e.remote}</span>
              <span className={`break-all ${LEVEL_STYLES[e.level] ?? ''}`}>{e.message}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-600">{t('sftp.server.noLog')}</p>
      )}
    </Card>
  )
}

export default function ServerPanel({ status }) {
  const [config, setConfig] = usePersistentState('sftp', 'server', status.config ?? DEFAULT_SERVER_CONFIG)
  const [defaultRoot, setDefaultRoot] = useState('')
  const [hostKey, setHostKey] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const timer = useRef(null)
  const running = status.running

  useEffect(() => {
    sftpApi.server.defaultRoot().then(setDefaultRoot)
    sftpApi.server
      .hostKey()
      .then(setHostKey)
      .catch(() => {})
  }, [])
  useEffect(() => {
    if (running && status.config) setConfig((c) => ({ ...c, ...status.config }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  const update = (patch) => setConfig((c) => ({ ...c, ...patch }))
  /** Utilisateurs modifiés ; serveur en marche : envoyés après un court délai. */
  function setUsers(users) {
    update({ users })
    if (!running) return
    clearTimeout(timer.current)
    timer.current = setTimeout(
      () =>
        sftpApi.server
          .updateUsers(users)
          .then(() => setError(null))
          .catch((err) => setError(err.message)),
      LIVE_DEBOUNCE
    )
  }
  const setUser = (id, patch) => setUsers(config.users.map((u) => (u.id === id ? { ...u, ...patch } : u)))
  const addUser = () =>
    setUsers([
      ...config.users,
      {
        id: crypto.randomUUID(),
        username: `user${config.users.length + 1}`,
        passwordHash: '',
        authorizedKeys: '',
        readOnly: true
      }
    ])

  async function run(action) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const missing = config.users.filter((u) => !u.passwordHash && !u.authorizedKeys.trim())
  const locked = running || busy

  return (
    <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-2">
      <Card
        id="sftp.server.config"
        title={t('sftp.server.title')}
        className="shrink-0"
        actions={
          <>
            <StatusDot
              on={running}
              label={running ? t('sftp.server.running', { count: status.sessions?.length ?? 0 }) : t('ui.stopped')}
            />
            {running ? (
              <Button variant="danger" size="sm" disabled={busy} onClick={() => run(sftpApi.server.stop)}>
                <Square className="size-3.5" /> {t('ui.stop')}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                disabled={busy || !config.users.length || missing.length > 0}
                onClick={() => run(() => sftpApi.server.start(config))}
              >
                <Play className="size-3.5" /> {busy ? t('ui.starting') : t('ui.start')}
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[1fr_8rem_minmax(0,3fr)] items-end gap-4">
            <Field label={t('sftp.server.host')}>
              <Input value={config.host} disabled={locked} onChange={(e) => update({ host: e.target.value })} />
            </Field>
            <Field label={t('sftp.server.port')}>
              <Input
                type="number"
                value={config.port}
                disabled={locked}
                onChange={(e) => update({ port: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('sftp.server.root')}>
              <div className="flex gap-1">
                <Input
                  className="font-mono"
                  placeholder={defaultRoot}
                  value={config.root}
                  disabled={locked}
                  onChange={(e) => update({ root: e.target.value })}
                />
                <Button
                  disabled={locked}
                  onClick={() => sftpApi.server.pickRoot().then((root) => root && update({ root }))}
                >
                  {t('sftp.server.choose')}
                </Button>
                <Button
                  variant="ghost"
                  title={t('sftp.server.openRoot')}
                  onClick={() => sftpApi.server.openRoot(config.root).catch((err) => setError(err.message))}
                >
                  <FolderOpen className="size-4" />
                </Button>
              </div>
            </Field>
          </div>
          <p className="text-xs text-slate-500">{t('sftp.server.hint')}</p>
          {hostKey && (
            <div className="flex items-center gap-2 rounded-md bg-ink-950 px-3 py-2 font-mono text-xs text-slate-300">
              <span className="font-sans text-slate-500">{t('sftp.server.hostKey')}</span>
              <span className="select-text">{hostKey.fingerprint}</span>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto"
                title={t('sftp.server.copyFingerprint')}
                onClick={() => navigator.clipboard.writeText(hostKey.fingerprint)}
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
          )}
          {status.endpoint && (
            <div className="flex items-center gap-2 rounded-md bg-ink-950 px-3 py-2 font-mono text-sm text-sulfur-300">
              {status.endpoint}
              <span className="font-sans text-xs text-slate-500">· {t('sftp.server.counters', status.counters)}</span>
            </div>
          )}
          <ErrorBanner error={error} onClose={() => setError(null)} />
        </div>
      </Card>

      <Card
        id="sftp.server.users"
        title={t('sftp.users.title', { count: config.users.length })}
        className="shrink-0"
        actions={
          <>
            {running && <span className="text-xs text-slate-500">{t('ui.liveApplied')}</span>}
            <Button size="sm" onClick={addUser}>
              <Plus className="size-3.5" /> {t('ui.add')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {config.users.map((u) => (
            <div key={u.id} className="grid grid-cols-[10rem_12rem_minmax(0,1fr)_auto_auto] items-start gap-3">
              <Field label={t('sftp.users.username')}>
                <Input value={u.username} onChange={(e) => setUser(u.id, { username: e.target.value })} />
              </Field>
              <Field label={t('sftp.users.password')}>
                <PasswordField
                  hasHash={!!u.passwordHash}
                  onHash={(passwordHash) => setUser(u.id, { passwordHash })}
                  onError={setError}
                />
              </Field>
              <Field label={t('sftp.users.authorizedKeys')}>
                <textarea
                  spellCheck={false}
                  rows={2}
                  placeholder="ssh-ed25519 AAAA… user@host"
                  value={u.authorizedKeys}
                  onChange={(e) => setUser(u.id, { authorizedKeys: e.target.value })}
                  className={`w-full rounded-md border bg-ink-950 px-3 py-1.5 font-mono text-xs text-slate-100 focus:border-sulfur-500 focus:outline-none ${
                    !u.passwordHash && !u.authorizedKeys.trim() ? 'border-red-500/60' : 'border-ink-700'
                  }`}
                />
              </Field>
              <Checkbox
                className="mt-7"
                label={t('sftp.users.readOnly')}
                checked={u.readOnly}
                onChange={(e) => setUser(u.id, { readOnly: e.target.checked })}
              />
              <Button
                size="icon"
                variant="ghost"
                className="mt-7"
                title={t('ui.remove')}
                onClick={() => setUsers(config.users.filter((x) => x.id !== u.id))}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
          <p className="text-xs text-slate-500">
            {missing.length
              ? t('sftp.users.missing', { names: missing.map((u) => u.username).join(', ') })
              : t('sftp.users.hint')}
          </p>
        </div>
      </Card>

      <ServerLog />
    </div>
  )
}
