import { useEffect, useState } from 'react'
import { KeyRound, Search, Trash2 } from 'lucide-react'
import { Button, Card, Checkbox, ErrorBanner, Field, Input, Select, usePersistentState } from '@azerxim/sulfur-sdk/ui'
import { formatTime } from '@azerxim/sulfur-sdk'
import { DEFAULT_CLIENT_CONFIG, SCOPES } from '../shared/constants'
import { ldapApi } from './api'
import { t } from '../shared/i18n'

function Entries({ entries }) {
  if (!entries.length) return <p className="text-sm text-slate-500">{t('ldap.client.noEntry')}</p>
  return (
    <div className="flex flex-col gap-3">
      {entries.map((e) => (
        <div key={e.dn} className="rounded-md border border-ink-800 bg-ink-950 px-3 py-2">
          <div className="mb-1 font-mono text-xs break-all text-sulfur-300 select-text">{e.dn}</div>
          <dl className="grid grid-cols-[10rem_minmax(0,1fr)] gap-x-3 gap-y-0.5 font-mono text-xs">
            {Object.entries(e.attributes).map(([name, values]) => (
              <div key={name} className="contents">
                <dt className="text-slate-500">{name}</dt>
                <dd className="break-all text-slate-200 select-text">{values.join(' · ')}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  )
}

export default function ClientPanel({ serverUrl }) {
  // Le mot de passe n'est pas enregistré dans la configuration.
  const [config, setConfig] = usePersistentState('ldap', 'client', DEFAULT_CLIENT_CONFIG, {
    persist: (c) => ({ ...c, password: '' })
  })
  const [history, setHistory] = useState([])
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const update = (patch) => setConfig((c) => ({ ...c, ...patch }))

  useEffect(() => {
    ldapApi.client.history().then((list) => {
      setHistory(list)
      setSelected(list[0] ?? null)
    })
  }, [])

  // Aligne l'URL sur le serveur local lorsqu'il démarre.
  useEffect(() => {
    if (serverUrl) setConfig((c) => ({ ...c, url: serverUrl.replace('0.0.0.0', '127.0.0.1') }))
  }, [serverUrl, setConfig])

  async function run(action) {
    setBusy(true)
    setError(null)
    try {
      const entry = await action(config)
      setHistory((list) => [entry, ...list].slice(0, 50))
      setSelected(entry)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-2">
      <Card id="ldap.client.connection" title={t('ui.connection')} className="shrink-0">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[1.5fr_2fr_1fr_auto] items-end gap-3">
            <Field label={t('ldap.client.url')}>
              <Input className="font-mono" value={config.url} onChange={(e) => update({ url: e.target.value })} />
            </Field>
            <Field label={t('ldap.client.bindDn')}>
              <Input
                className="font-mono"
                placeholder={t('ldap.client.anonymous')}
                value={config.bindDn}
                onChange={(e) => update({ bindDn: e.target.value })}
              />
            </Field>
            <Field label={t('ldap.client.password')}>
              <Input type="password" value={config.password} onChange={(e) => update({ password: e.target.value })} />
            </Field>
            <Button variant="primary" disabled={busy} onClick={() => run(ldapApi.client.authenticate)}>
              <KeyRound className="size-4" /> {t('ldap.client.authenticate')}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <Checkbox
              label={t('ldap.client.startTls')}
              checked={config.startTls}
              onChange={(e) => update({ startTls: e.target.checked })}
            />
            <Checkbox
              label={t('ldap.client.rejectUnauthorized')}
              checked={config.rejectUnauthorized}
              onChange={(e) => update({ rejectUnauthorized: e.target.checked })}
            />
            <Field label={t('ldap.client.timeout')} className="w-36">
              <Input
                type="number"
                value={config.timeout}
                onChange={(e) => update({ timeout: Number(e.target.value) })}
              />
            </Field>
          </div>
        </div>
      </Card>

      <Card id="ldap.client.search" title={t('ldap.client.search')} className="shrink-0">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[2fr_8rem_2fr_1.5fr_6rem_auto] items-end gap-3">
            <Field label={t('ldap.client.base')}>
              <Input className="font-mono" value={config.base} onChange={(e) => update({ base: e.target.value })} />
            </Field>
            <Field label={t('ldap.client.scope')}>
              <Select value={config.scope} onChange={(e) => update({ scope: e.target.value })}>
                {SCOPES.map((s) => (
                  <option key={s} value={s}>
                    {t(`ldap.scopes.${s}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('ldap.client.filter')}>
              <Input
                className="font-mono"
                value={config.filter}
                onChange={(e) => update({ filter: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && run(ldapApi.client.search)}
              />
            </Field>
            <Field label={t('ldap.client.attributes')}>
              <Input
                className="font-mono"
                placeholder="cn, mail, memberOf"
                value={config.attributes}
                onChange={(e) => update({ attributes: e.target.value })}
              />
            </Field>
            <Field label={t('ldap.client.sizeLimit')}>
              <Input
                type="number"
                min={0}
                value={config.sizeLimit}
                onChange={(e) => update({ sizeLimit: Number(e.target.value) })}
              />
            </Field>
            <Button variant="primary" disabled={busy} onClick={() => run(ldapApi.client.search)}>
              <Search className="size-4" /> {t('ldap.client.searchButton')}
            </Button>
          </div>
          <ErrorBanner error={error} onClose={() => setError(null)} />
        </div>
      </Card>

      {selected && (
        <Card id="ldap.client.result" title={t('ldap.client.result')} className="shrink-0">
          <div className="flex flex-col gap-3">
            <p className="text-xs text-slate-400">
              {selected.kind === 'bind'
                ? t('ldap.client.bindOk', {
                    dn: selected.bindDn || t('ldap.client.anonymous'),
                    identity: selected.identity || '—',
                    duration: selected.duration
                  })
                : t('ldap.client.searchSummary', { count: selected.entries.length, duration: selected.duration })}
            </p>
            {selected.kind === 'search' && <Entries entries={selected.entries} />}
          </div>
        </Card>
      )}

      <Card
        id="ldap.client.history"
        title={t('ldap.client.history', { count: history.length })}
        className="shrink-0"
        actions={
          <Button
            size="sm"
            variant="ghost"
            disabled={!history.length}
            onClick={() =>
              ldapApi.client.clear().then(() => {
                setHistory([])
                setSelected(null)
              })
            }
          >
            <Trash2 className="size-3.5" /> {t('ldap.server.clearLog')}
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
                className={`grid grid-cols-[5rem_6rem_minmax(0,1fr)_5rem] gap-2 rounded px-2 py-1 text-left font-mono text-xs ${
                  selected?.id === h.id ? 'bg-ink-800' : 'hover:bg-ink-800/60'
                }`}
              >
                <span className="text-slate-500">{formatTime(h.time)}</span>
                <span className="text-slate-400">{t(`ldap.client.kinds.${h.kind}`)}</span>
                <span className="truncate text-slate-200">
                  {h.kind === 'search' ? `${h.base} ${h.filter}` : h.bindDn}
                </span>
                <span className="text-right text-slate-500">{h.kind === 'search' ? h.entries.length : '✓'}</span>
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
