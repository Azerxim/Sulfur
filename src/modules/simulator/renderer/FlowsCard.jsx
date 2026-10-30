import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bug,
  Circle,
  Copy,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  Rocket,
  SlidersHorizontal,
  Square,
  Trash2
} from 'lucide-react'
import { Button, Checkbox, CommitInput, Field, useStoredState } from '@azerxim/sulfur-sdk/ui'
import { getLocale } from '@azerxim/sulfur-sdk'
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

/** Onglets du panneau latéral et leur icône (panneau réduit). */
const SIDE_TABS = [
  ['properties', SlidersHorizontal],
  ['debug', Bug]
]

const SIDE_KEY = 'sulfur:simulator:sideWidth'
const SIDE_DEFAULT = 320
const SIDE_MIN = 256
/** Largeur du panneau latéral réduit (colonne d'icônes). */
const SIDE_COLLAPSED = 44
/** Largeur minimale laissée à l'éditeur de flux. */
const EDITOR_MIN = 320

/**
 * Largeur du panneau latéral (propriétés / débogage), réglable en tirant sa bordure gauche et
 * mémorisée localement (sans effet si le stockage est indisponible).
 */
function useSideWidth(containerRef) {
  const [width, setWidth] = useState(() => {
    try {
      return Number(localStorage.getItem(SIDE_KEY)) || SIDE_DEFAULT
    } catch {
      return SIDE_DEFAULT
    }
  })

  const startResize = (e) => {
    e.preventDefault()
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    const startX = e.clientX
    const startWidth = width
    const max = Math.max(SIDE_MIN, (containerRef.current?.clientWidth ?? 0) - EDITOR_MIN)
    let next = startWidth
    const onMove = (ev) => {
      next = Math.round(Math.min(max, Math.max(SIDE_MIN, startWidth + startX - ev.clientX)))
      setWidth(next)
    }
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      handle.removeEventListener('pointercancel', onUp)
      try {
        localStorage.setItem(SIDE_KEY, String(next))
      } catch {
        // stockage indisponible : la largeur n'est simplement pas mémorisée
      }
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
    handle.addEventListener('pointercancel', onUp)
  }

  const reset = () => {
    setWidth(SIDE_DEFAULT)
    try {
      localStorage.removeItem(SIDE_KEY)
    } catch {
      // stockage indisponible
    }
  }

  return { width, startResize, reset }
}

/**
 * Plein écran de l'élément `ref` (éditeur de flux et sa barre d'outils) : état suivi par
 * l'événement `fullscreenchange`, quitté par Échap ou par le même bouton.
 */
function useFullscreen(ref, onError) {
  const [fullscreen, setFullscreen] = useState(false)
  useEffect(() => {
    const onChange = () => setFullscreen(!!ref.current && document.fullscreenElement === ref.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [ref])
  const toggle = () =>
    (fullscreen ? document.exitFullscreen() : ref.current?.requestFullscreen())?.catch((err) => onError(err.message))
  return [fullscreen, toggle]
}

/**
 * Flux de nœuds, à la manière de Node-RED : chaque onglet est un flux ; « Déployer » envoie tous les
 * flux au process principal, où ils tournent en continu (et sont relancés au démarrage).
 */
export default function FlowsCard({ flows, onChange, faults, points, status, onError }) {
  const { state, setState, statuses, debug, setDebug } = useFlowRuntime()
  const [currentId, setCurrentId] = useStoredState('sulfur:simulator:flow', flows[0]?.id ?? null)
  const [selectedId, setSelectedId] = useState(null)
  const [side, setSide] = useState('properties')
  // Panneau latéral réduit ou non, mémorisé localement.
  const [sideMode, setSideMode] = useStoredState('sulfur:simulator:side', 'open', ['open', 'collapsed'])
  const sideCollapsed = sideMode === 'collapsed'
  const openSide = (tab) => {
    setSide(tab)
    setSideMode('open')
  }
  const [onlyCurrent, setOnlyCurrent] = useState(false)
  const [recordKeys, setRecordKeys] = useState([])
  const rootRef = useRef(null)
  const editorRef = useRef(null)
  const sideWidth = useSideWidth(editorRef)
  const [fullscreen, toggleFullscreen] = useFullscreen(rootRef, onError)
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

  const selectFromDebug = useCallback(
    (flowId, nodeId) => {
      setCurrentId(flowId)
      setSelectedId(nodeId)
      setSide('properties')
      setSideMode('open')
    },
    [setCurrentId, setSideMode]
  )

  const stateLabel = dirty
    ? t('simulator.flows.undeployed')
    : state.running
      ? t('simulator.flows.running')
      : t('simulator.flows.stopped')

  return (
    <div ref={rootRef} className="flex min-h-[480px] flex-1 flex-col bg-ink-950">
      {/* Barre d'outils : flux (onglets), enregistrement en cours, état, déploiement, plein écran. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-800 bg-ink-900 px-3 py-1.5">
        <div role="tablist" className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {flows.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={f.id === flow?.id}
              onClick={() => {
                setCurrentId(f.id)
                setSelectedId(null)
              }}
              className={`h-7 rounded-md px-2.5 text-sm transition-colors ${
                f.id === flow?.id
                  ? 'bg-ink-850 font-medium text-slate-100 ring-1 ring-ink-800'
                  : 'text-slate-400 hover:bg-ink-850 hover:text-slate-200'
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

        {recording && (
          <span className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs whitespace-nowrap text-red-300 tabular-nums">
              <span className="size-2 animate-pulse rounded-full bg-red-400" />
              {t('simulator.flows.recording', { count: recording.count })}
            </span>
            <Button variant="danger" size="sm" onClick={stopRecording}>
              <Square className="size-3.5" /> {t('simulator.flows.stopRecording')}
            </Button>
          </span>
        )}
        <span
          className={`inline-flex items-center gap-1.5 text-xs ${dirty ? 'text-amber-300' : state.running ? 'text-emerald-300' : 'text-slate-500'}`}
        >
          <span
            className={`size-2 rounded-full ${dirty ? 'bg-amber-400' : state.running ? 'bg-emerald-400' : 'border-[1.5px] border-slate-600'}`}
          />
          {stateLabel}
        </span>
        {state.running ? (
          <Button variant="danger" size="sm" onClick={() => call(async () => setState(await simulatorApi.stopFlows()))}>
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
        <Button
          variant="ghost"
          size="icon"
          title={t(fullscreen ? 'simulator.flows.exitFullscreen' : 'simulator.flows.fullscreen')}
          aria-pressed={fullscreen}
          onClick={toggleFullscreen}
        >
          {fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        </Button>
      </div>

      {flow ? (
        <div
          ref={editorRef}
          className="grid min-h-0 flex-1 overflow-hidden"
          style={{ gridTemplateColumns: `minmax(0,1fr) ${sideCollapsed ? SIDE_COLLAPSED : sideWidth.width}px` }}
        >
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
          {sideCollapsed ? (
            <div className="flex min-h-0 flex-col items-center gap-1 border-l border-ink-800 bg-ink-900 py-1.5">
              <button
                type="button"
                title={t('simulator.editor.expandSide')}
                aria-label={t('simulator.editor.expandSide')}
                onClick={() => setSideMode('open')}
                className="mb-1 grid size-7 place-items-center rounded text-slate-400 hover:bg-ink-850 hover:text-slate-200"
              >
                <PanelRightOpen className="size-4" />
              </button>
              {SIDE_TABS.map(([tab, Icon]) => (
                <button
                  key={tab}
                  type="button"
                  title={t(`simulator.editor.${tab}`)}
                  aria-label={t(`simulator.editor.${tab}`)}
                  onClick={() => openSide(tab)}
                  className="relative grid size-7 place-items-center rounded text-slate-400 hover:bg-ink-850 hover:text-slate-200"
                >
                  <Icon className="size-4" />
                  {tab === 'debug' && debug.length > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-4 rounded-full bg-sulfur-400 px-1 font-mono text-[9px] leading-4 text-on-accent">
                      {debug.length > 99 ? '99+' : debug.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="relative flex min-h-0 flex-col border-l border-ink-800 bg-ink-900">
              <div
                role="separator"
                aria-orientation="vertical"
                title={t('simulator.editor.resize')}
                onPointerDown={sideWidth.startResize}
                onDoubleClick={sideWidth.reset}
                className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize transition-colors hover:bg-sulfur-400/40 active:bg-sulfur-400/60"
              />
              <div role="tablist" className="flex border-b border-ink-800 px-1 text-xs">
                {['properties', 'debug'].map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={side === tab}
                    onClick={() => setSide(tab)}
                    className={`-mb-px flex-1 border-b-2 px-3 py-2 transition-colors ${
                      side === tab
                        ? 'border-sulfur-400 font-medium text-slate-100'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {t(`simulator.editor.${tab}`)}
                    {tab === 'debug' && debug.length > 0 && (
                      <span className="ml-1 text-slate-500">({debug.length})</span>
                    )}
                  </button>
                ))}
                <button
                  type="button"
                  title={t('simulator.editor.collapseSide')}
                  aria-label={t('simulator.editor.collapseSide')}
                  onClick={() => setSideMode('collapsed')}
                  className="grid size-7 shrink-0 place-items-center self-center rounded text-slate-400 hover:bg-ink-850 hover:text-slate-200"
                >
                  <PanelRightClose className="size-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1">
                {side === 'debug' ? (
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
                ) : selected ? (
                  <div className="h-full overflow-auto p-3">
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
                  </div>
                ) : (
                  // Aucun nœud sélectionné : réglages du flux affiché, enregistrement de points, aide.
                  <div className="flex h-full flex-col gap-4 overflow-auto p-3">
                    <section className="flex flex-col gap-2.5">
                      <h3 className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                        {t('simulator.flows.flowTitle')}
                      </h3>
                      <Field label={t('ui.name')}>
                        <CommitInput value={flow.name} onCommit={(name) => updateFlow((f) => ({ ...f, name }))} />
                      </Field>
                      <div className="flex items-center gap-1">
                        <Checkbox
                          className="mr-auto"
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
                      </div>
                    </section>

                    <section className="flex flex-col gap-2.5 border-t border-ink-800 pt-4">
                      <h3 className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                        {t('simulator.flows.recordPoints')}
                      </h3>
                      <p className="text-xs text-slate-500">{t('simulator.flows.recordHint')}</p>
                      <PointsPicker
                        points={points}
                        value={recording ? recording.keys : recordKeys}
                        disabled={!!recording}
                        emptyLabel="—"
                        onChange={setRecordKeys}
                      />
                      {!recording && (
                        <Button
                          size="sm"
                          className="self-start"
                          disabled={!recordKeys.length}
                          onClick={() => call(() => simulatorApi.startRecording(recordKeys))}
                        >
                          <Circle className="size-3.5 text-red-400" /> {t('simulator.flows.record')}
                        </Button>
                      )}
                    </section>

                    <section className="flex flex-col gap-1.5 border-t border-ink-800 pt-4 text-xs text-slate-500">
                      <p>{t('simulator.editor.noSelection')}</p>
                      <p>{t('simulator.flows.hint')}</p>
                    </section>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="p-4 text-sm text-slate-500">{t('simulator.flows.empty')}</p>
      )}
    </div>
  )
}
