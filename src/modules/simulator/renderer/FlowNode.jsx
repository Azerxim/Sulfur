import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Braces,
  Bug,
  Eye,
  Funnel,
  Hash,
  MousePointerClick,
  Scaling,
  Split,
  Timer,
  TrendingUp,
  TriangleAlert
} from 'lucide-react'
import { NODE_TYPES, nodeOutputs } from '../shared/flows'
import { t } from '../shared/i18n'

export const NODE_ICONS = {
  inject: MousePointerClick,
  watch: Eye,
  read: ArrowDownToLine,
  write: ArrowUpFromLine,
  delay: Timer,
  ramp: TrendingUp,
  fault: TriangleAlert,
  switch: Split,
  scale: Scaling,
  counter: Hash,
  filter: Funnel,
  function: Braces,
  generator: Activity,
  debug: Bug
}

/** Couleur d'une famille de nœuds (classes complètes, pour Tailwind). */
export const CATEGORY_STYLES = {
  triggers: 'bg-sky-500/20 text-sky-300',
  points: 'bg-emerald-500/20 text-emerald-300',
  timing: 'bg-amber-500/20 text-amber-300',
  logic: 'bg-violet-500/20 text-violet-300',
  function: 'bg-orange-500/20 text-orange-300',
  generators: 'bg-pink-500/20 text-pink-300',
  output: 'bg-slate-500/20 text-slate-300'
}

const STATUS_DOTS = {
  green: 'bg-emerald-400',
  red: 'bg-red-400',
  blue: 'bg-sky-400',
  yellow: 'bg-amber-400',
  grey: 'bg-slate-500'
}

/** Hauteur d'un nœud : une ligne, ou de quoi espacer ses sorties. */
const ROW = 18
export const nodeHeight = (outputs) => Math.max(36, outputs * ROW + 8)

/** Libellé d'un nœud : son nom, sinon un résumé de sa configuration. */
export function nodeLabel(node, { points = [], faults = [] } = {}) {
  if (node.name) return node.name
  const c = { ...NODE_TYPES[node.type]?.defaults, ...node.config }
  const point = () => points.find((p) => p.key === c.point)?.name ?? (c.point || '?')
  const type = t(`simulator.nodes.${node.type}`)
  switch (node.type) {
    case 'inject': {
      const payload = c.payloadType === 'timestamp' ? t('simulator.payloadTypes.timestamp') : c.payload
      const label = payload === '' ? type : String(payload)
      return Number(c.repeat) > 0 ? `${label} ↻ ${c.repeat} s` : label
    }
    case 'watch':
    case 'read':
      return point()
    case 'write':
      return c.source === 'fixed'
        ? `${point()} = ${typeof c.value === 'object' ? JSON.stringify(c.value) : c.value}`
        : point()
    case 'delay':
      return `${c.duration} s`
    case 'ramp':
      return `${point()} → ${c.to === '' ? 'msg' : c.to} (${c.duration} s)`
    case 'fault': {
      const name = faults.find((f) => f.id === c.fault)?.name ?? '?'
      return `${name} : ${t(`simulator.faultActions.${c.action}`)}`
    }
    case 'switch':
      return `msg.${c.property || 'payload'}`
    case 'scale':
      return `${c.inMin}…${c.inMax} → ${c.outMin}…${c.outMax}`
    case 'generator':
      return `${t(`simulator.simulations.${c.simulation}`)} ${c.min}…${c.max}`
    case 'debug':
      return c.property === 'msg' ? 'msg' : `msg.${c.property || 'payload'}`
    default:
      return type
  }
}

/**
 * Nœud de l'éditeur : icône de sa famille, libellé, entrée à gauche, sorties à droite et statut
 * publié par le process principal en dessous. Un déclencheur déployé a un bouton pour l'activer.
 */
function FlowNode({ data, selected }) {
  const { node, label, status, onInject } = data
  const def = NODE_TYPES[node.type]
  const Icon = NODE_ICONS[node.type] ?? Braces
  const outputs = nodeOutputs(node)
  const height = nodeHeight(outputs)

  return (
    <div className="relative">
      {onInject && (
        <button
          type="button"
          title={t('simulator.editor.trigger')}
          className="nodrag absolute top-1/2 -left-5 h-6 w-4 -translate-y-1/2 rounded-l border border-r-0 border-ink-600 bg-sky-500/30 hover:bg-sky-500/60"
          onClick={(e) => {
            e.stopPropagation()
            onInject()
          }}
        />
      )}
      <div
        style={{ height }}
        title={t(`simulator.nodes.${node.type}`)}
        className={`flex w-44 items-stretch overflow-hidden rounded-md border bg-ink-850 text-xs shadow-sm ${
          selected ? 'border-sulfur-400 ring-1 ring-sulfur-400/60' : 'border-ink-600'
        } ${node.disabled ? 'opacity-50' : ''}`}
      >
        <div className={`grid w-7 shrink-0 place-items-center ${CATEGORY_STYLES[def?.category] ?? ''}`}>
          <Icon className="size-3.5" />
        </div>
        <div className="flex min-w-0 flex-1 items-center px-2 text-slate-200">
          <span className="truncate">{label}</span>
        </div>
      </div>

      {def?.inputs > 0 && (
        <Handle type="target" position={Position.Left} className="size-2.5! border-ink-600! bg-ink-700!" />
      )}
      {Array.from({ length: outputs }, (_, port) => (
        <Handle
          key={port}
          id={String(port)}
          type="source"
          position={Position.Right}
          style={{ top: outputs > 1 ? 4 + ROW * port + ROW / 2 : '50%' }}
          title={outputs > 1 ? t('simulator.editor.output', { n: port + 1 }) : undefined}
          className="size-2.5! border-ink-600! bg-ink-700!"
        />
      ))}

      {status && (
        <div className="absolute top-full left-0 mt-1 flex max-w-56 items-center gap-1 text-[10px] whitespace-nowrap text-slate-400">
          <span className={`size-1.5 shrink-0 rounded-full ${STATUS_DOTS[status.fill] ?? STATUS_DOTS.grey}`} />
          <span className="truncate">{status.text}</span>
        </div>
      )}
    </div>
  )
}

export default memo(FlowNode)
