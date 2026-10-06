import { useEffect, useState } from 'react'
import { BookOpen, Eye, Lock, Plug, PlugZap, ShieldCheck, Send, X } from 'lucide-react'
import { Button, Card, Checkbox, CommitInput, ErrorBanner, Field, Input, Select, StatusDot } from '@renderer/components/ui'
import CertificatesDialog from '@renderer/components/CertificatesDialog'
import { DATA_TYPES, DEFAULT_CLIENT_CONFIG, TABLES, WORD_ORDERS } from '../shared/constants'
import { decodeValue, encodeValue } from '../shared/codec'
import { certStore, modbusApi } from './api'

const clientCerts = certStore('client')

/** Formats d'affichage des registres : types de données + vues brutes hexadécimale / binaire. */
const FORMATS = {
  UInt16: { words: 1, type: 'UInt16' },
  Int16: { words: 1, type: 'Int16' },
  Hex: { words: 1, type: 'UInt16', show: (w) => `0x${w.toString(16).toUpperCase().padStart(4, '0')}` },
  Binaire: { words: 1, type: 'UInt16', show: (w) => w.toString(2).padStart(16, '0').replace(/(.{4})(?!$)/g, '$1 ') },
  UInt32: { words: 2, type: 'UInt32' },
  Int32: { words: 2, type: 'Int32' },
  Float32: { words: 2, type: 'Float32' },
  Float64: { words: 4, type: 'Float64' }
}

const formatNumber = (v) => (typeof v === 'number' && !Number.isInteger(v) ? Number(v.toPrecision(7)).toString() : String(v))
const formatTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour12: false }) + '.' + iso.slice(20, 23) : '—')
const address = (table, a) => `${TABLES[table].prefix} ${a}`

/** Convertit une saisie en mots 16 bits selon le format choisi (liste séparée par des virgules pour 16 bits). */
function parseWrite(raw, format, wordOrder) {
  const f = FORMATS[format]
  const items = String(raw).split(/[,;\s]+/).filter(Boolean)
  if (!items.length) throw new Error('Saisissez une valeur')
  if (f.words > 1) {
    if (items.length > 1) throw new Error(`${format} : une seule valeur à la fois`)
    return encodeValue(items[0], f.type, wordOrder)
  }
  return items.flatMap((item) => {
    if (format === 'Hex') return [parseInt(item.replace(/^0x/i, ''), 16)]
    if (format === 'Binaire') return [parseInt(item.replace(/^0b/i, ''), 2)]
    return encodeValue(item, f.type)
  }).map((w) => {
    if (!Number.isInteger(w) || w < 0 || w > 0xffff) throw new Error(`Valeur invalide : ${raw}`)
    return w
  })
}

export default function ClientPanel({ status, serverPort, serverMode }) {
  const [config, setConfig] = useState(DEFAULT_CLIENT_CONFIG)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [certsOpen, setCertsOpen] = useState(false)
  const [op, setOp] = useState({ table: 'holdingRegisters', address: 0, quantity: 10, format: 'UInt16', wordOrder: 'ABCD' })
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
        if (!values.length) throw new Error('Saisissez une ou plusieurs valeurs (1/0, true/false)')
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

  const tlsLabel = status.tls ? `${status.tls.protocol} · rôle ${status.tls.role ?? 'aucun'} · serveur ${status.tls.server.commonName}` : null

  return (
    <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-2">
      <Card
        id="modbus.client.connection"
        title="Connexion"
        className="shrink-0"
        actions={<StatusDot on={connected} label={connected ? `Connecté à ${status.endpoint}${tlsLabel ? ' · ' + tlsLabel : ' · non chiffré'}` : 'Déconnecté'} />}
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] items-end gap-3">
            <Field label="Serveur (adresse IP ou nom)">
              <Input
                className="font-mono"
                value={config.host}
                disabled={connected || busy}
                onChange={(e) => update({ host: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && !connected && connect()}
              />
            </Field>
            <Field label="Port">
              <Input type="number" value={config.port} disabled={connected || busy} onChange={(e) => update({ port: Number(e.target.value) })} />
            </Field>
            <Field label="Unit ID">
              <Input
                type="number"
                min={0}
                max={255}
                value={config.unitId}
                disabled={connected || busy}
                onChange={(e) => update({ unitId: Number(e.target.value) })}
              />
            </Field>
            <Field label="Délai de réponse (ms)">
              <Input type="number" value={config.timeout} disabled={connected || busy} onChange={(e) => update({ timeout: Number(e.target.value) })} />
            </Field>
            {connected ? (
              <Button variant="danger" disabled={busy} onClick={() => run(modbusApi.client.disconnect)}>
                <Plug className="size-4" /> Déconnecter
              </Button>
            ) : (
              <Button variant="primary" disabled={busy || !config.host} onClick={connect}>
                <PlugZap className="size-4" /> {busy ? 'Connexion…' : 'Connecter'}
              </Button>
            )}
          </div>

          <div className="grid grid-cols-[2fr_1fr_2fr_auto] items-end gap-3">
            <Field label="Transport">
              <Select value={security.mode} disabled={connected || busy} onChange={(e) => updateSecurity({ mode: e.target.value })}>
                <option value="tcp">Modbus TCP (non chiffré)</option>
                <option value="tls">Modbus/TCP Security (TLS)</option>
              </Select>
            </Field>
            <Field label="Rôle du certificat client">
              <Input
                list="modbus-roles"
                placeholder="aucun"
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
              label="Accepter automatiquement le certificat du serveur"
              disabled={connected || busy || security.mode !== 'tls'}
              checked={security.autoAcceptCertificates}
              onChange={(e) => updateSecurity({ autoAcceptCertificates: e.target.checked })}
            />
            <Button size="sm" className="mb-1" onClick={() => setCertsOpen(true)}>
              <ShieldCheck className="size-3.5" /> Certificats
            </Button>
          </div>
          {security.mode === 'tls' && !connected && (
            <p className="text-xs text-slate-500">
              Le certificat du client est (re)généré automatiquement avec le rôle indiqué ; le serveur décide des droits accordés à ce rôle.
            </p>
          )}
          <ErrorBanner error={error} onClose={() => setError(null)} />
        </div>
      </Card>

      <Card id="modbus.client.io" title="Lecture / écriture" className="shrink-0">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1.4fr_auto] items-end gap-3">
            <Field label="Table">
              <Select value={op.table} onChange={(e) => updateOp({ table: e.target.value, quantity: Math.min(op.quantity, TABLES[e.target.value].max) })}>
                {Object.entries(TABLES).map(([k, t]) => (
                  <option key={k} value={k}>
                    {t.prefix} · {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Adresse">
              <Input type="number" min={0} max={65535} value={op.address} onChange={(e) => updateOp({ address: e.target.value })} />
            </Field>
            <Field label={`Quantité (max ${TABLES[op.table].max})`}>
              <Input type="number" min={1} max={TABLES[op.table].max} value={op.quantity} onChange={(e) => updateOp({ quantity: e.target.value })} />
            </Field>
            <Field label="Format">
              <Select value={bit ? 'Boolean' : op.format} disabled={bit} onChange={(e) => updateOp({ format: e.target.value })}>
                {bit ? <option value="Boolean">Booléen</option> : Object.keys(FORMATS).map((f) => <option key={f}>{f}</option>)}
              </Select>
            </Field>
            <Field label="Ordre des mots">
              <Select value={op.wordOrder} disabled={bit || FORMATS[op.format].words < 2} onChange={(e) => updateOp({ wordOrder: e.target.value })}>
                {Object.entries(WORD_ORDERS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex gap-2">
              <Button variant="primary" disabled={!connected || busy} onClick={read}>
                <BookOpen className="size-4" /> Lire
              </Button>
              <Button disabled={!connected || busy} onClick={watch} title="Ajouter l'adresse à la surveillance">
                <Eye className="size-4" /> Surveiller
              </Button>
            </div>
          </div>

          {TABLES[op.table].writable && (
            <div className="flex items-end gap-3">
              <Field
                className="flex-1"
                label={
                  bit
                    ? 'Valeur(s) à écrire à partir de l\'adresse (ex : 1, 0, 1)'
                    : FORMATS[op.format].words > 1
                      ? `Valeur ${op.format} à écrire (${FORMATS[op.format].words} registres)`
                      : `Valeur(s) ${op.format} à écrire à partir de l'adresse (séparées par des virgules)`
                }
              >
                <Input className="font-mono" value={writeValue} onChange={(e) => setWriteValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && connected && write()} />
              </Field>
              <Button variant="primary" disabled={!connected || busy || !writeValue} onClick={write}>
                <Send className="size-4" /> Écrire
              </Button>
            </div>
          )}

          {result && (
            <div className="rounded-md border border-ink-800">
              <div className="flex items-center justify-between border-b border-ink-800 px-3 py-1.5 text-xs text-slate-400">
                {TABLES[result.table].label} · adresses {result.address} à {result.address + result.data.length - 1} · lu à {formatTime(result.time)}
                <button className="text-slate-500 hover:text-slate-200" onClick={() => setResult(null)}>
                  ✕
                </button>
              </div>
              <div className="max-h-72 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-ink-900 text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-1 font-medium">Adresse</th>
                      <th className="px-3 py-1 font-medium">Valeur</th>
                      <th className="px-3 py-1 font-medium">Brut</th>
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
        title={`Surveillance (${status.watches?.length ?? 0})`}
        className="min-h-48 shrink-0"
        actions={
          <label className="flex items-center gap-2 text-xs text-slate-400">
            Scrutation toutes les
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
                <th className="pb-2 font-medium">Adresse</th>
                <th className="pb-2 font-medium">Type</th>
                <th className="pb-2 font-medium">Valeur</th>
                <th className="pb-2 font-medium">Horodatage</th>
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
                      <Button variant="ghost" size="icon" title="Retirer" onClick={() => run(() => modbusApi.client.removeWatch(w.id))}>
                        <X className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-500">Aucune adresse surveillée. Utilisez « Surveiller » dans la carte Lecture / écriture.</p>
        )}
      </Card>

      {connected && status.tls && (
        <p className="flex shrink-0 items-center gap-1.5 text-xs text-emerald-300/80">
          <Lock className="size-3" /> Canal chiffré {status.tls.protocol} ({status.tls.cipher}) · empreinte du serveur {status.tls.server.thumbprint.slice(0, 16)}…
        </p>
      )}
      {certsOpen && <CertificatesDialog title="Certificats du client Modbus" api={clientCerts} onClose={() => setCertsOpen(false)} />}
    </div>
  )
}
