import { useEffect, useRef, useState } from 'react'
import { FolderOpen, Lock, Play, Plus, Square, Trash2 } from 'lucide-react'
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
import { DEFAULT_SERVER_CONFIG, TLS_MODES } from '../../shared/constants'
import { ftpApi } from '../api'
import { t } from '../../shared/i18n'

const MAX_SHOWN = 300
const LIVE_DEBOUNCE = 500
const LEVEL_STYLES = { info: 'text-slate-300', warn: 'text-amber-300', error: 'text-red-300' }

/** Mot de passe : saisi puis haché aussitôt (seule l'empreinte est conservée). */
function PasswordField({ hasHash, onHash, onError }) {
  const [draft, setDraft] = useState('')
  const commit = async () => {
    if (!draft) return
    try {
      onHash(await ftpApi.server.hashPassword(draft))
      setDraft('')
    } catch (err) {
      onError(err.message)
    }
  }
  return (
    <Input
      type="password"
      autoComplete="new-password"
      placeholder={hasHash ? t('ftp.users.passwordSet') : t('ftp.users.password')}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className={hasHash ? '' : 'border-red-500/60'}
    />
  )
}

function ServerLog() {
  const [entries, setEntries] = useState([])
  useEffect(() => {
    ftpApi.server.logs().then(setEntries)
    return ftpApi.server.onLog((entry) => setEntries((list) => [...list.slice(-(MAX_SHOWN - 1)), entry]))
  }, [])
  return (
    <Card
      id="ftp.server.log"
      title={t('ftp.server.log', { count: entries.length })}
      className="min-h-56 shrink-0"
      actions={
        <Button
          size="sm"
          variant="ghost"
          disabled={!entries.length}
          onClick={() => ftpApi.server.clearLogs().then(setEntries)}
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
              className="grid grid-cols-[5rem_10rem_minmax(0,1fr)] gap-2 border-t border-ink-800 py-1 first:border-t-0"
            >
              <span className="text-slate-500">{formatTime(e.time)}</span>
              <span className="truncate text-slate-500">{e.remote}</span>
              <span className={`break-all ${LEVEL_STYLES[e.level] ?? ''}`}>{e.message}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-600">{t('ftp.server.noLog')}</p>
      )}
    </Card>
  )
}

export default function ServerPanel({ status }) {
  const [config, setConfig] = usePersistentState('ftp', 'server', status.config ?? DEFAULT_SERVER_CONFIG)
  const [defaultRoot, setDefaultRoot] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const timer = useRef(null)
  const running = status.running
  const locked = running || busy

  useEffect(() => {
    ftpApi.server.defaultRoot().then(setDefaultRoot)
  }, [])
  useEffect(() => {
    if (running && status.config) setConfig((c) => ({ ...c, ...status.config }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  const update = (patch) => setConfig((c) => ({ ...c, ...patch }))
  /** Réglages modifiables serveur démarré (utilisateurs, anonyme, mode actif…) : envoyés après un court délai. */
  function live(patch) {
    const next = { ...config, ...patch }
    setConfig(next)
    if (!running) return
    clearTimeout(timer.current)
    timer.current = setTimeout(
      () =>
        ftpApi.server
          .update(next)
          .then(() => setError(null))
          .catch((err) => setError(err.message)),
      LIVE_DEBOUNCE
    )
  }
  const setUser = (id, patch) => live({ users: config.users.map((u) => (u.id === id ? { ...u, ...patch } : u)) })
  const addUser = () =>
    live({
      users: [
        ...config.users,
        { id: crypto.randomUUID(), username: `user${config.users.length + 1}`, passwordHash: '', readOnly: true }
      ]
    })

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

  const missing = config.users.filter((u) => !u.passwordHash)
  const canStart = (config.users.length > 0 || config.anonymous) && !missing.length

  return (
    <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-2">
      <Card
        id="ftp.server.config"
        title={t('ftp.server.title')}
        className="shrink-0"
        actions={
          <>
            <StatusDot
              on={running}
              label={running ? t('ftp.server.running', { count: status.sessions?.length ?? 0 }) : t('ui.stopped')}
            />
            {running ? (
              <Button variant="danger" size="sm" disabled={busy} onClick={() => run(ftpApi.server.stop)}>
                <Square className="size-3.5" /> {t('ui.stop')}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                disabled={busy || !canStart}
                onClick={() => run(() => ftpApi.server.start(config))}
              >
                <Play className="size-3.5" /> {busy ? t('ui.starting') : t('ui.start')}
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[1fr_8rem_minmax(0,3fr)] items-end gap-4">
            <Field label={t('ftp.server.host')}>
              <Input value={config.host} disabled={locked} onChange={(e) => update({ host: e.target.value })} />
            </Field>
            <Field label={t('ftp.server.port')}>
              <Input
                type="number"
                value={config.port}
                disabled={locked}
                onChange={(e) => update({ port: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('ftp.server.root')}>
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
                  onClick={() => ftpApi.server.pickRoot().then((root) => root && update({ root }))}
                >
                  {t('ftp.server.choose')}
                </Button>
                <Button
                  variant="ghost"
                  title={t('ftp.server.openRoot')}
                  onClick={() => ftpApi.server.openRoot(config.root).catch((err) => setError(err.message))}
                >
                  <FolderOpen className="size-4" />
                </Button>
              </div>
            </Field>
          </div>
          <div className="grid grid-cols-[minmax(0,14rem)_minmax(0,10rem)_minmax(0,10rem)_1fr] items-end gap-4">
            <Field label={t('ftp.server.tls')}>
              <Select value={config.tls} disabled={locked} onChange={(e) => update({ tls: e.target.value })}>
                {TLS_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {t(`ftp.tls.${mode}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('ftp.server.passivePorts')}>
              <Input
                className="font-mono"
                placeholder="50000-50100"
                value={config.passivePorts}
                disabled={locked}
                onChange={(e) => update({ passivePorts: e.target.value })}
              />
            </Field>
            <Field label={t('ftp.server.passiveAddress')}>
              <Input
                className="font-mono"
                placeholder={t('ftp.server.automatic')}
                value={config.passiveAddress}
                disabled={locked}
                onChange={(e) => update({ passiveAddress: e.target.value })}
              />
            </Field>
            <Field label={t('ftp.server.banner')}>
              <Input value={config.banner} onChange={(e) => live({ banner: e.target.value })} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Checkbox
              label={t('ftp.server.requireTls')}
              checked={config.requireTls}
              disabled={locked || config.tls !== 'explicit'}
              onChange={(e) => update({ requireTls: e.target.checked })}
            />
            <Checkbox
              label={t('ftp.server.allowActive')}
              checked={config.allowActive}
              onChange={(e) => live({ allowActive: e.target.checked })}
            />
            <Checkbox
              label={t('ftp.server.anonymous')}
              checked={config.anonymous}
              onChange={(e) => live({ anonymous: e.target.checked })}
            />
            <Checkbox
              label={t('ftp.server.logCommands')}
              checked={config.logCommands}
              onChange={(e) => live({ logCommands: e.target.checked })}
            />
          </div>
          <p className="text-xs text-slate-500">{t('ftp.server.hint')}</p>
          {status.certificate && (
            <div className="flex items-center gap-2 rounded-md bg-ink-950 px-3 py-2 font-mono text-xs text-slate-300">
              <Lock className="size-3.5 text-emerald-400" />
              <span className="font-sans text-slate-500">{t('ftp.server.certificate')}</span>
              {status.certificate.commonName}
              <span className="truncate text-slate-500 select-text">{status.certificate.thumbprint}</span>
              <span className="ml-auto font-sans text-slate-500">
                {t('ftp.server.validUntil', { date: formatDate(status.certificate.notAfter) })}
              </span>
            </div>
          )}
          {status.endpoint && (
            <div className="flex items-center gap-2 rounded-md bg-ink-950 px-3 py-2 font-mono text-sm text-sulfur-300">
              {status.endpoint}
              <span className="font-sans text-xs text-slate-500">· {t('ftp.server.counters', status.counters)}</span>
            </div>
          )}
          <ErrorBanner error={error} onClose={() => setError(null)} />
        </div>
      </Card>

      <Card
        id="ftp.server.users"
        title={t('ftp.users.title', { count: config.users.length })}
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
            <div key={u.id} className="grid grid-cols-[12rem_14rem_auto_auto] items-end gap-3">
              <Field label={t('ftp.users.username')}>
                <Input value={u.username} onChange={(e) => setUser(u.id, { username: e.target.value })} />
              </Field>
              <Field label={t('ftp.users.password')}>
                <PasswordField
                  hasHash={!!u.passwordHash}
                  onHash={(passwordHash) => setUser(u.id, { passwordHash })}
                  onError={setError}
                />
              </Field>
              <Checkbox
                className="pb-2"
                label={t('ftp.users.readOnly')}
                checked={u.readOnly}
                onChange={(e) => setUser(u.id, { readOnly: e.target.checked })}
              />
              <Button
                size="icon"
                variant="ghost"
                title={t('ui.remove')}
                onClick={() => live({ users: config.users.filter((x) => x.id !== u.id) })}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
          <p className="text-xs text-slate-500">
            {missing.length
              ? t('ftp.users.missing', { names: missing.map((u) => u.username).join(', ') })
              : t('ftp.users.hint')}
          </p>
        </div>
      </Card>

      <ServerLog />
    </div>
  )
}
