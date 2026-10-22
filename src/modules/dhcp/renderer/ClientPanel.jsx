import { useEffect, useState } from 'react'
import { KeyRound, LogOut, Search, Shuffle, Square, Trash2 } from 'lucide-react'
import { Button, Card, ErrorBanner, Field, Input, usePersistentState } from '@azerxim/sulfur-sdk/ui'
import { formatTime } from '@azerxim/sulfur-sdk'
import { DEFAULT_CLIENT_CONFIG, MAX_HISTORY } from '../shared/constants'
import { dhcpApi } from './api'
import InterfaceSelect from './InterfaceSelect'
import { t } from '../shared/i18n'

/** Adresse MAC aléatoire administrée localement (premier octet 02, 06, 0a…), pour un client fictif. */
function randomMac() {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  bytes[0] = (bytes[0] & 0xfc) | 0x02
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(':')
}

/** Contenu d'une offre ou d'un bail : adresse, serveur, masque, passerelle, DNS, durée. */
function ReplyDetails({ reply }) {
  return (
    <div className="font-mono text-xs text-slate-300">
      <span className="text-slate-100">{reply.ip}</span>
      {' · '}
      {t('dhcp.reply.server', { server: reply.server ?? '—' })}
      {reply.subnetMask && ` · ${t('dhcp.reply.mask', { mask: reply.subnetMask })}`}
      {reply.routers?.length > 0 && ` · ${t('dhcp.reply.router', { router: reply.routers.join(', ') })}`}
      {reply.dns?.length > 0 && ` · ${t('dhcp.reply.dns', { dns: reply.dns.join(', ') })}`}
      {reply.domain && ` · ${t('dhcp.reply.domain', { domain: reply.domain })}`}
      {reply.leaseTime != null && ` · ${t('dhcp.reply.lease', { seconds: reply.leaseTime })}`}
    </div>
  )
}

export default function ClientPanel({ network, onReload }) {
  const [config, setConfig] = usePersistentState('dhcp', 'client', DEFAULT_CLIENT_CONFIG)
  const [history, setHistory] = useState([])
  const [status, setStatus] = useState({ running: false, lease: null })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const update = (patch) => setConfig((c) => ({ ...c, ...patch }))
  const iface = network.interfaces.find((i) => i.name === config.interface)

  useEffect(() => {
    dhcpApi.client.history().then(setHistory)
    dhcpApi.client.status().then(setStatus)
    return dhcpApi.client.onStatus(setStatus)
  }, [])

  async function run(action) {
    setBusy(true)
    setError(null)
    try {
      const entry = await action()
      setHistory((list) => [entry, ...list].slice(0, MAX_HISTORY))
      if (!entry.ok) setError(entry.error)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-2">
      <Card id="dhcp.client.request" title={t('dhcp.client.title')} className="shrink-0">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)] items-end gap-3">
            <Field label={t('dhcp.server.interface')}>
              <InterfaceSelect
                value={config.interface}
                interfaces={network.interfaces}
                disabled={busy}
                onChange={(name) => update({ interface: name })}
                onReload={onReload}
              />
            </Field>
            <Field label={t('dhcp.client.mac')}>
              <div className="flex gap-1">
                <Input
                  className="font-mono"
                  value={config.mac}
                  placeholder={iface?.mac ?? t('dhcp.client.macPlaceholder')}
                  disabled={busy}
                  onChange={(e) => update({ mac: e.target.value.trim() })}
                />
                <Button
                  variant="ghost"
                  title={t('dhcp.client.randomMac')}
                  disabled={busy}
                  onClick={() => update({ mac: randomMac() })}
                >
                  <Shuffle className="size-4" />
                </Button>
              </div>
            </Field>
          </div>
          <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] items-end gap-3">
            <Field label={t('dhcp.client.hostname')}>
              <Input value={config.hostname} disabled={busy} onChange={(e) => update({ hostname: e.target.value })} />
            </Field>
            <Field label={t('dhcp.client.requestedIp')}>
              <Input
                className="font-mono"
                value={config.requestedIp}
                placeholder={t('dhcp.server.none')}
                disabled={busy}
                onChange={(e) => update({ requestedIp: e.target.value.trim() })}
              />
            </Field>
            <Field label={t('dhcp.client.timeout')}>
              <Input
                type="number"
                value={config.timeout}
                disabled={busy}
                onChange={(e) => update({ timeout: Number(e.target.value) })}
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={busy} onClick={() => run(() => dhcpApi.client.run(config, 'discover'))}>
              <Search className="size-4" /> {t('dhcp.client.discover')}
            </Button>
            <Button variant="primary" disabled={busy} onClick={() => run(() => dhcpApi.client.run(config, 'lease'))}>
              <KeyRound className="size-4" /> {t('dhcp.client.lease')}
            </Button>
            {status.lease && (
              <Button disabled={busy} onClick={() => run(() => dhcpApi.client.release(config))}>
                <LogOut className="size-4" /> {t('dhcp.client.release', { ip: status.lease.ip })}
              </Button>
            )}
            {busy && (
              <Button variant="ghost" onClick={() => dhcpApi.client.abort()}>
                <Square className="size-3.5" /> {t('dhcp.client.abort')}
              </Button>
            )}
          </div>
          <p className="text-xs text-slate-500">{t('dhcp.client.hint')}</p>
          <ErrorBanner error={error} onClose={() => setError(null)} />
        </div>
      </Card>

      <Card
        id="dhcp.client.history"
        title={t('dhcp.client.history', { count: history.length })}
        className="min-h-48 shrink-0"
        actions={
          <Button
            size="sm"
            variant="ghost"
            disabled={!history.length}
            onClick={() => dhcpApi.client.clear().then(setHistory)}
          >
            <Trash2 className="size-3.5" /> {t('dhcp.server.clearLog')}
          </Button>
        }
      >
        {history.length ? (
          <div className="flex flex-col">
            {history.map((e) => (
              <div key={e.id} className="flex flex-col gap-1 border-t border-ink-800 py-2 first:border-t-0">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono text-slate-500">{formatTime(e.time)}</span>
                  <span className="text-sulfur-300">{t(`dhcp.modes.${e.mode}`)}</span>
                  <span className="font-mono text-slate-400">
                    {e.interface} · {e.mac}
                  </span>
                </div>
                {e.mode === 'release' ? (
                  <p className={`text-xs ${e.ok ? 'text-slate-300' : 'text-red-300'}`}>
                    {e.ok ? t('dhcp.client.released', { ip: e.lease.ip, server: e.lease.server }) : e.error}
                  </p>
                ) : (
                  <>
                    {e.lease ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-emerald-300">{t('dhcp.client.obtained')}</span>
                        <ReplyDetails reply={e.lease} />
                      </div>
                    ) : (
                      e.offers?.map((offer, i) => <ReplyDetails key={i} reply={offer} />)
                    )}
                    {e.ignored?.length > 0 && (
                      <p className="text-xs text-amber-300">{t('dhcp.client.ignored', { count: e.ignored.length })}</p>
                    )}
                    {e.error && <p className="text-xs text-red-300">{e.error}</p>}
                  </>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-600">{t('dhcp.client.noHistory')}</p>
        )}
      </Card>
    </div>
  )
}
