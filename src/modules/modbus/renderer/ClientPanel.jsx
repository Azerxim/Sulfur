import { useEffect, useState } from 'react'
import { BookOpen, Eye, Lock, Plug, PlugZap, ShieldCheck, Send, X } from 'lucide-react'
import { Button, Card, Checkbox, CommitInput, ErrorBanner, Field, Input, Select, StatusDot } from '@renderer/components/ui'
import CertificatesDialog from '@renderer/components/CertificatesDialog'
import { DATA_TYPES, DEFAULT_CLIENT_CONFIG, DEFAULT_CLIENT_REQUEST, TABLES, WORD_ORDERS } from '../shared/constants'
import { decodeValue, encodeValue } from '../shared/codec'
import { getLocale } from '@shared/i18n'
import { t } from '../shared/i18n'
import { usePersistentState } from '@renderer/module-config'
import { certStore, modbusApi } from './api'

const clientCerts = certStore('client')

/** Formats d'affichage des registres : types de données + vues brutes hexadécimale / binaire. */
const FORMATS = {
  UInt16: { words: 1, type: 'UInt16' },
  Int16: { words: 1, type: 'Int16' },
  Hex: { words: 1, type: 'UInt16', show: (w) => `0x${w.toString(16).toUpperCase().padStart(4, '0')}` },
  binary: { words: 1, type: 'UInt16', show: (w) => w.toString(2).padStart(16, '0').replace(/(.{4})(?!$)/g, '$1 ') },
  UInt32: { words: 2, type: 'UInt32' },
  Int32: { words: 2, type: 'Int32' },
  Float32: { words: 2, type: 'Float32' },
  Float64: { words: 4, type: 'Float64' }
}

const formatNumber = (v) => (typeof v === 'number' && !Number.isInteger(v) ? Number(v.toPrecision(7)).toString() : String(v))
const formatTime = (iso) => (iso ? new Date(iso).toLocaleTimeString(getLocale(), { hour12: false }) + '.' + iso.slice(20, 23) : '—')
const address = (table, a) => `${TABLES[table].prefix} ${a}`

/** Convertit une saisie en mots 16 bits selon le format choisi (liste séparée par des virgules pour 16 bits). */
function parseWrite(raw, format, wordOrder) {
  const f = FORMATS[format]
  const items = String(raw).split(/[,;\s]+/).filter(Boolean)
  if (!items.length) throw new Error(t('modbus.client.errors.enterValue'))
  if (f.words > 1) {
    if (items.length > 1) throw new Error(t('modbus.client.errors.singleValue', { format }))
    return encodeValue(items[0], f.type, wordOrder)
  }
  return items.flatMap((item) => {
    if (format === 'Hex') return [parseInt(item.replace(/^0x/i, ''), 16)]
    if (format === 'binary') return [parseInt(item.replace(/^0b/i, ''), 2)]
    return encodeValue(item, f.type)
  }).map((w) => {
    if (!Number.isInteger(w) || w < 0 || w > 0xffff) throw new Error(t('modbus.client.errors.invalidValue', { value: raw }))
    return w
  })
}

export default function ClientPanel({ status, serverPort, serverMode }) {
  const [config, setConfig] = usePersistentState('modbus', 'client', DEFAULT_CLIENT_CONFIG)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [certsOpen, setCertsOpen] = useState(false)
  const [op, setOp] = usePersistentState('modbus', 'clientRequest', DEFAULT_CLIENT_REQUEST)
  const [result, setResult] = useState(null)
  const [writeValue, setWriteValue] = useState('')
  const [live, setLive] = useState({})
  const connected = status.connected
  const security = config.security
  const bit = TABLES[op.table].bit

  // Aligne le port et le transport sur le serveur local lorsqu'il démarre.
  useEffect(() => {
    if (serverPort && !connected) {
      setConfig((c) => ({ ...c, port: serverPort, security: { ...c.security, mode: serverMode ?? c.security.mode } }))
    }
  }, [serverPort, serverMode, connected])

  useEffect(() => modbusApi.client.onData((d) => setLive((l) => ({ ...l, [d.id]: d }))), [])
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
  const updateSecurity = (patch) => setConfig((c) => ({ ...c, security: { ...c.security, ...patch } }))
  const updateOp = (patch) => setOp((o) => ({ ...o, ...patch }))
  const connect = () => run(() => modbusApi.client.connect(config))

  async function read() {
    const data = await run(() => modbusApi.client.read(op.table, Number(op.address), Number(op.quantity)))
    if (data) setResult({ ...op, address: Number(op.address), data, time: new Date().toISOString() })
  }

  function write() {
    run(async () => {
      if (bit) {
        const values = String(writeValue).split(/[,;\s]+/).filter(Boolean)
        if (!values.length) throw new Error(t('modbus.client.errors.enterBits'))
        await modbusApi.client.write(op.table, Number(op.address), values)
      } else {
        await modbusApi.client.write(op.table, Number(op.address), parseWrite(writeValue, op.format, op.wordOrder))
      }
      await read()
    })
  }

  const watch = () =>
    run(() =>
      modbusApi.client.addWatch({
        table: op.table,
        address: Number(op.address),
        dataType: bit ? 'Boolean' : FORMATS[op.format].type,
        wordOrder: op.wordOrder
      })
    )

  /** Lignes du tableau de résultats, décodées selon le format choisi. */
  function rows() {
    if (!result) return []
    if (TABLES[result.table].bit) return result.data.map((v, i) => ({ address: result.address + i, value: v ? 'true' : 'false', raw: v ? 1 : 0 }))
    const f = FORMATS[result.format]
    const out = []
    for (let i = 0; i + f.words <= result.data.length; i += f.words) {
      const words = result.data.slice(i, i + f.words)
      const value = f.show ? f.show(words[0]) : formatNumber(decodeValue(words, f.type, result.wordOrder))
      out.push({ address: result.address + i, value, raw: words.map((w) => w.toString(16).toUpperCase().padStart(4, '0')).join(' ') })
    }
    return out
  }

  const tlsLabel = status.tls
    ? t('modbus.client.tlsInfo', {
        protocol: status.tls.protocol,
        role: status.tls.role ?? t('modbus.client.noRole'),
        server: status.tls.server.commonName
      })
    : null

  return (
    <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-2">
      <Card
        id="modbus.client.connection"
        title={t('ui.connection')}
        className="shrink-0"
        actions={<StatusDot on={connected} label={
              connected
                ? `${t('modbus.client.connectedTo', { endpoint: status.endpoint })} · ${tlsLabel ?? t('modbus.client.plain')}`
                : t('ui.disconnected')
            } />}
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] items-end gap-3">
            <Field label={t('modbus.client.host')}>
              <Input
                className="font-mono"
                value={config.host}
                disabled={connected || busy}
                onChange={(e) => update({ host: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && !connected && connect()}
              />
            </Field>
            <Field label={t('modbus.server.port')}>
              <Input type="number" value={config.port} disabled={connected || busy} onChange={(e) => update({ port: Number(e.target.value) })} />
            </Field>
            <Field label={t('modbus.server.unitId')}>
              <Input
                type="number"
                min={0}
                max={255}
                value={config.unitId}
                disabled={connected || busy}
                onChange={(e) => update({ unitId: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('modbus.client.timeout')}>
              <Input type="number" value={config.timeout} disabled={connected || busy} onChange={(e) => update({ timeout: Number(e.target.value) })} />
            </Field>
            {connected ? (
              <Button variant="danger" disabled={busy} onClick={() => run(modbusApi.client.disconnect)}>
                <Plug className="size-4" /> {t('ui.disconnect')}
              </Button>
            ) : (
              <Button variant="primary" disabled={busy || !config.host} onClick={connect}>
                <PlugZap className="size-4" /> {busy ? t('ui.connecting') : t('ui.connect')}
              </Button>
            )}
          </div>

          <div className="grid grid-cols-[2fr_1fr_2fr_auto] items-end gap-3">
            <Field label={t('modbus.client.transport')}>
              <Select value={security.mode} disabled={connected || busy} onChange={(e) => updateSecurity({ mode: e.target.value })}>
                <option value="tcp">{t('modbus.transport.tcp')}</option>
                <option value="tls">{t('modbus.transport.tls')}</option>
              </Select>
            </Field>
            <Field label={t('modbus.client.role')}>
              <Input
                list="modbus-roles"
                placeholder={t('modbus.client.rolePlaceholder')}
                value={security.role}
                disabled={connected || busy || security.mode !== 'tls'}
                onChange={(e) => updateSecurity({ role: e.target.value })}
              />
              <datalist id="modbus-roles">
                <option value="Operator" />
                <option value="Viewer" />
              </datalist>
            </Field>
            <Checkbox
              className="mb-2"
              label={t('ui.autoAcceptServerCert')}
              disabled={connected || busy || security.mode !== 'tls'}
              checked={security.autoAcceptCertificates}
              onChange={(e) => updateSecurity({ autoAcceptCertificates: e.target.checked })}
            />
            <Button size="sm" className="mb-1" onClick={() => setCertsOpen(true)}>
              <ShieldCheck className="size-3.5" /> {t('ui.certificates')}
            </Button>
          </div>
          {security.mode === 'tls' && !connected && (
            <p className="text-xs text-slate-500">
              {t('modbus.client.roleHint')}
            </p>
          )}
          <ErrorBanner error={error} onClose={() => setError(null)} />
        </div>
      </Card>

      <Card id="modbus.client.io" title={t('modbus.client.io')} className="shrink-0">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1.4fr_auto] items-end gap-3">
            <Field label={t('modbus.client.table')}>
              <Select value={op.table} onChange={(e) => updateOp({ table: e.target.value, quantity: Math.min(op.quantity, TABLES[e.target.value].max) })}>
                {Object.entries(TABLES).map(([k, tb]) => (
                  <option key={k} value={k}>
                    {tb.prefix} · {tb.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('modbus.client.address')}>
              <Input type="number" min={0} max={65535} value={op.address} onChange={(e) => updateOp({ address: e.target.value })} />
            </Field>
            <Field label={t('modbus.client.quantity', { max: TABLES[op.table].max })}>
              <Input type="number" min={1} max={TABLES[op.table].max} value={op.quantity} onChange={(e) => updateOp({ quantity: e.target.value })} />
            </Field>
            <Field label={t('modbus.client.format')}>
              <Select value={bit ? 'Boolean' : op.format} disabled={bit} onChange={(e) => updateOp({ format: e.target.value })}>
                {bit ? (
                  <option value="Boolean">{t('modbus.client.boolean')}</option>
                ) : (
                  Object.keys(FORMATS).map((f) => (
                    <option key={f} value={f}>
                      {f === 'binary' ? t('modbus.client.binary') : f}
                    </option>
                  ))
                )}
              </Select>
            </Field>
            <Field label={t('modbus.client.wordOrder')}>
              <Select value={op.wordOrder} disabled={bit || FORMATS[op.format].words < 2} onChange={(e) => updateOp({ wordOrder: e.target.value })}>
                {WORD_ORDERS.map((k) => (
                  <option key={k} value={k}>
                    {t(`modbus.wordOrders.${k}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex gap-2">
              <Button variant="primary" disabled={!connected || busy} onClick={read}>
                <BookOpen className="size-4" /> {t('modbus.client.read')}
              </Button>
              <Button disabled={!connected || busy} onClick={watch} title={t('modbus.client.watchHint')}>
                <Eye className="size-4" /> {t('modbus.client.watch')}
              </Button>
            </div>
          </div>

          {TABLES[op.table].writable && (
            <div className="flex items-end gap-3">
              <Field
                className="flex-1"
                label={
                  bit
                    ? t('modbus.client.writeBits')
                    : FORMATS[op.format].words > 1
                      ? t('modbus.client.writeMulti', { format: op.format, count: FORMATS[op.format].words })
                      : t('modbus.client.writeWords', { format: op.format === 'binary' ? t('modbus.client.binary') : op.format })
                }
              >
                <Input className="font-mono" value={writeValue} onChange={(e) => setWriteValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && connected && write()} />
              </Field>
              <Button variant="primary" disabled={!connected || busy || !writeValue} onClick={write}>
                <Send className="size-4" /> {t('modbus.client.write')}
              </Button>
            </div>
          )}

          {result && (
            <div className="rounded-md border border-ink-800">
              <div className="flex items-center justify-between border-b border-ink-800 px-3 py-1.5 text-xs text-slate-400">
                {t('modbus.client.resultHeader', {
                  table: TABLES[result.table].label,
                  from: result.address,
                  to: result.address + result.data.length - 1,
                  time: formatTime(result.time)
                })}
                <button className="text-slate-500 hover:text-slate-200" onClick={() => setResult(null)}>
                  ✕
                </button>
              </div>
              <div className="max-h-72 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-ink-900 text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-1 font-medium">{t('modbus.client.address')}</th>
                      <th className="px-3 py-1 font-medium">{t('ui.value')}</th>
                      <th className="px-3 py-1 font-medium">{t('modbus.client.raw')}</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-[13px]">
                    {rows().map((r) => (
                      <tr key={r.address} className="border-t border-ink-800">
                        <td className="px-3 py-1 text-slate-400">{address(result.table, r.address)}</td>
                        <td className="px-3 py-1 text-sulfur-300 tabular-nums select-text">{r.value}</td>
                        <td className="px-3 py-1 text-slate-500 select-text">{r.raw}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card
        id="modbus.client.watch"
        title={t('ui.monitoring', { count: status.watches?.length ?? 0 })}
        className="min-h-48 shrink-0"
        actions={
          <label className="flex items-center gap-2 text-xs text-slate-400">
            {t('modbus.client.pollEvery')}
            <CommitInput
              type="number"
              min={50}
              className="h-7! w-20!"
              value={status.pollInterval ?? DEFAULT_CLIENT_CONFIG.pollInterval}
              onCommit={(raw) => run(() => modbusApi.client.setPollInterval(Number(raw)))}
            />
            ms
          </label>
        }
      >
        {status.watches?.length ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="pb-2 font-medium">{t('modbus.client.address')}</th>
                <th className="pb-2 font-medium">{t('ui.type')}</th>
                <th className="pb-2 font-medium">{t('ui.value')}</th>
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
                      {address(w.table, w.address)} <span className="font-sans text-xs text-slate-500">{TABLES[w.table].label}</span>
                    </td>
                    <td className="py-1.5 pr-3 text-slate-400">
                      {w.dataType}
                      {DATA_TYPES[w.dataType] > 1 ? ` · ${w.wordOrder}` : ''}
                    </td>
                    <td className={`py-1.5 pr-3 tabular-nums ${d?.error ? 'font-sans text-xs text-red-300' : 'text-sulfur-300'}`}>
                      {d ? (d.error ?? formatNumber(d.value)) : '—'}
                    </td>
                    <td className="py-1.5 pr-3 text-slate-400 tabular-nums">{formatTime(d?.time)}</td>
                    <td className="py-1.5 text-right">
                      <Button variant="ghost" size="icon" title={t('ui.remove2')} onClick={() => run(() => modbusApi.client.removeWatch(w.id))}>
                        <X className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-500">{t('modbus.client.noWatch')}</p>
        )}
      </Card>

      {connected && status.tls && (
        <p className="flex shrink-0 items-center gap-1.5 text-xs text-emerald-300/80">
          <Lock className="size-3" />{' '}
          {t('modbus.client.encrypted', {
            protocol: status.tls.protocol,
            cipher: status.tls.cipher,
            thumbprint: status.tls.server.thumbprint.slice(0, 16)
          })}
        </p>
      )}
      {certsOpen && <CertificatesDialog t={t} title={t('modbus.client.certsTitle')} api={clientCerts} onClose={() => setCertsOpen(false)} />}
    </div>
  )
}
