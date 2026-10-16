import { useCallback, useEffect, useMemo, useState } from 'react'
import { Circle, Copy, Play, Plus, Rocket, Square, Trash2 } from 'lucide-react'
import { Button, Card, Checkbox, CommitInput } from '@renderer/components/ui'
import { getLocale } from '@shared/i18n'
import { DEBUG_LIMIT, createNode, nodeOutputs, stepsToFlow } from '../shared/flows'
import { simulatorApi } from './api'
import DebugPanel from './DebugPanel'
import FlowEditor from './FlowEditor'
import { nodeLabel } from './FlowNode'
import NodeProperties from './NodeProperties'
import { PointsPicker } from './PointPickers'
import { t } from '../shared/i18n'

/** Copie d'un flux avec de nouveaux identifiants (nœuds et fils). */
function cloneFlow(flow, name) {
  const ids = new Map(flow.nodes.map((n) => [n.id, crypto.randomUUID()]))
  return {
    ...structuredClone(flow),
    id: crypto.randomUUID(),
    name,
    nodes: flow.nodes.map((n) => ({ ...structuredClone(n), id: ids.get(n.id) })),
    wires: flow.wires
      .filter((w) => ids.has(w.source) && ids.has(w.target))
      .map((w) => ({ ...w, id: crypto.randomUUID(), source: ids.get(w.source), target: ids.get(w.target) }))
  }
}

function useFlowRuntime() {
  const [state, setState] = useState({ running: false, deployedAt: null, flows: [] })
  const [statuses, setStatuses] = useState({})
  const [debug, setDebug] = useState([])

  useEffect(() => {
    simulatorApi.flowState().then(setState, () => {})
    simulatorApi.nodeStatuses().then(setStatuses, () => {})
    simulatorApi.debugMessages().then(setDebug, () => {})
    const offs = [
      simulatorApi.onFlowState(setState),
      simulatorApi.onNodeStatus((changes) =>
        setStatuses((prev) => {
          if (!changes) return {}
          const next = { ...prev }
          for (const [id, status] of Object.entries(changes)) {
            if (status) next[id] = status
            else delete next[id]
          }
          return next
        })
      ),
      simulatorApi.onDebug((messages) => setDebug((prev) => [...prev, ...messages].slice(-DEBUG_LIMIT)))
    ]
    return () => offs.forEach((off) => off())
  }, [])

  return { state, setState, statuses, debug, setDebug }
}

/**
 * Flux de nœuds, à la manière de Node-RED : chaque onglet est un flux ; « Déployer » envoie tous les
 * flux au process principal, où ils tournent en continu (et sont relancés au démarrage).
 */
export default function FlowsCard({ flows, onChange, faults, points, status, onError }) {
  const { state, setState, statuses, debug, setDebug } = useFlowRuntime()
  const [currentId, setCurrentId] = useState(flows[0]?.id ?? null)
  const [selectedId, setSelectedId] = useState(null)
  const [side, setSide] = useState('properties')
  const [onlyCurrent, setOnlyCurrent] = useState(false)
  const [recordKeys, setRecordKeys] = useState([])
  const recording = status.recording
  const call = useCallback((action) => action().catch((err) => onError(err.message)), [onError])

  const flow = flows.find((f) => f.id === currentId) ?? flows[0] ?? null
  const selected = flow?.nodes.find((n) => n.id === selectedId) ?? null
  const dirty = JSON.stringify(flows) !== JSON.stringify(state.flows)

  // Déclencheurs déployés : leur bouton est actif tant que les flux tournent.
  const injectable = useMemo(
    () =>
      new Set(
        state.running
          ? state.flows
              .filter((f) => !f.disabled)
              .flatMap((f) => f.nodes.filter((n) => n.type === 'inject').map((n) => n.id))
          : []
      ),
    [state]
  )

  const labelOf = useCallback((node) => nodeLabel(node, { points, faults }), [points, faults])
  const onInject = useCallback((id) => call(() => simulatorApi.inject(id)), [call])

  /** Modifie le flux affiché : `update(flow) => flow`. */
  const updateFlow = useCallback(
    (update) => onChange((list) => list.map((f) => (f.id === flow?.id ? update(f) : f))),
    [onChange, flow?.id]
  )

  function updateNode(id, patch) {
    updateFlow((f) => {
      const nodes = f.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n))
      // Sorties supprimées (règles d'un aiguillage, sorties d'une fonction) : leurs fils aussi.
      const node = nodes.find((n) => n.id === id)
      const outputs = nodeOutputs(node)
      return { ...f, nodes, wires: f.wires.filter((w) => w.source !== id || (w.port ?? 0) < outputs) }
    })
  }

  const nextName = (key) => {
    let n = flows.length + 1
    while (flows.some((f) => f.name === t(key, { n }))) n++
    return t(key, { n })
  }

  function addFlow(next) {
    onChange((list) => [...list, next])
    setCurrentId(next.id)
    setSelectedId(null)
  }

  function removeFlow() {
    if (!window.confirm(t('simulator.flows.confirmRemove', { name: flow.name }))) return
    const index = flows.indexOf(flow)
    const rest = flows.filter((f) => f.id !== flow.id)
    onChange(rest)
    setCurrentId(rest[Math.max(0, index - 1)]?.id ?? null)
    setSelectedId(null)
  }

  const stopRecording = () =>
    call(async () => {
      const steps = await simulatorApi.stopRecording()
      const time = new Date().toLocaleTimeString(getLocale(), { hour12: false })
      addFlow(stepsToFlow({ name: t('simulator.flows.recordedName', { time }), steps }))
    })

  const selectFromDebug = useCallback((flowId, nodeId) => {
    setCurrentId(flowId)
    setSelectedId(nodeId)
    setSide('properties')
  }, [])

  const stateLabel = dirty
    ? t('simulator.flows.undeployed')
    : state.running
      ? t('simulator.flows.running')
      : t('simulator.flows.stopped')

  return (
    <Card
      id="simulator.flows"
      title={t('simulator.flows.title', { count: flows.length })}
      className="shrink-0"
      actions={
        <>
          <span
            className={`inline-flex items-center gap-1.5 text-xs ${dirty ? 'text-amber-300' : state.running ? 'text-emerald-300' : 'text-slate-500'}`}
          >
            <span
              className={`size-2 rounded-full ${dirty ? 'bg-amber-400' : state.running ? 'bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400/60' : 'bg-slate-600'}`}
            />
            {stateLabel}
          </span>
          {state.running ? (
            <Button
              variant="danger"
              size="sm"
              onClick={() => call(async () => setState(await simulatorApi.stopFlows()))}
            >
              <Square className="size-3.5" /> {t('simulator.flows.stop')}
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={!state.flows.length}
              title={t('simulator.flows.restartHint')}
              onClick={() => call(async () => setState(await simulatorApi.restartFlows()))}
            >
              <Play className="size-3.5" /> {t('simulator.flows.restart')}
            </Button>
          )}
          <Button
            variant={dirty ? 'primary' : 'secondary'}
            size="sm"
            title={t('simulator.flows.deployHint')}
            onClick={() => call(async () => setState(await simulatorApi.deploy(flows)))}
          >
            <Rocket className="size-3.5" /> {t('simulator.flows.deploy')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-xs text-slate-500">{t('simulator.flows.hint')}</p>

        <div className="flex flex-wrap items-center gap-1 border-b border-ink-800">
          {flows.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setCurrentId(f.id)
                setSelectedId(null)
              }}
              className={`-mb-px rounded-t-md border px-3 py-1.5 text-sm ${
                f.id === flow?.id
                  ? 'border-ink-800 border-b-ink-900 bg-ink-900 text-slate-100'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              } ${f.disabled ? 'italic opacity-60' : ''}`}
            >
              {f.name || '—'}
            </button>
          ))}
          <Button
            variant="ghost"
            size="icon"
            title={t('simulator.flows.add')}
            onClick={() =>
              addFlow({
                id: crypto.randomUUID(),
                name: nextName('simulator.flows.newName'),
                disabled: false,
                nodes: [createNode('inject', 40, 60)],
                wires: []
              })
            }
          >
            <Plus className="size-3.5" />
          </Button>
        </div>

        {flow ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <CommitInput
                className="h-8! w-56!"
                value={flow.name}
                title={t('ui.name')}
                onCommit={(name) => updateFlow((f) => ({ ...f, name }))}
              />
              <Checkbox
                label={t('simulator.flows.disabled')}
                checked={!!flow.disabled}
                onChange={(e) => updateFlow((f) => ({ ...f, disabled: e.target.checked }))}
              />
              <Button
                variant="ghost"
                size="icon"
                title={t('simulator.flows.duplicate')}
                onClick={() => addFlow(cloneFlow(flow, `${flow.name} (2)`))}
              >
                <Copy className="size-3.5" />
              </Button>
              <Button variant="ghost" size="icon" title={t('simulator.flows.remove')} onClick={removeFlow}>
                <Trash2 className="size-3.5" />
              </Button>

              <div className="ml-auto flex min-w-96 items-center gap-2">
                <span className="shrink-0 text-xs text-slate-400">{t('simulator.flows.recordPoints')}</span>
                <div className="min-w-0 flex-1">
                  <PointsPicker
                    points={points}
                    value={recording ? recording.keys : recordKeys}
                    disabled={!!recording}
                    emptyLabel="—"
                    onChange={setRecordKeys}
                  />
                </div>
                {recording ? (
                  <>
                    <span className="flex items-center gap-1.5 text-xs whitespace-nowrap text-red-300 tabular-nums">
                      <span className="size-2 animate-pulse rounded-full bg-red-400" />
                      {t('simulator.flows.recording', { count: recording.count })}
                    </span>
                    <Button variant="danger" size="sm" onClick={stopRecording}>
                      <Square className="size-3.5" /> {t('simulator.flows.stopRecording')}
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    disabled={!recordKeys.length}
                    title={t('simulator.flows.recordHint')}
                    onClick={() => call(() => simulatorApi.startRecording(recordKeys))}
                  >
                    <Circle className="size-3.5 text-red-400" /> {t('simulator.flows.record')}
                  </Button>
                )}
              </div>
            </div>

            <div className="grid h-[70vh] min-h-[480px] grid-cols-[minmax(0,1fr)_20rem] overflow-hidden rounded-md border border-ink-800">
              <FlowEditor
                flow={flow}
                onChange={updateFlow}
                statuses={statuses}
                injectable={injectable}
                onInject={onInject}
                selectedId={selectedId}
                onSelect={setSelectedId}
                labelOf={labelOf}
              />
              <div className="flex min-h-0 flex-col border-l border-ink-800">
                <div className="flex border-b border-ink-800 text-xs">
                  {['properties', 'debug'].map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setSide(tab)}
                      className={`flex-1 px-3 py-2 ${side === tab ? 'bg-ink-850 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      {t(`simulator.editor.${tab}`)}
                      {tab === 'debug' && debug.length > 0 && (
                        <span className="ml-1 text-slate-500">({debug.length})</span>
                      )}
                    </button>
                  ))}
                </div>
                <div className="min-h-0 flex-1">
                  {side === 'properties' ? (
                    <div className="h-full overflow-auto p-3">
                      {selected ? (
                        <NodeProperties
                          key={selected.id}
                          node={selected}
                          points={points}
                          faults={faults}
                          onChange={(patch) => updateNode(selected.id, patch)}
                          onDuplicate={() => {
                            const copy = {
                              ...structuredClone(selected),
                              id: crypto.randomUUID(),
                              x: selected.x + 20,
                              y: selected.y + 60
                            }
                            updateFlow((f) => ({ ...f, nodes: [...f.nodes, copy] }))
                            setSelectedId(copy.id)
                          }}
                          onRemove={() => {
                            updateFlow((f) => ({
                              ...f,
                              nodes: f.nodes.filter((n) => n.id !== selected.id),
                              wires: f.wires.filter((w) => w.source !== selected.id && w.target !== selected.id)
                            }))
                            setSelectedId(null)
                          }}
                        />
                      ) : (
                        <p className="text-xs text-slate-500">{t('simulator.editor.noSelection')}</p>
                      )}
                    </div>
                  ) : (
                    <DebugPanel
                      messages={debug}
                      flows={flows}
                      onlyCurrent={onlyCurrent}
                      onOnlyCurrent={setOnlyCurrent}
                      currentFlowId={flow.id}
                      labelOf={labelOf}
                      onSelect={selectFromDebug}
                      onClear={() => call(async () => setDebug(await simulatorApi.clearDebug()))}
                    />
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500">{t('simulator.flows.empty')}</p>
        )}
      </div>
    </Card>
  )
}
