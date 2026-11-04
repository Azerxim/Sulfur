import { useEffect, useMemo, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowsRotate, faKey, faPlay, faStop, faTrashCan, faWaveSquare } from '@fortawesome/free-solid-svg-icons'
import { Button, Card, Checkbox, ErrorBanner, Field, Input, Select, usePersistentState } from '@azerxim/sulfur-sdk/ui'
import { formatTime, instanceSection } from '@azerxim/sulfur-sdk'
import { DEFAULT_RADIUS_CLIENT_CONFIG, METHODS, parseAttributes } from '../../shared/radius'
import { radiusApi } from '../api'
import { t } from '../../shared/i18n'

const MAX_HISTORY = 50

/** Libellé d'une entrée d'historique : type d'échange et détail. */
function describe(entry) {
  if (entry.kind === 'auth') return `${entry.user} · ${t(`radius.methods.${entry.method}`)}`
  if (entry.kind === 'accounting') return `${t(`radius.client.acct.${entry.action}`)} · ${entry.sessionId}`
  return 'Status-Server'
}

function Result({ entry }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        <span className={`font-mono font-medium ${entry.accepted ? 'text-emerald-300' : 'text-red-300'}`}>
          {entry.code}
        </span>
        <span className="text-xs text-slate-400">
          {' · '}
          {describe(entry)}
          {' · '}
          {t('radius.client.timing', {
            destination: entry.destination,
            duration: entry.duration,
            attempts: entry.attempts
          })}
          {entry.sessionTime !== null &&
            entry.sessionTime !== undefined &&
            ` · ${t('radius.client.sessionTime', { seconds: entry.sessionTime })}`}
        </span>
      </p>
      {entry.attributes.length ? (
        <dl className="grid grid-cols-[14rem_minmax(0,1fr)] gap-x-3 gap-y-0.5 rounded-md bg-ink-950 px-3 py-2 font-mono text-xs">
          {entry.attributes.map((a, i) => (
            <div key={i} className="contents">
              <dt className="text-slate-500">{a.name}</dt>
              <dd className="break-all text-slate-200 select-text">{a.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-xs text-slate-500">{t('radius.client.noAttribute')}</p>
      )}
    </div>
  )
}

export default function ClientPanel({ instance }) {
  const api = useMemo(() => radiusApi.client(instance.id), [instance.id])
  // Le mot de passe n'est pas enregistré dans la configuration.
  const [config, setConfig] = usePersistentState(
    'ldap',
    instanceSection('radiusClient', instance.id),
    DEFAULT_RADIUS_CLIENT_CONFIG,
    {
      persist: (c) => ({ ...c, password: '' })
    }
  )
  const [history, setHistory] = useState([])
  const [selected, setSelected] = useState(null)
  const [session, setSession] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const update = (patch) => setConfig((c) => ({ ...c, ...patch }))
  const { errors } = useMemo(() => parseAttributes(config.attributes), [config.attributes])

  useEffect(() => {
    api.history().then((list) => {
      setHistory(list)
      setSelected(list[0] ?? null)
    })
    api.status().then((s) => setSession(s.session))
  }, [api])

  async function run(action) {
    setBusy(true)
    setError(null)
    try {
      const entry = await action()
      setHistory((list) => [entry, ...list].slice(0, MAX_HISTORY))
      setSelected(entry)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
      api.status().then((s) => setSession(s.session))
    }
  }

  const accounting = (action) => run(() => api.accounting(config, action))

  return (
    <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-2">
      <Card id="radius.client.connection" title={t('ui.connection')} className="shrink-0">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[2fr_1fr_1fr_2fr_1fr_1fr] items-end gap-3">
            <Field label={t('radius.client.host')}>
              <Input className="font-mono" value={config.host} onChange={(e) => update({ host: e.target.value })} />
            </Field>
            <Field label={t('radius.server.authPort')}>
              <Input
                type="number"
                value={config.authPort}
                onChange={(e) => update({ authPort: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('radius.server.acctPort')}>
              <Input
                type="number"
                value={config.acctPort}
                onChange={(e) => update({ acctPort: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('radius.clients.secret')}>
              <Input className="font-mono" value={config.secret} onChange={(e) => update({ secret: e.target.value })} />
            </Field>
            <Field label={t('ldap.client.timeout')}>
              <Input
                type="number"
                value={config.timeout}
                onChange={(e) => update({ timeout: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('radius.client.retries')}>
              <Input
                type="number"
                min={0}
                max={10}
                value={config.retries}
                onChange={(e) => update({ retries: Number(e.target.value) })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
            <Field label={t('radius.client.nasIdentifier')}>
              <Input value={config.nasIdentifier} onChange={(e) => update({ nasIdentifier: e.target.value })} />
            </Field>
            <Field label={t('radius.client.nasIpAddress')}>
              <Input
                className="font-mono"
                placeholder={t('radius.client.notSent')}
                value={config.nasIpAddress}
                onChange={(e) => update({ nasIpAddress: e.target.value })}
              />
            </Field>
            <Checkbox
              className="mb-2"
              label={t('radius.client.messageAuthenticator')}
              checked={config.messageAuthenticator}
              onChange={(e) => update({ messageAuthenticator: e.target.checked })}
            />
          </div>
        </div>
      </Card>

      <Card id="radius.client.request" title={t('radius.client.title')} className="shrink-0">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[1.5fr_1.5fr_10rem_auto_auto] items-end gap-3">
            <Field label={t('radius.users.username')}>
              <Input value={config.username} onChange={(e) => update({ username: e.target.value })} />
            </Field>
            <Field label={t('radius.users.password')}>
              <Input
                type="password"
                value={config.password}
                onChange={(e) => update({ password: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && run(() => api.authenticate(config))}
              />
            </Field>
            <Field label={t('radius.client.method')}>
              <Select value={config.method} onChange={(e) => update({ method: e.target.value })}>
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {t(`radius.methods.${m}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              variant="primary"
              disabled={busy || errors.length > 0}
              onClick={() => run(() => api.authenticate(config))}
            >
              <FontAwesomeIcon icon={faKey} className="size-4" /> {t('ldap.client.authenticate')}
            </Button>
            <Button
              disabled={busy}
              title={t('radius.client.statusServerHint')}
              onClick={() => run(() => api.statusServer(config))}
            >
              <FontAwesomeIcon icon={faWaveSquare} className="size-4" /> Status-Server
            </Button>
          </div>
          <Field label={t('radius.client.attributes')}>
            <textarea
              spellCheck={false}
              rows={3}
              placeholder="NAS-Port-Type = Ethernet"
              value={config.attributes}
              onChange={(e) => update({ attributes: e.target.value })}
              className={`w-full rounded-md border bg-ink-950 px-3 py-1.5 font-mono text-xs text-slate-100 focus:border-sulfur-500 focus:outline-none ${
                errors.length ? 'border-red-500/60' : 'border-ink-700'
              }`}
            />
          </Field>
          <p className={`text-xs ${errors.length ? 'text-red-300' : 'text-slate-500'}`}>
            {errors.length ? t('radius.errors.attributeLine', errors[0]) : t('radius.client.attributesHint')}
          </p>
          <ErrorBanner error={error} onClose={() => setError(null)} />
        </div>
      </Card>

      <Card id="radius.client.accounting" title={t('radius.client.accountingTitle')} className="shrink-0">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t('radius.client.sessionId')} className="w-56">
              <Input
                className="font-mono"
                placeholder={t('radius.client.sessionIdPlaceholder')}
                value={config.sessionId}
                onChange={(e) => update({ sessionId: e.target.value })}
              />
            </Field>
            <Button disabled={busy || errors.length > 0} onClick={() => accounting('start')}>
              <FontAwesomeIcon icon={faPlay} className="size-3.5" /> {t('radius.client.acct.start')}
            </Button>
            <Button disabled={busy || errors.length > 0 || !session} onClick={() => accounting('interim')}>
              <FontAwesomeIcon icon={faArrowsRotate} className="size-3.5" /> {t('radius.client.acct.interim')}
            </Button>
            <Button disabled={busy || errors.length > 0 || !session} onClick={() => accounting('stop')}>
              <FontAwesomeIcon icon={faStop} className="size-3.5" /> {t('radius.client.acct.stop')}
            </Button>
            <span className="mb-2 text-xs text-slate-500">
              {session
                ? t('radius.client.sessionOpen', { id: session.sessionId, time: formatTime(session.started) })
                : t('radius.client.noSession')}
            </span>
          </div>
        </div>
      </Card>

      {selected && (
        <Card id="radius.client.result" title={t('ldap.client.result')} className="shrink-0">
          <Result entry={selected} />
        </Card>
      )}

      <Card
        id="radius.client.history"
        title={t('ldap.client.history', { count: history.length })}
        className="shrink-0"
        actions={
          <Button
            size="sm"
            variant="ghost"
            disabled={!history.length}
            onClick={() =>
              api.clear().then(() => {
                setHistory([])
                setSelected(null)
              })
            }
          >
            <FontAwesomeIcon icon={faTrashCan} className="size-3.5" /> {t('ldap.server.clearLog')}
          </Button>
        }
      >
        {history.length ? (
          <div className="flex flex-col">
            {history.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => setSelected(h)}
                className={`grid grid-cols-[5rem_10rem_minmax(0,1fr)_5rem] gap-2 rounded px-2 py-1 text-left font-mono text-xs ${
                  selected?.id === h.id ? 'bg-ink-800' : 'hover:bg-ink-800/60'
                }`}
              >
                <span className="text-slate-500">{formatTime(h.time)}</span>
                <span className={h.accepted ? 'text-emerald-300' : 'text-red-300'}>{h.code}</span>
                <span className="truncate text-slate-200">{describe(h)}</span>
                <span className="text-right text-slate-500">{h.duration} ms</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-600">{t('ldap.client.noHistory')}</p>
        )}
      </Card>
    </div>
  )
}
