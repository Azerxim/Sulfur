import { useCallback, useEffect, useRef } from 'react'
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './flows.css'
import { NODE_CATEGORIES, NODE_TYPES, createNode, createWire } from '../shared/flows'
import FlowNode, { CATEGORY_STYLES, NODE_ICONS } from './FlowNode'
import { t } from '../shared/i18n'

const nodeTypes = { sulfur: FlowNode }
const DRAG_TYPE = 'application/sulfur-node'
/** Décalage pour centrer un nœud déposé sous le curseur (moitié de sa taille). */
const DROP_OFFSET = { x: 88, y: 18 }

/** Palette : types de nœuds par famille, à glisser sur le canevas ou à ajouter d'un clic. */
function Palette({ onAdd }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto border-r border-ink-800 p-2">
      {NODE_CATEGORIES.map((category) => (
        <div key={category} className="mb-2">
          <div className="px-1 py-1 text-[11px] font-medium tracking-wide text-slate-500 uppercase">
            {t(`simulator.categories.${category}`)}
          </div>
          {Object.entries(NODE_TYPES)
            .filter(([, def]) => def.category === category)
            .map(([type]) => {
              const Icon = NODE_ICONS[type]
              return (
                <button
                  key={type}
                  type="button"
                  draggable
                  title={t(`simulator.nodeHints.${type}`)}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_TYPE, type)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onClick={() => onAdd(type)}
                  className="mb-1 flex w-full cursor-grab items-center overflow-hidden rounded border border-ink-700 bg-ink-850 text-left text-xs text-slate-300 hover:border-ink-600 hover:text-slate-100 active:cursor-grabbing"
                >
                  <span className={`grid size-6 shrink-0 place-items-center ${CATEGORY_STYLES[category]}`}>
                    <Icon className="size-3.5" />
                  </span>
                  <span className="truncate px-2">{t(`simulator.nodes.${type}`)}</span>
                </button>
              )
            })}
        </div>
      ))}
    </div>
  )
}

/**
 * Canevas d'un flux. Les nœuds affichés gardent leur état propre à React Flow (taille mesurée,
 * sélection, déplacement en cours) ; le flux n'est modifié qu'aux actions terminées (fin du
 * déplacement, connexion, suppression).
 */
function Canvas({ flow, onChange, statuses, injectable, onInject, selectedId, onSelect, labelOf }) {
  const { screenToFlowPosition } = useReactFlow()
  const wrapper = useRef(null)
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  useEffect(() => {
    setNodes((prev) => {
      const byId = new Map(prev.map((n) => [n.id, n]))
      return flow.nodes.map((node) => {
        const current = byId.get(node.id)
        return {
          ...current,
          id: node.id,
          type: 'sulfur',
          // Nœud en cours de déplacement : sa position reste celle de React Flow.
          position: current?.dragging ? current.position : { x: node.x, y: node.y },
          data: {
            node,
            label: labelOf(node),
            status: statuses[node.id],
            onInject: node.type === 'inject' && injectable.has(node.id) ? () => onInject(node.id) : undefined
          }
        }
      })
    })
  }, [flow.nodes, statuses, injectable, onInject, labelOf, setNodes])

  useEffect(() => {
    setEdges((prev) => {
      const byId = new Map(prev.map((e) => [e.id, e]))
      return flow.wires.map((wire) => ({
        ...byId.get(wire.id),
        id: wire.id,
        source: wire.source,
        sourceHandle: String(wire.port ?? 0),
        target: wire.target
      }))
    })
  }, [flow.wires, setEdges])

  // Sélection demandée de l'extérieur (clic sur un message de débogage).
  useEffect(() => {
    if (!selectedId) return
    setNodes((prev) =>
      prev.some((n) => n.id === selectedId && !n.selected)
        ? prev.map((n) => ({ ...n, selected: n.id === selectedId }))
        : prev
    )
  }, [selectedId, setNodes])

  const add = useCallback(
    (type, position) => {
      const node = createNode(type, Math.round(position.x / 10) * 10, Math.round(position.y / 10) * 10)
      onChange((f) => ({ ...f, nodes: [...f.nodes, node] }))
      onSelect(node.id)
    },
    [onChange, onSelect]
  )

  const onSelectionChange = useCallback(({ nodes: selection }) => onSelect(selection[0]?.id ?? null), [onSelect])

  const addAtCenter = (type) => {
    const rect = wrapper.current.getBoundingClientRect()
    const center = screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
    add(type, { x: center.x - DROP_OFFSET.x, y: center.y - DROP_OFFSET.y })
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[11rem_minmax(0,1fr)]">
      <Palette onAdd={addAtCenter} />
      <div
        ref={wrapper}
        className="sulfur-flow min-h-0"
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
        }}
        onDrop={(e) => {
          const type = e.dataTransfer.getData(DRAG_TYPE)
          if (!NODE_TYPES[type]) return
          e.preventDefault()
          const p = screenToFlowPosition({ x: e.clientX, y: e.clientY })
          add(type, { x: p.x - DROP_OFFSET.x, y: p.y - DROP_OFFSET.y })
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={(_e, _node, dragged) => {
            const moved = new Map(dragged.map((n) => [n.id, n.position]))
            onChange((f) => ({
              ...f,
              nodes: f.nodes.map((n) => (moved.has(n.id) ? { ...n, x: moved.get(n.id).x, y: moved.get(n.id).y } : n))
            }))
          }}
          onConnect={({ source, sourceHandle, target }) =>
            onChange((f) => {
              const port = Number(sourceHandle ?? 0)
              if (f.wires.some((w) => w.source === source && w.target === target && (w.port ?? 0) === port)) return f
              return { ...f, wires: [...f.wires, createWire(source, target, port)] }
            })
          }
          isValidConnection={(c) => c.source !== c.target}
          onNodesDelete={(deleted) => {
            const ids = new Set(deleted.map((n) => n.id))
            onChange((f) => ({
              ...f,
              nodes: f.nodes.filter((n) => !ids.has(n.id)),
              wires: f.wires.filter((w) => !ids.has(w.source) && !ids.has(w.target))
            }))
          }}
          onEdgesDelete={(deleted) => {
            const ids = new Set(deleted.map((e) => e.id))
            onChange((f) => ({ ...f, wires: f.wires.filter((w) => !ids.has(w.id)) }))
          }}
          onSelectionChange={onSelectionChange}
          deleteKeyCode={['Delete', 'Backspace']}
          snapToGrid
          snapGrid={[10, 10]}
          fitView
          fitViewOptions={{ minZoom: 0.7, maxZoom: 1.2, padding: 0.2 }}
          minZoom={0.2}
          maxZoom={2}
        >
          <Background gap={20} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  )
}

/** Éditeur d'un flux : palette et canevas (un canevas neuf par flux, cadré sur ses nœuds). */
export default function FlowEditor(props) {
  return (
    <ReactFlowProvider key={props.flow.id}>
      <Canvas {...props} />
    </ReactFlowProvider>
  )
}
