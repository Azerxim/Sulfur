import { useState } from 'react'
import { Copy, Play, Plus, Square, Trash2 } from 'lucide-react'
import { Button, Card, ErrorBanner, Field, Input, Select, StatusDot } from '@renderer/components/ui'
import { DATA_TYPES, DEFAULT_SERVER_CONFIG, SIMULATIONS } from '../shared/constants'
import { opcuaApi } from './api'

const newVariable = (index) => ({
  name: `Variable${index}`,
  dataType: 'Double',
  initialValue: 0,
  simulation: 'none',
  period: 1000,
  min: 0,
  max: 100,
  writable: true
})

export default function ServerPanel({ status }) {
  const [config, setConfig] = useState(status.config ?? DEFAULT_SERVER_CONFIG)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const running = status.running
  const locked = running || busy

  const update = (patch) => setConfig((c) => ({ ...c, ...patch }))
  const updateVar = (i, patch) =>
    setConfig((c) => ({ ...c, variables: c.variables.map((v, j) => (j === i ? { ...v, ...patch } : v)) }))
  const removeVar = (i) => setConfig((c) => ({ ...c, variables: c.variables.filter((_, j) => j !== i) }))
  const addVar = () => setConfig((c) => ({ ...c, variables: [...c.variables, newVariable(c.variables.length + 1)] }))

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

  const duplicates = config.variables.map((v) => v.name).filter((n, i, all) => all.indexOf(n) !== i)
  const invalid = duplicates.length > 0 || config.variables.some((v) => !v.name.trim())

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <Card
        title="Configuration du serveur"
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
                disabled={locked}
                onChange={(e) => update({ port: Number(e.target.value) })}
              />
            </Field>
            <Field label="Chemin de ressource">
              <Input value={config.resourcePath} disabled={locked} onChange={(e) => update({ resourcePath: e.target.value })} />
            </Field>
            <Field label="Dossier racine">
              <Input value={config.rootFolder} disabled={locked} onChange={(e) => update({ rootFolder: e.target.value })} />
            </Field>
            <Field label="Période de simulation (ms)">
              <Input
                type="number"
                min={10}
                value={config.updateRate}
                disabled={locked}
                onChange={(e) => update({ updateRate: Number(e.target.value) })}
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

      <Card
        title={`Variables simulées (${config.variables.length})`}
        className="flex-1"
        actions={
          <Button size="sm" disabled={locked} onClick={addVar}>
            <Plus className="size-3.5" /> Ajouter
          </Button>
        }
      >
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                {['Nom', 'Type', 'Valeur initiale', 'Simulation', 'Période (ms)', 'Min', 'Max', 'Écriture', ''].map((h) => (
                  <th key={h} className="px-1.5 pb-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {config.variables.map((v, i) => (
                <tr key={i} className="align-middle">
                  <td className="p-1.5">
                    <Input
                      value={v.name}
                      disabled={locked}
                      className={duplicates.includes(v.name) || !v.name.trim() ? 'border-red-500/60' : ''}
                      onChange={(e) => updateVar(i, { name: e.target.value })}
                    />
                  </td>
                  <td className="p-1.5">
                    <Select value={v.dataType} disabled={locked} onChange={(e) => updateVar(i, { dataType: e.target.value })}>
                      {DATA_TYPES.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </Select>
                  </td>
                  <td className="p-1.5">
                    <Input
                      value={String(v.initialValue)}
                      disabled={locked}
                      onChange={(e) => updateVar(i, { initialValue: e.target.value })}
                    />
                  </td>
                  <td className="p-1.5">
                    <Select value={v.simulation} disabled={locked} onChange={(e) => updateVar(i, { simulation: e.target.value })}>
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
                        disabled={locked || v.simulation === 'none'}
                        onChange={(e) => updateVar(i, { [key]: Number(e.target.value) })}
                      />
                    </td>
                  ))}
                  <td className="p-1.5 text-center">
                    <input
                      type="checkbox"
                      className="size-4 accent-sulfur-400"
                      checked={v.writable}
                      disabled={locked}
                      onChange={(e) => updateVar(i, { writable: e.target.checked })}
                    />
                  </td>
                  <td className="p-1.5">
                    <Button variant="ghost" size="icon" disabled={locked} onClick={() => removeVar(i)} title="Supprimer">
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
