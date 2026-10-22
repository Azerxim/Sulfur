import { useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Lock, Play, RotateCcw, Square, Trash2 } from 'lucide-react'
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
import { formatTime } from '@azerxim/sulfur-sdk'
import { DEFAULT_LDIF, DEFAULT_SERVER_CONFIG, SECURITY_MODES } from '../shared/constants'
import { parseLdif } from '../shared/ldif'
import { ldapApi } from './api'
import { t } from '../shared/i18n'

/** Délai avant d'envoyer l'annuaire modifié au serveur en marche. */
const LIVE_DEBOUNCE = 500
const MAX_SHOWN = 300
/** Ports standards et leurs équivalents sans droits administrateur. */
const PORT_SWAP = { plain: { 636: 389, 1636: 1389 }, ldaps: { 389: 636, 1389: 1636 } }

const LEVEL_STYLES = { info: 'text-slate-300', warn: 'text-amber-300', error: 'text-red-300' }

function ServerLog() {
  const [entries, setEntries] = useState([])
  useEffect(() => {
    ldapApi.server.logs().then(setEntries)
    return ldapApi.server.onLog((entry) => setEntries((list) => [...list.slice(-(MAX_SHOWN - 1)), entry]))
  }, [])
  return (
    <Card
      id="ldap.server.log"
      title={t('ldap.server.log', { count: entries.length })}
      className="min-h-56 shrink-0"
      actions={
        <Button
          size="sm"
          variant="ghost"
          disabled={!entries.length}
          onClick={() => ldapApi.server.clearLogs().then(setEntries)}
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
  const [config, setConfig] = usePersistentState('ldap', 'server', status.config ?? DEFAULT_SERVER_CONFIG)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const timer = useRef(null)
  const running = status.running
  const parsed = useMemo(() => parseLdif(config.ldif), [config.ldif])
  const people = parsed.entries.filter((e) =>
    Object.entries(e.attributes).some(([k, v]) => k.toLowerCase() === 'userpassword' && v.length)
  )

  useEffect(() => {
    if (running && status.config) setConfig((c) => ({ ...c, ...status.config }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  function change(next, live = false) {
    setConfig(next)
    if (!running || !live) return
    clearTimeout(timer.current)
    if (parseLdif(next.ldif).errors.length) return
    timer.current = setTimeout(
      () =>
        ldapApi.server
          .update(next)
          .then(() => setError(null))
          .catch((err) => setError(err.message)),
      LIVE_DEBOUNCE
    )
  }
  const update = (patch, live = false) => change({ ...config, ...patch }, live)
  const setSecurity = (security) => {
    const swap = PORT_SWAP[security]?.[config.port]
    update({ security, ...(swap ? { port: swap } : {}) })
  }

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

  const locked = running || busy

  return (
    <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-2">
      <Card
        id="ldap.server.config"
        title={t('ldap.server.title')}
        className="shrink-0"
        actions={
          <>
            <StatusDot
              on={running}
              label={running ? t('ldap.server.running', { count: status.sessions?.length ?? 0 }) : t('ui.stopped')}
            />
            {running ? (
              <Button variant="danger" size="sm" disabled={busy} onClick={() => run(ldapApi.server.stop)}>
                <Square className="size-3.5" /> {t('ui.stop')}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                disabled={busy || parsed.errors.length > 0}
                onClick={() => run(() => ldapApi.server.start(config))}
              >
                <Play className="size-3.5" /> {busy ? t('ui.starting') : t('ui.start')}
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-5 gap-4">
            <Field label={t('ldap.server.host')}>
              <Input value={config.host} disabled={locked} onChange={(e) => update({ host: e.target.value })} />
            </Field>
            <Field label={t('ldap.server.port')}>
              <Input
                type="number"
                value={config.port}
                disabled={locked}
                onChange={(e) => update({ port: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('ldap.server.securityLabel')}>
              <Select value={config.security} disabled={locked} onChange={(e) => setSecurity(e.target.value)}>
                {SECURITY_MODES.map((m) => (
                  <option key={m} value={m}>
                    {t(`ldap.security.${m}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('ldap.server.sizeLimit')}>
              <Input
                type="number"
                min={1}
                value={config.sizeLimit}
                onChange={(e) => update({ sizeLimit: Number(e.target.value) }, true)}
              />
            </Field>
            <div className="flex flex-col justify-end gap-2 pb-1">
              <Checkbox
                label={t('ldap.server.startTls')}
                disabled={locked || config.security === 'ldaps'}
                checked={config.security !== 'ldaps' && config.startTls}
                onChange={(e) => update({ startTls: e.target.checked })}
              />
              <Checkbox
                label={t('ldap.server.allowAnonymous')}
                checked={config.allowAnonymous}
                onChange={(e) => update({ allowAnonymous: e.target.checked }, true)}
              />
            </div>
          </div>
          <p className="text-xs text-slate-500">{t('ldap.server.hint')}</p>
          {status.endpoint && (
            <div className="flex items-center gap-2 rounded-md bg-ink-950 px-3 py-2 font-mono text-sm text-sulfur-300">
              {status.certificate && <Lock className="size-3.5 text-emerald-400" />}
              {status.endpoint}
              <span className="font-sans text-xs text-slate-500">
                · {t('ldap.server.counters', { entries: status.entries, ...status.counters })}
                {status.certificate &&
                  ` · ${t('ldap.server.certificate', { name: status.certificate.commonName, thumbprint: status.certificate.thumbprint.slice(0, 16) })}`}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto"
                title={t('ui.copy')}
                onClick={() => navigator.clipboard.writeText(status.endpoint)}
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
          )}
          <ErrorBanner error={error} onClose={() => setError(null)} />
        </div>
      </Card>

      <Card
        id="ldap.server.directory"
        title={t('ldap.server.directory', { count: parsed.entries.length })}
        className="shrink-0"
        actions={
          <>
            {running && <span className="text-xs text-slate-500">{t('ui.liveApplied')}</span>}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => confirm(t('ldap.server.confirmReset')) && update({ ldif: DEFAULT_LDIF }, true)}
            >
              <RotateCcw className="size-3.5" /> {t('ldap.server.resetLdif')}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
          <div className="flex flex-col gap-2">
            <textarea
              spellCheck={false}
              value={config.ldif}
              onChange={(e) => update({ ldif: e.target.value }, true)}
              className="min-h-96 w-full rounded-md border border-ink-700 bg-ink-950 px-3 py-2 font-mono text-xs text-slate-100 focus:border-sulfur-500 focus:outline-none"
            />
            {parsed.errors.length > 0 ? (
              <p className="text-xs text-red-300">
                {parsed.errors
                  .slice(0, 3)
                  .map((e) => t('ldap.errors.ldif', { line: e.line, problem: t(`ldap.ldif.${e.message}`) }))
                  .join(' · ')}
              </p>
            ) : (
              <p className="text-xs text-slate-500">{t('ldap.server.ldifHint')}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-medium tracking-wide text-slate-500 uppercase">
              {t('ldap.server.accounts', { count: people.length })}
            </h3>
            <div className="flex flex-col gap-1 font-mono text-xs">
              {people.map((e) => (
                <span key={e.dn} className="break-all text-slate-300 select-text">
                  {e.dn}
                </span>
              ))}
            </div>
            <p className="text-xs text-slate-500">{t('ldap.server.accountsHint')}</p>
          </div>
        </div>
      </Card>

      <ServerLog />
    </div>
  )
}
