import { useEffect, useState } from 'react'
import { FileText, Play, Square, Trash2, TriangleAlert } from 'lucide-react'
import {
  Button,
  Card,
  Checkbox,
  ErrorBanner,
  Field,
  Input,
  Modal,
  StatusDot,
  usePersistentState
} from '@azerxim/sulfur-sdk/ui'
import { formatTime, intToIp, ipToInt, subnetOf } from '@azerxim/sulfur-sdk'
import { DEFAULT_SERVER_CONFIG, MAX_POOL } from '../shared/constants'
import { dhcpApi } from './api'
import InterfaceSelect from './InterfaceSelect'
import { t } from '../shared/i18n'

const MAX_SHOWN = 500
const LEVEL_STYLES = { info: 'text-slate-300', warn: 'text-amber-300', error: 'text-red-300' }
const STATE_STYLES = { offered: 'text-amber-300', bound: 'text-emerald-300', declined: 'text-red-300' }

/** Plage proposée dans le sous-réseau de l'interface (.100 à .199 d'un /24), sans l'adresse du serveur. */
function suggestPool(iface) {
  const subnet = subnetOf(iface.address, iface.netmask)
  if (!subnet || subnet.prefix > 30) return null
  const server = ipToInt(iface.address)
  let first = subnet.network + 1
  let last = subnet.broadcast - 1
  if (subnet.prefix <= 24) {
    const base = Math.floor(server / 256) * 256
    first = base + 100
    last = base + 199
  }
  if (server >= first && server <= last) {
    if (server - first >= last - server) last = server - 1
    else first = server + 1
  }
  last = Math.min(last, first + MAX_POOL - 1)
  return first <= last ? { poolStart: intToIp(first), poolEnd: intToIp(last) } : null
}

function ServerLog({ logFile }) {
  const [entries, setEntries] = useState([])
  const [error, setError] = useState(null)
  useEffect(() => {
    dhcpApi.server.logs().then(setEntries)
    return dhcpApi.server.onLog((entry) => setEntries((list) => [...list.slice(-(MAX_SHOWN - 1)), entry]))
  }, [])
  return (
    <Card
      id="dhcp.server.log"
      title={t('dhcp.server.log', { count: entries.length })}
      className="min-h-56 shrink-0"
      actions={
        <>
          <Button
            size="sm"
            variant="ghost"
            title={logFile}
            onClick={() => dhcpApi.server.openLogFile().catch((err) => setError(err.message))}
          >
            <FileText className="size-3.5" /> {t('dhcp.server.openLogFile')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!entries.length}
            onClick={() => dhcpApi.server.clearLogs().then(setEntries)}
          >
            <Trash2 className="size-3.5" /> {t('dhcp.server.clearLog')}
          </Button>
        </>
      }
    >
      <ErrorBanner error={error} onClose={() => setError(null)} />
      {entries.length ? (
        <div className="flex flex-col font-mono text-xs">
          {[...entries].reverse().map((e) => (
            <div
              key={e.id}
              className="grid grid-cols-[5rem_4.5rem_9rem_minmax(0,1fr)] gap-2 border-t border-ink-800 py-1 first:border-t-0"
            >
              <span className="text-slate-500">{formatTime(e.time)}</span>
              <span className="text-sulfur-300">{e.type ?? ''}</span>
              <span className="truncate text-slate-500">{e.mac ?? ''}</span>
              <span className={`break-all ${LEVEL_STYLES[e.level] ?? ''}`}>{e.message}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-600">{t('dhcp.server.noLog')}</p>
      )}
      <p className="mt-2 text-xs text-slate-500">{t('dhcp.server.logHint')}</p>
    </Card>
  )
}

/** Avertissement affiché avant chaque démarrage : il faut le confirmer pour démarrer. */
function StartWarning({ summary, config, busy, error, onCancel, onStart }) {
  const [accepted, setAccepted] = useState(false)
  return (
    <Modal title={t('dhcp.warning.title')} onClose={onCancel} className="max-w-xl">
      <div className="flex flex-col gap-3 text-sm text-slate-300">
        <div className="flex gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-200">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p>{t('dhcp.warning.text')}</p>
        </div>
        <p>{t('dhcp.warning.effects')}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md bg-ink-950 px-3 py-2 text-xs">
          <dt className="text-slate-500">{t('dhcp.server.interface')}</dt>
          <dd className="font-mono">
            {summary.interface} · {summary.address} ({summary.cidr})
          </dd>
          <dt className="text-slate-500">{t('dhcp.server.pool')}</dt>
          <dd className="font-mono">
            {config.poolStart} – {config.poolEnd}
          </dd>
          <dt className="text-slate-500">{t('dhcp.server.macFilter')}</dt>
          <dd>{config.macFilter ? t('dhcp.warning.filterOn') : t('dhcp.warning.filterOff')}</dd>
        </dl>
        <Checkbox
          label={t('dhcp.warning.confirm', { name: summary.interface })}
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
        />
        <ErrorBanner error={error} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            {t('dhcp.warning.cancel')}
          </Button>
          <Button variant="primary" disabled={!accepted || busy} onClick={onStart}>
            <Play className="size-3.5" /> {busy ? t('ui.starting') : t('ui.start')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default function ServerPanel({ status, network, onReload }) {
  const [config, setConfig] = usePersistentState('dhcp', 'server', DEFAULT_SERVER_CONFIG)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [warning, setWarning] = useState(null)
  const running = status.running
  const locked = running || busy
  const update = (patch) => setConfig((c) => ({ ...c, ...patch }))
  const iface = network.interfaces.find((i) => i.name === config.interface)

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

  // Configuration vérifiée par le process principal avant d'afficher l'avertissement.
  const askStart = () => run(async () => setWarning(await dhcpApi.server.check(config)))
  const start = () =>
    run(async () => {
      await dhcpApi.server.start(config, true)
      setWarning(null)
    })

  function chooseInterface(name) {
    const next = network.interfaces.find((i) => i.name === name)
    const pool = next && !config.poolStart && !config.poolEnd ? suggestPool(next) : null
    update({ interface: name, ...pool })
  }

  const leases = status.leases ?? []
  const counters = status.counters

  return (
    <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-2">
      <Card
        id="dhcp.server.config"
        title={t('dhcp.server.title')}
        className="shrink-0"
        actions={
          <>
            <StatusDot
              on={running}
              label={running ? t('dhcp.server.running', { count: leases.length }) : t('ui.stopped')}
            />
            {running ? (
              <Button variant="danger" size="sm" disabled={busy} onClick={() => run(dhcpApi.server.stop)}>
                <Square className="size-3.5" /> {t('ui.stop')}
              </Button>
            ) : (
              <Button variant="primary" size="sm" disabled={busy} onClick={askStart}>
                <Play className="size-3.5" /> {t('ui.start')}
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))_auto] items-end gap-4">
            <Field label={t('dhcp.server.interface')}>
              <InterfaceSelect
                value={config.interface}
                interfaces={network.interfaces}
                disabled={locked}
                onChange={chooseInterface}
                onReload={onReload}
              />
            </Field>
            <Field label={t('dhcp.server.poolStart')}>
              <Input
                className="font-mono"
                value={config.poolStart}
                disabled={locked}
                onChange={(e) => update({ poolStart: e.target.value.trim() })}
              />
            </Field>
            <Field label={t('dhcp.server.poolEnd')}>
              <Input
                className="font-mono"
                value={config.poolEnd}
                disabled={locked}
                onChange={(e) => update({ poolEnd: e.target.value.trim() })}
              />
            </Field>
            <Button disabled={locked || !iface} onClick={() => iface && update(suggestPool(iface) ?? {})}>
              {t('dhcp.server.suggest')}
            </Button>
          </div>
          <div className="grid grid-cols-[repeat(2,minmax(0,1fr))_minmax(0,1.2fr)_8rem] items-end gap-4">
            <Field label={t('dhcp.server.router')}>
              <Input
                className="font-mono"
                value={config.router}
                placeholder={t('dhcp.server.none')}
                disabled={locked}
                onChange={(e) => update({ router: e.target.value.trim() })}
              />
            </Field>
            <Field label={t('dhcp.server.dns')}>
              <Input
                className="font-mono"
                value={config.dns}
                placeholder={t('dhcp.server.none')}
                disabled={locked}
                onChange={(e) => update({ dns: e.target.value })}
              />
            </Field>
            <Field label={t('dhcp.server.domain')}>
              <Input
                value={config.domain}
                placeholder={t('dhcp.server.none')}
                disabled={locked}
                onChange={(e) => update({ domain: e.target.value.trim() })}
              />
            </Field>
            <Field label={t('dhcp.server.leaseTime')}>
              <Input
                type="number"
                value={config.leaseTime}
                disabled={locked}
                onChange={(e) => update({ leaseTime: Number(e.target.value) })}
              />
            </Field>
          </div>
          <div className="flex flex-col gap-2">
            <Checkbox
              label={t('dhcp.server.macFilter')}
              checked={config.macFilter}
              disabled={locked}
              onChange={(e) => update({ macFilter: e.target.checked })}
            />
            {config.macFilter && (
              <Field label={t('dhcp.server.macs')}>
                <textarea
                  className="min-h-20 w-full rounded-md border border-ink-700 bg-ink-950 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-600 focus:border-sulfur-500 focus:outline-none disabled:opacity-50"
                  value={config.macs}
                  placeholder="02:00:5e:10:00:01, 02:00:5e:10:00:02"
                  disabled={locked}
                  onChange={(e) => update({ macs: e.target.value })}
                />
              </Field>
            )}
          </div>
          <p className="text-xs text-slate-500">
            {t('dhcp.server.hint', { networks: network.networks.join(', '), max: MAX_POOL })}
          </p>
          <p className="text-xs text-slate-500">{t('dhcp.server.linuxHint')}</p>
          {running && status.config && (
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-ink-950 px-3 py-2 font-mono text-sm text-sulfur-300">
              {status.config.interface} · {status.config.address}:{status.config.port} · {status.config.poolStart} –{' '}
              {status.config.poolEnd}
              <span className="font-sans text-xs text-slate-500">· {t('dhcp.server.counters', counters)}</span>
            </div>
          )}
          <ErrorBanner error={error} onClose={() => setError(null)} />
        </div>
      </Card>

      {running && (
        <Card id="dhcp.server.leases" title={t('dhcp.server.leases', { count: leases.length })} className="shrink-0">
          {leases.length ? (
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className="px-2 pb-1 font-medium">{t('dhcp.lease.ip')}</th>
                  <th className="px-2 pb-1 font-medium">{t('dhcp.lease.mac')}</th>
                  <th className="px-2 pb-1 font-medium">{t('dhcp.lease.hostname')}</th>
                  <th className="px-2 pb-1 font-medium">{t('dhcp.lease.state')}</th>
                  <th className="px-2 pb-1 font-medium">{t('dhcp.lease.expires')}</th>
                </tr>
              </thead>
              <tbody>
                {leases.map((l) => (
                  <tr key={l.ip} className="border-t border-ink-800">
                    <td className="px-2 py-1 font-mono text-xs text-slate-200">{l.ip}</td>
                    <td className="px-2 py-1 font-mono text-xs text-slate-400">{l.mac}</td>
                    <td className="px-2 py-1 text-xs text-slate-400">{l.hostname ?? '—'}</td>
                    <td className={`px-2 py-1 text-xs ${STATE_STYLES[l.state] ?? ''}`}>
                      {t(`dhcp.states.${l.state}`)}
                    </td>
                    <td className="px-2 py-1 font-mono text-xs text-slate-500">{formatTime(l.expires)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-slate-600">{t('dhcp.server.noLease')}</p>
          )}
        </Card>
      )}

      <ServerLog logFile={status.logFile} />

      {warning && (
        <StartWarning
          summary={warning}
          config={config}
          busy={busy}
          error={error}
          onCancel={() => {
            setWarning(null)
            setError(null)
          }}
          onStart={start}
        />
      )}
    </div>
  )
}
