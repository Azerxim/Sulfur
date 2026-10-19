import { useEffect, useState } from 'react'
import { BookOpen, Eye, Fingerprint, Plug, PlugZap, Power, PowerOff, RefreshCw, Send, X } from 'lucide-react'
import { Button, Card, CommitInput, ErrorBanner, Field, Input, Select, StatusDot } from '@renderer/components/ui'
import {
  CONNECTION_TYPES,
  DATA_TYPES,
  DEFAULT_CLIENT_CONFIG,
  DEFAULT_CLIENT_REQUEST,
  DEFAULT_STRING_LENGTH,
  PDU_SIZES
} from '../shared/constants'
import { defaultType, parseAddress } from '../shared/address'
import { usePersistentState } from '@renderer/module-config'
import { s7Api } from './api'
import { formatTime, formatValue, hex } from './format'
import { CpuBadge } from './ServerPanel'
import { t } from '../shared/i18n'

const IDENTITY_FIELDS = ['orderCode', 'version', 'moduleName', 'moduleType', 'serialNumber', 'plantId', 'copyright']

/** Octets saisis : « 01 02 FF », « 0x10,0x20 » ou décimaux « 1 2 255 » (hexadécimal par défaut). */
function parseBytes(raw) {
  return String(raw)
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((item) => {
      const n = /^\d+d$/i.test(item) ? Number(item.slice(0, -1)) : parseInt(item.replace(/^(0x|\$)/i, ''), 16)
      if (!Number.isInteger(n) || n < 0 || n > 255) throw new Error(t('s7.errors.invalidByte', { value: item }))
      return n
    })
}

/** Bouton qui demande une confirmation (second clic) avant d'agir. */
function ConfirmButton({ onConfirm, children, confirmLabel, ...props }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(timer)
  }, [armed])
  return (
    <Button
      {...props}
      variant={armed ? 'danger' : props.variant}
      onClick={() => {
        if (!armed) return setArmed(true)
        setArmed(false)
        onConfirm()
      }}
    >
      {armed ? confirmLabel : children}
    </Button>
  )
}

export default function ClientPanel({ status, serverPort }) {
  const [config, setConfig] = usePersistentState('s7', 'client', DEFAULT_CLIENT_CONFIG)
  const [op, setOp] = usePersistentState('s7', 'clientRequest', DEFAULT_CLIENT_REQUEST)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [raw, setRaw] = useState(null)
  const [writeValue, setWriteValue] = useState('')
  const [writeBytes, setWriteBytes] = useState('')
  const [label, setLabel] = useState('')
  const [live, setLive] = useState({})
  const connected = status.connected

  // Aligne le port sur l'automate simulé local lorsqu'il démarre.
  useEffect(() => {
    if (serverPort && !connected) setConfig((c) => ({ ...c, port: serverPort }))
  }, [serverPort, connected, setConfig])

  useEffect(() => s7Api.client.onData((d) => setLive((l) => ({ ...l, [d.id]: d }))), [])
  useEffect(() => {
    if (!connected) setLive({})
  }, [connected])

  async function run(action) {
    setBusy(true)
    setError(null)
    try {
      return await action()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const update = (patch) => setConfig((c) => ({ ...c, ...patch }))
  const updateOp = (patch) => setOp((o) => ({ ...o, ...patch }))
  const connect = () => run(() => s7Api.client.connect(config))
  const length = op.dataType === 'String' ? (op.length ?? DEFAULT_STRING_LENGTH) : undefined

  /** Adresse saisie : le type suit la taille indiquée (X → Bool, W → Int…) s'il ne lui correspond plus. */
  function changeAddress(address) {
    const patch = { address }
    try {
      const parsed = parseAddress(address)
      if ((parsed.size === 'X') !== (op.dataType === 'Bool')) patch.dataType = defaultType(parsed.size)
    } catch {
      // adresse en cours de saisie
    }
    updateOp(patch)
  }

  const read = () =>
    run(async () => {
      const value = await s7Api.client.readValue(op.address, op.dataType, length)
      setResult({ address: op.address, dataType: op.dataType, value, time: new Date().toISOString() })
    })

  const write = () =>
    run(async () => {
      await s7Api.client.writeValue(op.address, op.dataType, writeValue, length)
      const value = await s7Api.client.readValue(op.address, op.dataType, length)
      setResult({ address: op.address, dataType: op.dataType, value, time: new Date().toISOString() })
    })

  const watch = () =>
    run(async () => {
      await s7Api.client.addWatch({ address: op.address, dataType: op.dataType, length, label: label.trim() })
      setLabel('')
    })

  const readRaw = () =>
    run(async () => {
      const bytes = await s7Api.client.readArea(op.rawArea, op.rawDb, op.rawStart, op.rawCount)
      setRaw({ area: op.rawArea, db: op.rawDb, start: Number(op.rawStart), bytes, time: new Date().toISOString() })
    })

  const writeRaw = () =>
    run(async () => {
      await s7Api.client.writeArea(op.rawArea, op.rawDb, op.rawStart, parseBytes(writeBytes))
      await readRaw()
    })

  const zoneLabel = (area, db) => (area === 'DB' ? `DB${db}` : t(`s7.areas.${area}`))
  const identity = status.identity

  return (
    <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-2">
      <Card
        id="s7.client.connection"
        title={t('ui.connection')}
        className="shrink-0"
        actions={
          <StatusDot
            on={connected}
            label={
              connected
                ? t('s7.client.connectedTo', {
                    endpoint: status.endpoint,
                    tsap: status.tsap?.remote,
                    pdu: status.pduSize
                  })
                : t('ui.disconnected')
            }
          />
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] items-end gap-3">
            <Field label={t('s7.client.host')}>
              <Input
                className="font-mono"
                value={config.host}
                disabled={connected || busy}
                onChange={(e) => update({ host: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && !connected && connect()}
              />
            </Field>
            <Field label={t('s7.server.port')}>
              <Input
                type="number"
                value={config.port}
                disabled={connected || busy}
                onChange={(e) => update({ port: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('s7.client.pduSize')}>
              <Select
                value={config.pduSize}
                disabled={connected || busy}
                onChange={(e) => update({ pduSize: Number(e.target.value) })}
              >
                {PDU_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('s7.client.timeout')}>
              <Input
                type="number"
                value={config.timeout}
                disabled={connected || busy}
                onChange={(e) => update({ timeout: Number(e.target.value) })}
              />
            </Field>
            {connected ? (
              <Button variant="danger" disabled={busy} onClick={() => run(s7Api.client.disconnect)}>
                <Plug className="size-4" /> {t('ui.disconnect')}
              </Button>
            ) : (
              <Button variant="primary" disabled={busy || !config.host} onClick={connect}>
                <PlugZap className="size-4" /> {busy ? t('ui.connecting') : t('ui.connect')}
              </Button>
            )}
          </div>

          <div className="grid grid-cols-[2fr_1fr_1fr_1.4fr] items-end gap-3">
            <Field label={t('s7.client.addressing')}>
              <Select
                value={config.addressing}
                disabled={connected || busy}
                onChange={(e) => update({ addressing: e.target.value })}
              >
                <option value="rackSlot">{t('s7.client.addressingModes.rackSlot')}</option>
                <option value="tsap">{t('s7.client.addressingModes.tsap')}</option>
              </Select>
            </Field>
            {config.addressing === 'tsap' ? (
              <>
                <Field label={t('s7.client.localTsap')}>
                  <Input
                    className="font-mono"
                    value={config.localTsap}
                    disabled={connected || busy}
                    onChange={(e) => update({ localTsap: e.target.value })}
                  />
                </Field>
                <Field label={t('s7.client.remoteTsap')}>
                  <Input
                    className="font-mono"
                    value={config.remoteTsap}
                    disabled={connected || busy}
                    onChange={(e) => update({ remoteTsap: e.target.value })}
                  />
                </Field>
                <span />
              </>
            ) : (
              <>
                <Field label={t('s7.client.rack')}>
                  <Input
                    type="number"
                    min={0}
                    max={7}
                    value={config.rack}
                    disabled={connected || busy}
                    onChange={(e) => update({ rack: Number(e.target.value) })}
                  />
                </Field>
                <Field label={t('s7.client.slot')}>
                  <Input
                    type="number"
                    min={0}
                    max={31}
                    value={config.slot}
                    disabled={connected || busy}
                    onChange={(e) => update({ slot: Number(e.target.value) })}
                  />
                </Field>
                <Field label={t('s7.client.connectionType')}>
                  <Select
                    value={config.connectionType}
                    disabled={connected || busy}
                    onChange={(e) => update({ connectionType: e.target.value })}
                  >
                    {Object.keys(CONNECTION_TYPES).map((type) => (
                      <option key={type} value={type}>
                        {t(`s7.client.connectionTypes.${type}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </>
            )}
          </div>
          {!connected && <p className="text-xs text-slate-500">{t('s7.client.hint')}</p>}
          <ErrorBanner error={error} onClose={() => setError(null)} />
        </div>
      </Card>

      <Card
        id="s7.client.cpu"
        title={t('s7.client.cpu')}
        className="shrink-0"
        actions={
          <>
            <CpuBadge state={connected ? status.cpuState : null} />
            <Button size="sm" disabled={!connected || busy} onClick={() => run(s7Api.client.identify)}>
              <Fingerprint className="size-3.5" /> {t('s7.client.identify')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {connected && identity && Object.keys(identity).length ? (
            <table className="w-full text-sm">
              <tbody>
                {IDENTITY_FIELDS.filter((key) => identity[key]).map((key) => (
                  <tr key={key} className="border-t border-ink-800 first:border-t-0">
                    <td className="w-56 py-1.5 pr-3 text-slate-400">{t(`s7.identity.${key}`)}</td>
                    <td className="py-1.5 font-mono text-[13px] text-sulfur-300 select-text">{identity[key]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-slate-500">{t('s7.client.identifyHint')}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={!connected || busy} onClick={() => run(s7Api.client.cpuState)}>
              <RefreshCw className="size-3.5" /> {t('s7.client.readState')}
            </Button>
            <ConfirmButton
              size="sm"
              disabled={!connected || busy}
              confirmLabel={t('s7.client.confirm')}
              onConfirm={() => run(() => s7Api.client.startCpu('hot'))}
            >
              <Power className="size-3.5" /> {t('s7.client.hotStart')}
            </ConfirmButton>
            <ConfirmButton
              size="sm"
              disabled={!connected || busy}
              confirmLabel={t('s7.client.confirm')}
              onConfirm={() => run(() => s7Api.client.startCpu('cold'))}
            >
              <Power className="size-3.5" /> {t('s7.client.coldStart')}
            </ConfirmButton>
            <ConfirmButton
              size="sm"
              disabled={!connected || busy}
              confirmLabel={t('s7.client.confirm')}
              onConfirm={() => run(s7Api.client.stopCpu)}
            >
              <PowerOff className="size-3.5" /> STOP
            </ConfirmButton>
            <span className="text-xs text-slate-500">{t('s7.client.controlHint')}</span>
          </div>
        </div>
      </Card>

      <Card id="s7.client.io" title={t('s7.client.io')} className="shrink-0">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[1.4fr_1fr_0.7fr_1.2fr_auto] items-end gap-3">
            <Field label={t('s7.address')}>
              <Input
                className="font-mono"
                value={op.address}
                placeholder="DB1.DBD0"
                onChange={(e) => changeAddress(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && connected && read()}
              />
            </Field>
            <Field label={t('ui.type')}>
              <Select value={op.dataType} onChange={(e) => updateOp({ dataType: e.target.value })}>
                {Object.keys(DATA_TYPES).map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('s7.stringLength')}>
              <Input
                type="number"
                min={1}
                max={254}
                disabled={op.dataType !== 'String'}
                value={op.length ?? DEFAULT_STRING_LENGTH}
                onChange={(e) => updateOp({ length: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('s7.client.label')}>
              <Input
                value={label}
                placeholder={t('s7.client.labelPlaceholder')}
                onChange={(e) => setLabel(e.target.value)}
              />
            </Field>
            <div className="flex gap-2">
              <Button variant="primary" disabled={!connected || busy} onClick={read}>
                <BookOpen className="size-4" /> {t('ui.read')}
              </Button>
              <Button disabled={busy} onClick={watch} title={t('s7.client.watchHint')}>
                <Eye className="size-4" /> {t('s7.client.watch')}
              </Button>
            </div>
          </div>
          <div className="flex items-end gap-3">
            <Field className="flex-1" label={t('s7.client.writeValue', { type: op.dataType })}>
              <Input
                className="font-mono"
                value={writeValue}
                onChange={(e) => setWriteValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && connected && writeValue !== '' && write()}
              />
            </Field>
            <Button variant="primary" disabled={!connected || busy || writeValue === ''} onClick={write}>
              <Send className="size-4" /> {t('ui.write')}
            </Button>
          </div>
          {result && (
            <div className="flex items-center justify-between rounded-md border border-ink-800 px-3 py-2 text-sm">
              <span className="font-mono">
                <span className="text-slate-400">{result.address}</span>{' '}
                <span className="text-xs text-slate-500">({result.dataType})</span> ={' '}
                <span className="text-sulfur-300 select-text">{formatValue(result.value)}</span>
              </span>
              <span className="flex items-center gap-3 text-xs text-slate-500">
                {formatTime(result.time)}
                <button className="hover:text-slate-200" onClick={() => setResult(null)}>
                  ✕
                </button>
              </span>
            </div>
          )}
        </div>
      </Card>

      <Card id="s7.client.raw" title={t('s7.client.raw')} className="shrink-0" defaultCollapsed>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[1.2fr_0.8fr_1fr_1fr_auto] items-end gap-3">
            <Field label={t('s7.explorer.zone')}>
              <Select value={op.rawArea} onChange={(e) => updateOp({ rawArea: e.target.value })}>
                {['DB', 'I', 'Q', 'M'].map((area) => (
                  <option key={area} value={area}>
                    {area === 'DB' ? t('s7.areas.DB') : t(`s7.areas.${area}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('s7.server.dbNumber')}>
              <Input
                type="number"
                min={1}
                disabled={op.rawArea !== 'DB'}
                value={op.rawDb}
                onChange={(e) => updateOp({ rawDb: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('s7.explorer.start')}>
              <Input
                type="number"
                min={0}
                value={op.rawStart}
                onChange={(e) => updateOp({ rawStart: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('s7.client.byteCount')}>
              <Input
                type="number"
                min={1}
                max={65536}
                value={op.rawCount}
                onChange={(e) => updateOp({ rawCount: Number(e.target.value) })}
              />
            </Field>
            <Button variant="primary" disabled={!connected || busy} onClick={readRaw}>
              <BookOpen className="size-4" /> {t('ui.read')}
            </Button>
          </div>
          <div className="flex items-end gap-3">
            <Field className="flex-1" label={t('s7.client.writeBytes')}>
              <Input
                className="font-mono"
                placeholder="01 02 FF"
                value={writeBytes}
                onChange={(e) => setWriteBytes(e.target.value)}
              />
            </Field>
            <Button variant="primary" disabled={!connected || busy || !writeBytes.trim()} onClick={writeRaw}>
              <Send className="size-4" /> {t('ui.write')}
            </Button>
          </div>
          {raw && (
            <div className="rounded-md border border-ink-800">
              <div className="flex items-center justify-between border-b border-ink-800 px-3 py-1.5 text-xs text-slate-400">
                {t('s7.client.rawHeader', {
                  zone: zoneLabel(raw.area, raw.db),
                  from: raw.start,
                  to: raw.start + raw.bytes.length - 1,
                  time: formatTime(raw.time)
                })}
                <button className="text-slate-500 hover:text-slate-200" onClick={() => setRaw(null)}>
                  ✕
                </button>
              </div>
              <div className="max-h-72 overflow-auto p-3 font-mono text-xs">
                {Array.from({ length: Math.ceil(raw.bytes.length / 16) }, (_, row) => {
                  const slice = raw.bytes.slice(row * 16, row * 16 + 16)
                  return (
                    <div key={row} className="flex gap-4">
                      <span className="w-14 shrink-0 text-slate-500">{raw.start + row * 16}</span>
                      <span className="text-slate-200 select-text">{slice.map(hex).join(' ')}</span>
                      <span className="text-slate-500 select-text">
                        {slice.map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('')}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card
        id="s7.client.watch"
        title={t('ui.monitoring', { count: status.watches?.length ?? 0 })}
        className="min-h-48 shrink-0"
        actions={
          <label className="flex items-center gap-2 text-xs text-slate-400">
            {t('s7.client.pollEvery')}
            <CommitInput
              type="number"
              min={50}
              className="h-7! w-20!"
              value={status.pollInterval ?? DEFAULT_CLIENT_CONFIG.pollInterval}
              onCommit={(value) => run(() => s7Api.client.setPollInterval(Number(value)))}
            />
            ms
          </label>
        }
      >
        {status.watches?.length ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="pb-2 font-medium">{t('s7.address')}</th>
                <th className="pb-2 font-medium">{t('ui.type')}</th>
                <th className="pb-2 font-medium">{t('ui.value')}</th>
                <th className="pb-2 font-medium">{t('ui.write')}</th>
                <th className="pb-2 font-medium">{t('ui.timestamp')}</th>
                <th />
              </tr>
            </thead>
            <tbody className="font-mono text-[13px]">
              {status.watches.map((w) => {
                const d = live[w.id]
                return (
                  <tr key={w.id} className="border-t border-ink-800">
                    <td className="py-1.5 pr-3 text-slate-300">
                      {w.address} {w.label && <span className="font-sans text-xs text-slate-500">{w.label}</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-slate-400">
                      {w.dataType}
                      {w.dataType === 'String' ? `[${w.length}]` : ''}
                    </td>
                    <td
                      className={`py-1.5 pr-3 tabular-nums ${d?.error ? 'font-sans text-xs text-red-300' : 'text-sulfur-300'}`}
                    >
                      {d ? (d.error ?? formatValue(d.value)) : '—'}
                    </td>
                    <td className="w-36 py-1.5 pr-3">
                      <CommitInput
                        className="h-7! font-mono"
                        disabled={!connected}
                        value=""
                        placeholder={w.dataType === 'Bool' ? 'true / false' : ''}
                        onCommit={(value) =>
                          value !== '' && run(() => s7Api.client.writeValue(w.address, w.dataType, value, w.length))
                        }
                      />
                    </td>
                    <td className="py-1.5 pr-3 text-slate-400 tabular-nums">{formatTime(d?.time)}</td>
                    <td className="py-1.5 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        title={t('ui.remove2')}
                        onClick={() => run(() => s7Api.client.removeWatch(w.id))}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-500">{t('s7.client.noWatch')}</p>
        )}
      </Card>
    </div>
  )
}
