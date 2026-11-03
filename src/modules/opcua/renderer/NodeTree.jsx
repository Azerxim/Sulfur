import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faChevronRight,
  faCube,
  faFolder,
  faFont,
  faSquareRootVariable,
  faTag
} from '@fortawesome/free-solid-svg-icons'
import { opcuaApi } from './api'

const icons = {
  Object: faFolder,
  Variable: faTag,
  Method: faSquareRootVariable,
  ObjectType: faFont,
  VariableType: faFont,
  DataType: faFont
}

function TreeNode({ node, depth, selectedId, onSelect }) {
  const [open, setOpen] = useState(false)
  const [children, setChildren] = useState(null)
  const [loading, setLoading] = useState(false)
  const icon = icons[node.nodeClass] ?? faCube
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
          <FontAwesomeIcon
            icon={faChevronRight}
            className={`size-3.5 transition-transform ${open ? 'rotate-90' : ''} ${loading ? 'animate-pulse' : ''}`}
          />
        </button>
        <FontAwesomeIcon
          icon={icon}
          className={`size-3.5 shrink-0 ${node.nodeClass === 'Variable' ? 'text-sulfur-400' : 'text-slate-500'}`}
        />
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
