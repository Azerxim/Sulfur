import { useEffect, useRef, useState } from 'react'
import { Copy, Play, Plus, Square, Trash2 } from 'lucide-react'
import { Button, Card, ErrorBanner, Field, Input, Select, StatusDot } from '@renderer/components/ui'
import { DATA_TYPES, DEFAULT_SERVER_CONFIG, SIMULATIONS } from '../shared/constants'
import { opcuaApi } from './api'
import ServerSecurity, { isSecurityValid } from './ServerSecurity'

/** Délai avant d'envoyer au serveur les paramètres modifiés pendant qu'il tourne. */
const LIVE_DEBOUNCE = 300

function uniqueName(variables) {
  const names = new Set(variables.map((v) => v.name))
  let i = variables.length + 1
  while (names.has(`Variable${i}`)) i++
  return `Variable${i}`
}

const newVariable = (variables) => ({
  id: crypto.randomUUID(),
  name: uniqueName(variables),
  dataType: 'Double',
  initialValue: 0,
  simulation: 'none',
  period: 1000,
  min: 0,
  max: 100,
  writable: true
})

const formatValue = (v) => {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number' && !Number.isInteger(v)) return v.toFixed(3)
  return String(v)
}

/** Champ texte qui ne valide qu'à la sortie du champ ou sur Entrée (Échap annule). */
function CommitInput({ value, onCommit, className = '', ...props }) {
  const [draft, setDraft] = useState(String(value))
  const [editing, setEditing] = useState(false)
  // Ne pas écraser la saisie en cours quand la valeur change (ex : valeur en direct).
  useEffect(() => {
    if (!editing) setDraft(String(value))
  }, [value, editing])
  const commit = () => {
    setEditing(false)
    if (draft !== String(value)) onCommit(draft)
  }
  return (
    <Input
      {...props}
      className={className}
      value={draft}
      onFocus={() => setEditing(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') setDraft(String(value))
      }}
    />
  )
}

/** Valeur courante d'une variable, affichée en direct et modifiable pendant que le serveur tourne. */
function LiveValue({ variable, value, onSet }) {
  if (variable.dataType === 'Boolean') {
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
    opcuaApi.server.values().then(setValues)
    return opcuaApi.server.onValues(setValues)
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

  /** Modification structurelle : en cas de refus, on se recale sur l'état réel du serveur. */
  const liveSync = (action) =>
    action().catch(async (err) => {
      setError(err.message)
      const current = await opcuaApi.server.status()
      if (current.config) setConfig(current.config)
    })

  /** Envoie la variable au serveur (immédiatement ou après un court délai). */
  function push(variable, immediate) {
    clearTimeout(timers.current[variable.id])
    const send = () => liveSync(() => opcuaApi.server.upsertVariable(variable))
    if (immediate) send()
    else timers.current[variable.id] = setTimeout(send, LIVE_DEBOUNCE)
  }

  const update = (patch) => setConfig((c) => ({ ...c, ...patch }))

  function updateVar(id, patch, { immediate = false } = {}) {
    const next = { ...config.variables.find((v) => v.id === id), ...patch }
    setConfig((c) => ({ ...c, variables: c.variables.map((v) => (v.id === id ? next : v)) }))
    if (running) push(next, immediate)
  }

  function addVar() {
    const v = newVariable(config.variables)
    setConfig((c) => ({ ...c, variables: [...c.variables, v] }))
    if (running) push(v, true)
  }

  function removeVar(id) {
    clearTimeout(timers.current[id])
    setConfig((c) => ({ ...c, variables: c.variables.filter((v) => v.id !== id) }))
    if (running) liveSync(() => opcuaApi.server.removeVariable(id))
  }

  const setValue = (id, raw) => live(() => opcuaApi.server.setValue(id, raw))

  const duplicates = config.variables.map((v) => v.name).filter((n, i, all) => all.indexOf(n) !== i)
  const invalid =
    duplicates.length > 0 || config.variables.some((v) => !v.name.trim()) || !isSecurityValid(config.security)

  const headers = ['Nom', 'Type', running ? 'Valeur courante' : 'Valeur initiale', 'Simulation', 'Période (ms)', 'Min', 'Max', 'Écriture', '']

  return (
    <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-2">
      <Card
        title="Configuration du serveur"
        className="shrink-0"
        actions={
          <>
            <StatusDot on={running} label={running ? `En marche · ${status.sessions ?? 0} session(s)` : 'Arrêté'} />
            {running ? (
              <Button variant="danger" size="sm" disabled={busy} onClick={() => run(opcuaApi.server.stop)}>
                <Square className="size-3.5" /> Arrêter
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                disabled={busy || invalid}
                onClick={() => run(() => opcuaApi.server.start(config))}
              >
                <Play className="size-3.5" /> {busy ? 'Démarrage…' : 'Démarrer'}
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-4 gap-4">
            <Field label="Port">
              <Input
                type="number"
                value={config.port}
                disabled={running || busy}
                onChange={(e) => update({ port: Number(e.target.value) })}
              />
            </Field>
            <Field label="Chemin de ressource">
              <Input
                value={config.resourcePath}
                disabled={running || busy}
                onChange={(e) => update({ resourcePath: e.target.value })}
              />
            </Field>
            <Field label="Dossier racine">
              <Input
                value={config.rootFolder}
                disabled={running || busy}
                onChange={(e) => update({ rootFolder: e.target.value })}
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
                  if (running) live(() => opcuaApi.server.setUpdateRate(Number(raw)))
                }}
              />
            </Field>
          </div>

          {status.endpointUrl && (
            <div className="flex items-center gap-2 rounded-md bg-ink-950 px-3 py-2 font-mono text-sm text-sulfur-300">
              {status.endpointUrl}
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto"
                title="Copier"
                onClick={() => navigator.clipboard.writeText(status.endpointUrl)}
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
          )}
          <ErrorBanner error={error} onClose={() => setError(null)} />
        </div>
      </Card>

      <ServerSecurity value={config.security} locked={running || busy} onChange={(security) => update({ security })} />

      <Card
        title={`Variables simulées (${config.variables.length})`}
        className="min-h-72 flex-1"
        actions={
          <>
            {running && <span className="text-xs text-slate-500">Modifications appliquées en direct</span>}
            <Button size="sm" disabled={busy} onClick={addVar}>
              <Plus className="size-3.5" /> Ajouter
            </Button>
          </>
        }
      >
        <div className="overflow-auto">
          <table className="w-full text-sm">
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
              {config.variables.map((v) => (
                <tr key={v.id} className="align-middle">
                  <td className="p-1.5">
                    <CommitInput
                      value={v.name}
                      disabled={busy}
                      title={running ? 'Renommer recrée le nœud (son NodeId change)' : undefined}
                      className={duplicates.includes(v.name) || !v.name.trim() ? 'border-red-500/60' : ''}
                      onCommit={(name) => updateVar(v.id, { name: name.trim() }, { immediate: true })}
                    />
                  </td>
                  <td className="p-1.5">
                    <Select
                      value={v.dataType}
                      disabled={busy}
                      title={running ? 'Changer le type recrée le nœud' : undefined}
                      onChange={(e) => updateVar(v.id, { dataType: e.target.value }, { immediate: true })}
                    >
                      {DATA_TYPES.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </Select>
                  </td>
                  <td className="w-36 p-1.5">
                    {running ? (
                      <LiveValue variable={v} value={values[v.id]} onSet={(raw) => setValue(v.id, raw)} />
                    ) : (
                      <Input
                        value={String(v.initialValue)}
                        disabled={busy}
                        onChange={(e) => updateVar(v.id, { initialValue: e.target.value })}
                      />
                    )}
                  </td>
                  <td className="p-1.5">
                    <Select
                      value={v.simulation}
                      disabled={busy}
                      onChange={(e) => updateVar(v.id, { simulation: e.target.value }, { immediate: true })}
                    >
                      {Object.entries(SIMULATIONS).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </td>
                  {['period', 'min', 'max'].map((key) => (
                    <td key={key} className="w-28 p-1.5">
                      <Input
                        type="number"
                        value={v[key]}
                        disabled={busy || v.simulation === 'none'}
                        onChange={(e) => updateVar(v.id, { [key]: Number(e.target.value) })}
                      />
                    </td>
                  ))}
                  <td className="p-1.5 text-center">
                    <input
                      type="checkbox"
                      className="size-4 accent-sulfur-400"
                      checked={v.writable}
                      disabled={busy}
                      onChange={(e) => updateVar(v.id, { writable: e.target.checked }, { immediate: true })}
                    />
                  </td>
                  <td className="p-1.5">
                    <Button variant="ghost" size="icon" disabled={busy} onClick={() => removeVar(v.id)} title="Supprimer">
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
