import { useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Play, Plus, Square, Trash2 } from 'lucide-react'
import { Button, Card, Checkbox, ErrorBanner, Field, Input, StatusDot } from '@renderer/components/ui'
import { formatTime } from '@shared/i18n'
import { usePersistentState } from '@renderer/module-config'
import { DEFAULT_RADIUS_SERVER_CONFIG, parseAttributes } from '../../shared/radius'
import { radiusApi } from '../api'
import { t } from '../../shared/i18n'

/** Délai avant d'envoyer les clients et comptes modifiés au serveur en marche. */
const LIVE_DEBOUNCE = 500
const MAX_SHOWN = 300

const LEVEL_STYLES = { info: 'text-slate-300', warn: 'text-amber-300', error: 'text-red-300' }

const textareaClass = (invalid) =>
  `w-full rounded-md border bg-ink-950 px-3 py-1.5 font-mono text-xs text-slate-100 focus:border-sulfur-500 focus:outline-none ${
    invalid ? 'border-red-500/60' : 'border-ink-700'
  }`

/** Attributs de réponse : une ligne « Nom = valeur » par attribut, erreurs signalées sous le champ. */
function AttributesField({ value, onChange, rows = 2 }) {
  const { errors } = useMemo(() => parseAttributes(value), [value])
  return (
    <>
      <textarea
        spellCheck={false}
        rows={rows}
        placeholder="Service-Type = Administrative-User"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={textareaClass(errors.length > 0)}
      />
      {errors.length > 0 && <span className="text-xs text-red-300">{t('radius.errors.attributeLine', errors[0])}</span>}
    </>
  )
}

function ServerLog() {
  const [entries, setEntries] = useState([])
  useEffect(() => {
    radiusApi.server.logs().then(setEntries)
    return radiusApi.server.onLog((entry) => setEntries((list) => [...list.slice(-(MAX_SHOWN - 1)), entry]))
  }, [])
  return (
    <Card
      id="radius.server.log"
      title={t('ldap.server.log', { count: entries.length })}
      className="min-h-56 shrink-0"
      actions={
        <Button
          size="sm"
          variant="ghost"
          disabled={!entries.length}
          onClick={() => radiusApi.server.clearLogs().then(setEntries)}
        >
          <Trash2 className="size-3.5" /> {t('ldap.server.clearLog')}
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
        <p className="text-sm text-slate-600">{t('ldap.server.noLog')}</p>
      )}
    </Card>
  )
}

export default function ServerPanel({ status }) {
  const [config, setConfig] = usePersistentState('ldap', 'radiusServer', status.config ?? DEFAULT_RADIUS_SERVER_CONFIG)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const timer = useRef(null)
  const running = status.running
  const locked = running || busy
  const directory = { ...DEFAULT_RADIUS_SERVER_CONFIG.directory, ...config.directory }
  const invalid =
    config.users.some((u) => parseAttributes(u.attributes).errors.length) ||
    parseAttributes(directory.attributes).errors.length > 0

  useEffect(() => {
    if (running && status.config) setConfig((c) => ({ ...c, ...status.config }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  /** Modification ; `live` : appliquée au serveur en marche (clients, comptes, annuaire). */
  function update(patch, live = false) {
    const next = { ...config, ...patch }
    setConfig(next)
    if (!running || !live) return
    clearTimeout(timer.current)
    if (next.users.some((u) => parseAttributes(u.attributes).errors.length)) return
    if (parseAttributes(next.directory?.attributes).errors.length) return
    timer.current = setTimeout(
      () =>
        radiusApi.server
          .update(next)
          .then(() => setError(null))
          .catch((err) => setError(err.message)),
      LIVE_DEBOUNCE
    )
  }

  const setItem = (list, id, patch) =>
    update({ [list]: config[list].map((item) => (item.id === id ? { ...item, ...patch } : item)) }, true)
  const removeItem = (list, id) => update({ [list]: config[list].filter((item) => item.id !== id) }, true)
  const addClient = () =>
    update(
      {
        clients: [
          ...config.clients,
          { id: crypto.randomUUID(), name: `nas${config.clients.length + 1}`, address: '', secret: 'testing123' }
        ]
      },
      true
    )
  const addUser = () =>
    update(
      {
        users: [
          ...config.users,
          { id: crypto.randomUUID(), username: `user${config.users.length + 1}`, password: '', attributes: '' }
        ]
      },
      true
    )

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

  return (
    <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-2">
      <Card
        id="radius.server.config"
        title={t('ldap.server.title')}
        className="shrink-0"
        actions={
          <>
            <StatusDot
              on={running}
              label={running ? t('radius.server.running', { count: status.counters?.requests ?? 0 }) : t('ui.stopped')}
            />
            {running ? (
              <Button variant="danger" size="sm" disabled={busy} onClick={() => run(radiusApi.server.stop)}>
                <Square className="size-3.5" /> {t('ui.stop')}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                disabled={busy || invalid}
                onClick={() => run(() => radiusApi.server.start(config))}
              >
                <Play className="size-3.5" /> {busy ? t('ui.starting') : t('ui.start')}
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[2fr_1fr_1fr_2fr] items-end gap-4">
            <Field label={t('ldap.server.host')}>
              <Input value={config.host} disabled={locked} onChange={(e) => update({ host: e.target.value })} />
            </Field>
            <Field label={t('radius.server.authPort')}>
              <Input
                type="number"
                value={config.authPort}
                disabled={locked}
                onChange={(e) => update({ authPort: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('radius.server.acctPort')}>
              <Input
                type="number"
                value={config.acctPort}
                disabled={locked || !config.accounting}
                onChange={(e) => update({ acctPort: Number(e.target.value) })}
              />
            </Field>
            <div className="flex flex-col justify-end gap-2 pb-1">
              <Checkbox
                label={t('radius.server.accounting')}
                disabled={locked}
                checked={config.accounting}
                onChange={(e) => update({ accounting: e.target.checked })}
              />
              <Checkbox
                label={t('radius.server.requireMessageAuthenticator')}
                checked={config.requireMessageAuthenticator}
                onChange={(e) => update({ requireMessageAuthenticator: e.target.checked }, true)}
              />
            </div>
          </div>
          <p className="text-xs text-slate-500">{t('radius.server.hint')}</p>
          {status.endpoints?.length > 0 && (
            <div className="flex flex-col gap-1 rounded-md bg-ink-950 px-3 py-2 font-mono text-sm text-sulfur-300">
              {status.endpoints.map((endpoint, i) => (
                <div key={endpoint} className="flex items-center gap-2">
                  {endpoint}
                  <span className="font-sans text-xs text-slate-500">
                    · {i === 0 ? t('radius.server.authentication') : t('radius.server.accountingLabel')}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto"
                    title={t('ui.copy')}
                    onClick={() => navigator.clipboard.writeText(endpoint)}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                </div>
              ))}
              <div className="font-sans text-xs text-slate-500">{t('radius.server.counters', status.counters)}</div>
            </div>
          )}
          <ErrorBanner error={error} onClose={() => setError(null)} />
        </div>
      </Card>

      <Card
        id="radius.server.clients"
        title={t('radius.clients.title', { count: config.clients.length })}
        className="shrink-0"
        actions={
          <>
            {running && <span className="text-xs text-slate-500">{t('ui.liveApplied')}</span>}
            <Button size="sm" onClick={addClient}>
              <Plus className="size-3.5" /> {t('ui.add')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {config.clients.map((c) => (
            <div key={c.id} className="grid grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-3">
              <Field label={t('radius.clients.name')}>
                <Input value={c.name} onChange={(e) => setItem('clients', c.id, { name: e.target.value })} />
              </Field>
              <Field label={t('radius.clients.address')}>
                <Input
                  className="font-mono"
                  placeholder="192.168.1.0/24"
                  value={c.address}
                  onChange={(e) => setItem('clients', c.id, { address: e.target.value })}
                />
              </Field>
              <Field label={t('radius.clients.secret')}>
                <Input
                  className="font-mono"
                  value={c.secret}
                  onChange={(e) => setItem('clients', c.id, { secret: e.target.value })}
                />
              </Field>
              <Button
                size="icon"
                variant="ghost"
                className="mb-1"
                title={t('ui.remove')}
                onClick={() => removeItem('clients', c.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
          <p className="text-xs text-slate-500">{t('radius.clients.hint')}</p>
        </div>
      </Card>

      <Card
        id="radius.server.users"
        title={t('radius.users.title', { count: config.users.length })}
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
            <div key={u.id} className="grid grid-cols-[10rem_10rem_minmax(0,1fr)_auto] items-start gap-3">
              <Field label={t('radius.users.username')}>
                <Input value={u.username} onChange={(e) => setItem('users', u.id, { username: e.target.value })} />
              </Field>
              <Field label={t('radius.users.password')}>
                <Input
                  autoComplete="off"
                  value={u.password}
                  onChange={(e) => setItem('users', u.id, { password: e.target.value })}
                />
              </Field>
              <Field label={t('radius.users.attributes')}>
                <AttributesField
                  value={u.attributes}
                  onChange={(attributes) => setItem('users', u.id, { attributes })}
                />
              </Field>
              <Button
                size="icon"
                variant="ghost"
                className="mt-7"
                title={t('ui.remove')}
                onClick={() => removeItem('users', u.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
          <p className="text-xs text-slate-500">{t('radius.users.hint')}</p>
        </div>
      </Card>

      <Card id="radius.server.directory" title={t('radius.directory.title')} className="shrink-0">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[auto_12rem_minmax(0,1fr)] items-start gap-4">
            <Checkbox
              className="mt-7"
              label={t('radius.directory.enabled')}
              checked={directory.enabled}
              onChange={(e) => update({ directory: { ...directory, enabled: e.target.checked } }, true)}
            />
            <Field label={t('radius.directory.attribute')}>
              <Input
                className="font-mono"
                disabled={!directory.enabled}
                value={directory.attribute}
                onChange={(e) => update({ directory: { ...directory, attribute: e.target.value } }, true)}
              />
            </Field>
            <Field label={t('radius.directory.attributes')}>
              <AttributesField
                value={directory.attributes}
                onChange={(attributes) => update({ directory: { ...directory, attributes } }, true)}
              />
            </Field>
          </div>
          <p className="text-xs text-slate-500">{t('radius.directory.hint')}</p>
        </div>
      </Card>

      {running && status.sessions?.length > 0 && (
        <Card
          id="radius.server.sessions"
          title={t('radius.sessions.title', { count: status.sessions.length })}
          className="shrink-0"
        >
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="pb-2 font-medium">{t('radius.sessions.user')}</th>
                <th className="pb-2 font-medium">{t('radius.sessions.id')}</th>
                <th className="pb-2 font-medium">{t('radius.sessions.client')}</th>
                <th className="pb-2 font-medium">{t('radius.sessions.since')}</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {status.sessions.map((s) => (
                <tr key={s.key} className="border-t border-ink-800">
                  <td className="py-1 pr-3 text-slate-200">{s.user || '—'}</td>
                  <td className="py-1 pr-3 text-slate-300">{s.sessionId || '—'}</td>
                  <td className="py-1 pr-3 text-slate-400">
                    {s.client} <span className="text-slate-600">{s.remote}</span>
                  </td>
                  <td className="py-1 text-slate-500">{formatTime(s.since)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <ServerLog />
    </div>
  )
}
