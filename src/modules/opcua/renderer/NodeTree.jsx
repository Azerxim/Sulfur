import { useState } from 'react'
import { Box, ChevronRight, Folder, FunctionSquare, Tag, Type } from 'lucide-react'
import { opcuaApi } from './api'

const icons = {
  Object: Folder,
  Variable: Tag,
  Method: FunctionSquare,
  ObjectType: Type,
  VariableType: Type,
  DataType: Type
}

function TreeNode({ node, depth, selectedId, onSelect }) {
  const [open, setOpen] = useState(false)
  const [children, setChildren] = useState(null)
  const [loading, setLoading] = useState(false)
  const Icon = icons[node.nodeClass] ?? Box
  const leaf = children !== null && children.length === 0

  async function toggle() {
    if (!open && children === null) {
      setLoading(true)
      try {
        setChildren(await opcuaApi.client.browse(node.nodeId))
      } catch {
        setChildren([])
      } finally {
        setLoading(false)
      }
    }
    setOpen((o) => !o)
  }

  return (
    <li>
      <div
        className={`flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-sm ${
          selectedId === node.nodeId ? 'bg-sulfur-400/15 text-sulfur-200' : 'text-slate-300 hover:bg-ink-800'
        }`}
        style={{ paddingLeft: depth * 14 + 4 }}
        onClick={() => onSelect(node)}
        onDoubleClick={toggle}
      >
        <button
          className={`grid size-4 place-items-center text-slate-500 ${leaf ? 'invisible' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            toggle()
          }}
        >
          <ChevronRight
            className={`size-3.5 transition-transform ${open ? 'rotate-90' : ''} ${loading ? 'animate-pulse' : ''}`}
          />
        </button>
        <Icon className={`size-3.5 shrink-0 ${node.nodeClass === 'Variable' ? 'text-sulfur-400' : 'text-slate-500'}`} />
        <span className="truncate">{node.displayName}</span>
      </div>
      {open && children?.length > 0 && (
        <ul>
          {children.map((c) => (
            <TreeNode key={c.nodeId} node={c} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  )
}

export default function NodeTree({ roots, selectedId, onSelect }) {
  return (
    <ul className="font-mono text-[13px]">
      {roots.map((n) => (
        <TreeNode key={n.nodeId} node={n} depth={0} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </ul>
  )
}
