import { useEffect, useRef, useState } from 'react'
import { Copy, Lock, Play, Plus, Square, Trash2 } from 'lucide-react'
import { Button, Card, Checkbox, CommitInput, ErrorBanner, Field, Input, Select, StatusDot } from '@renderer/components/ui'
import { DATA_TYPES, DEFAULT_SERVER_CONFIG, REGISTER_TYPES, SIMULATIONS, TABLES, WORD_ORDERS } from '../shared/constants'
import { pointSize } from '../shared/codec'
import { modbusApi } from './api'
import ServerSecurity, { securityProblems } from './ServerSecurity'
import ServerActivity from './ServerActivity'

/** Délai avant d'envoyer au serveur les paramètres modifiés pendant qu'il tourne. */
const LIVE_DEBOUNCE = 300

/** Ports standards : 502 (Modbus TCP) / 802 (Modbus/TCP Security), et leurs équivalents sans droits admin. */
const PORT_SWAP = { tcp: { 802: 502, 8020: 5020 }, tls: { 502: 802, 5020: 8020 } }

const formatValue = (v) => {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number' && !Number.isInteger(v)) return Number(v.toFixed(4)).toString()
  return String(v)
}

/** Première adresse libre de la table après les points existants. */
function nextAddress(points, table) {
  return points.filter((p) => p.table === table).reduce((max, p) => Math.max(max, p.address + pointSize(p.dataType)), 0)
}

function newPoint(points) {
  const names = new Set(points.map((p) => p.name))
  let i = points.length + 1
  while (names.has(`Point${i}`)) i++
  return {
    id: crypto.randomUUID(),
    name: `Point${i}`,
    table: 'holdingRegisters',
    address: nextAddress(points, 'holdingRegisters'),
    dataType: 'UInt16',
    initialValue: 0,
    simulation: 'none',
    period: 1000,
    min: 0,
    max: 100,
    writable: true
  }
}

const overlap = (a, b) =>
  a.id !== b.id && a.table === b.table && a.address < b.address + pointSize(b.dataType) && b.address < a.address + pointSize(a.dataType)

function LiveValue({ point, value, onSet }) {
  if (point.dataType === 'Boolean') {
    return (
      <button
        onClick={() => onSet(!value)}
        title="Basculer"
        className={`h-9 w-full rounded-md border font-mono text-sm transition-colors ${
          value ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-ink-700 bg-ink-950 text-slate-400'
        }`}
      >
        {formatValue(value)}
      </button>
    )
  }
  return <CommitInput className="font-mono text-sulfur-300" value={formatValue(value)} onCommit={onSet} />
}

export default function ServerPanel({ status }) {
  const [config, setConfig] = useState(status.config ?? DEFAULT_SERVER_CONFIG)
  const [values, setValues] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const timers = useRef({})
  const running = status.running

  // Le serveur est la source de vérité quand il tourne : on reprend sa configuration au démarrage.
  useEffect(() => {
    if (running && status.config) setConfig(status.config)
    if (!running) setValues({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  useEffect(() => {
    modbusApi.server.values().then(setValues)
    return modbusApi.server.onValues(setValues)
  }, [])

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

  const live = (action) => action().catch((err) => setError(err.message))
  const liveSync = (action) =>
    action().catch(async (err) => {
      setError(err.message)
      const current = await modbusApi.server.status()
      if (current.config) setConfig(current.config)
    })

  function push(point, immediate) {
    clearTimeout(timers.current[point.id])
    const send = () => liveSync(() => modbusApi.server.upsertPoint(point))
    if (immediate) send()
    else timers.current[point.id] = setTimeout(send, LIVE_DEBOUNCE)
  }

  const update = (patch) => setConfig((c) => ({ ...c, ...patch }))

  function updatePoint(id, patch, { immediate = false } = {}) {
    const next = { ...config.points.find((p) => p.id === id), ...patch }
    setConfig((c) => ({ ...c, points: c.points.map((p) => (p.id === id ? next : p)) }))
    if (running) push(next, immediate)
  }

  function changeTable(point, table) {
    const bit = TABLES[table].bit
    const dataType = bit ? 'Boolean' : point.dataType === 'Boolean' ? 'UInt16' : point.dataType
    updatePoint(
      point.id,
      { table, dataType, writable: TABLES[table].writable && point.writable, address: nextAddress(config.points.filter((p) => p.id !== point.id), table) },
      { immediate: true }
    )
  }

  function addPoint() {
    const p = newPoint(config.points)
    setConfig((c) => ({ ...c, points: [...c.points, p] }))
    if (running) push(p, true)
  }

  function removePoint(id) {
    clearTimeout(timers.current[id])
    setConfig((c) => ({ ...c, points: c.points.filter((p) => p.id !== id) }))
    if (running) liveSync(() => modbusApi.server.removePoint(id))
  }

  function setSecurity(security) {
    // Bascule automatiquement le port standard lorsque le transport change.
    const swap = security.mode !== config.security?.mode ? PORT_SWAP[security.mode]?.[config.port] : undefined
    update({ security, ...(swap ? { port: swap } : {}) })
  }

  const names = config.points.map((p) => p.name)
  const duplicates = names.filter((n, i) => names.indexOf(n) !== i)
  const overlapping = new Set(config.points.filter((p) => config.points.some((q) => overlap(p, q))).map((p) => p.id))
  const problems = securityProblems(config.security)
  const invalid = duplicates.length > 0 || overlapping.size > 0 || config.points.some((p) => !p.name.trim()) || problems.length > 0

  const headers = ['Nom', 'Table', 'Adresse', 'Type', running ? 'Valeur courante' : 'Valeur initiale', 'Simulation', 'Période (ms)', 'Min', 'Max', 'Écriture', '']

  return (
    <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-2">
      <Card
        id="modbus.server.config"
        title="Configuration du serveur"
        className="shrink-0"
        actions={
          <>
            <StatusDot
              on={running}
              label={running ? `En marche · ${status.connections?.length ?? 0} connexion(s)` : 'Arrêté'}
            />
            {running ? (
              <Button variant="danger" size="sm" disabled={busy} onClick={() => run(modbusApi.server.stop)}>
                <Square className="size-3.5" /> Arrêter
              </Button>
            ) : (
              <Button variant="primary" size="sm" disabled={busy || invalid} onClick={() => run(() => modbusApi.server.start(config))}>
                <Play className="size-3.5" /> {busy ? 'Démarrage…' : 'Démarrer'}
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-6 gap-4">
            <Field label="Interface d'écoute">
              <Input value={config.host} disabled={running || busy} onChange={(e) => update({ host: e.target.value })} />
            </Field>
            <Field label="Port">
              <Input
                type="number"
                value={config.port}
                disabled={running || busy}
                onChange={(e) => update({ port: Number(e.target.value) })}
              />
            </Field>
            <Field label="Unit ID">
              <Input
                type="number"
                min={0}
                max={255}
                value={config.unitId}
                disabled={running || busy || config.anyUnitId}
                onChange={(e) => update({ unitId: Number(e.target.value) })}
              />
            </Field>
            <Field label="Ordre des mots (32/64 bits)">
              <Select value={config.wordOrder} disabled={running || busy} onChange={(e) => update({ wordOrder: e.target.value })}>
                {Object.entries(WORD_ORDERS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Taille de chaque table">
              <Input
                type="number"
                min={1}
                max={65536}
                value={config.size}
                disabled={running || busy}
                onChange={(e) => update({ size: Number(e.target.value) })}
              />
            </Field>
            <Field label="Période de simulation (ms)">
              <CommitInput
                type="number"
                min={10}
                value={config.updateRate}
                disabled={busy}
                onCommit={(raw) => {
                  update({ updateRate: Number(raw) })
                  if (running) live(() => modbusApi.server.setUpdateRate(Number(raw)))
                }}
              />
            </Field>
          </div>
          <div className="flex items-center gap-6">
            <Checkbox
              label="Répondre à tous les Unit ID"
              disabled={running || busy}
              checked={!!config.anyUnitId}
              onChange={(e) => update({ anyUnitId: e.target.checked })}
            />
            <span className="text-xs text-slate-500">
              Ports standards : 502 (TCP) et 802 (TLS) — droits administrateur requis sous Linux pour les ports &lt; 1024.
            </span>
          </div>

          {status.endpoint && (
            <div className="flex items-center gap-2 rounded-md bg-ink-950 px-3 py-2 font-mono text-sm text-sulfur-300">
              {config.security?.mode === 'tls' && <Lock className="size-3.5 text-emerald-400" />}
              {status.endpoint}
              {status.certificate && (
                <span className="font-sans text-xs text-slate-500">
                  · certificat {status.certificate.commonName} · empreinte {status.certificate.thumbprint.slice(0, 16)}…
                </span>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto"
                title="Copier"
                onClick={() => navigator.clipboard.writeText(status.endpoint)}
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
          )}
          <ErrorBanner error={error} onClose={() => setError(null)} />
        </div>
      </Card>

      <ServerSecurity value={config.security} locked={running || busy} onChange={setSecurity} />

      <Card
        id="modbus.server.points"
        title={`Points simulés (${config.points.length})`}
        className="min-h-72 shrink-0"
        actions={
          <>
            {running && <span className="text-xs text-slate-500">Modifications appliquées en direct</span>}
            <Button size="sm" disabled={busy} onClick={addPoint}>
              <Plus className="size-3.5" /> Ajouter
            </Button>
          </>
        }
      >
        <div className="overflow-auto">
          <table className="w-full min-w-[1150px] text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                {headers.map((h) => (
                  <th key={h} className="px-1.5 pb-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {config.points.map((p) => {
                const bit = TABLES[p.table].bit
                return (
                  <tr key={p.id} className="align-middle">
                    <td className="min-w-36 p-1.5">
                      <CommitInput
                        value={p.name}
                        disabled={busy}
                        className={duplicates.includes(p.name) || !p.name.trim() ? 'border-red-500/60' : ''}
                        onCommit={(name) => updatePoint(p.id, { name: name.trim() }, { immediate: true })}
                      />
                    </td>
                    <td className="w-48 p-1.5">
                      <Select value={p.table} disabled={busy} onChange={(e) => changeTable(p, e.target.value)}>
                        {Object.entries(TABLES).map(([k, t]) => (
                          <option key={k} value={k}>
                            {t.prefix} · {t.label}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="w-24 p-1.5">
                      <CommitInput
                        type="number"
                        min={0}
                        value={p.address}
                        disabled={busy}
                        title={overlapping.has(p.id) ? 'Chevauche un autre point' : `Occupe ${pointSize(p.dataType)} adresse(s)`}
                        className={overlapping.has(p.id) ? 'border-red-500/60' : ''}
                        onCommit={(raw) => updatePoint(p.id, { address: Number(raw) }, { immediate: true })}
                      />
                    </td>
                    <td className="w-36 p-1.5">
                      <Select
                        value={p.dataType}
                        disabled={busy || bit}
                        onChange={(e) => updatePoint(p.id, { dataType: e.target.value }, { immediate: true })}
                      >
                        {(bit ? ['Boolean'] : REGISTER_TYPES).map((t) => (
                          <option key={t} value={t}>
                            {t}
                            {DATA_TYPES[t] > 1 ? ` (${DATA_TYPES[t]} reg.)` : ''}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="w-32 p-1.5">
                      {running ? (
                        <LiveValue point={p} value={values[p.id]} onSet={(raw) => live(() => modbusApi.server.setValue(p.id, raw))} />
                      ) : (
                        <Input
                          value={String(p.initialValue)}
                          disabled={busy}
                          onChange={(e) => updatePoint(p.id, { initialValue: e.target.value })}
                        />
                      )}
                    </td>
                    <td className="w-32 p-1.5">
                      <Select
                        value={p.simulation}
                        disabled={busy}
                        onChange={(e) => updatePoint(p.id, { simulation: e.target.value }, { immediate: true })}
                      >
                        {Object.entries(SIMULATIONS).map(([k, label]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </td>
                    {['period', 'min', 'max'].map((key) => (
                      <td key={key} className="w-24 min-w-20 p-1.5">
                        <Input
                          type="number"
                          value={p[key]}
                          disabled={busy || p.simulation === 'none'}
                          onChange={(e) => updatePoint(p.id, { [key]: Number(e.target.value) })}
                        />
                      </td>
                    ))}
                    <td className="p-1.5 text-center">
                      <input
                        type="checkbox"
                        className="size-4 accent-sulfur-400"
                        title={TABLES[p.table].writable ? 'Autoriser l\'écriture par les clients' : 'Table en lecture seule'}
                        checked={!!p.writable}
                        disabled={busy || !TABLES[p.table].writable}
                        onChange={(e) => updatePoint(p.id, { writable: e.target.checked }, { immediate: true })}
                      />
                    </td>
                    <td className="p-1.5">
                      <Button variant="ghost" size="icon" disabled={busy} onClick={() => removePoint(p.id)} title="Supprimer">
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <ServerActivity status={status} />
    </div>
  )
}
