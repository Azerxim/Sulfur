import { useMemo } from 'react'
import { parseBlocks } from '../markdown'

/** Éléments en ligne ; les liens s'ouvrent dans le navigateur (gestionnaire de la fenêtre). */
function Inline({ nodes }) {
  return nodes.map((node, i) => {
    switch (node.type) {
      case 'code':
        return (
          <code key={i} className="rounded bg-ink-950 px-1 font-mono text-[0.92em] text-slate-200">
            {node.text}
          </code>
        )
      case 'strong':
        return (
          <strong key={i} className="font-semibold text-slate-100">
            <Inline nodes={node.children} />
          </strong>
        )
      case 'em':
        return (
          <em key={i}>
            <Inline nodes={node.children} />
          </em>
        )
      case 'link':
        return (
          <a key={i} href={node.href} target="_blank" rel="noreferrer" className="text-sulfur-300 hover:underline">
            <Inline nodes={node.children} />
          </a>
        )
      default:
        return node.text
    }
  })
}

const HEADING_STYLES = {
  1: 'text-base font-semibold text-slate-100',
  2: 'text-sm font-semibold text-slate-100',
  3: 'text-sm font-medium text-slate-200'
}

function Blocks({ blocks }) {
  return blocks.map((block, i) => {
    switch (block.type) {
      case 'heading': {
        const Tag = `h${Math.min(block.level + 2, 6)}`
        return (
          <Tag key={i} className={`mt-2 first:mt-0 ${HEADING_STYLES[block.level] ?? HEADING_STYLES[3]}`}>
            <Inline nodes={block.inline} />
          </Tag>
        )
      }
      case 'paragraph':
        return (
          <p key={i}>
            <Inline nodes={block.inline} />
          </p>
        )
      case 'list': {
        const Tag = block.ordered ? 'ol' : 'ul'
        return (
          <Tag key={i} className={`flex flex-col gap-0.5 pl-5 ${block.ordered ? 'list-decimal' : 'list-disc'}`}>
            {block.items.map((item, j) => (
              <li key={j}>
                <Inline nodes={item.inline} />
                {item.children.length > 0 && (
                  <div className="mt-0.5 flex flex-col gap-1">
                    <Blocks blocks={item.children} />
                  </div>
                )}
              </li>
            ))}
          </Tag>
        )
      }
      case 'quote':
        return (
          <blockquote key={i} className="flex flex-col gap-1 border-l-2 border-ink-700 pl-3 text-slate-400">
            <Blocks blocks={block.blocks} />
          </blockquote>
        )
      case 'code':
        return (
          <pre key={i} className="overflow-auto rounded-md bg-ink-950 px-3 py-2 font-mono text-xs text-slate-200">
            {block.text}
          </pre>
        )
      case 'table':
        return (
          <table key={i} className="text-left text-xs">
            <thead className="text-slate-400">
              <tr>
                {block.header.map((cell, j) => (
                  <th key={j} className="pr-4 pb-1 font-medium">
                    <Inline nodes={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, j) => (
                <tr key={j} className="border-t border-ink-800">
                  {row.map((cell, k) => (
                    <td key={k} className="py-1 pr-4">
                      <Inline nodes={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )
      case 'rule':
        return <hr key={i} className="border-ink-800" />
      default:
        return null
    }
  })
}

/** Texte Markdown (notes de release) affiché sans HTML injecté. */
export default function Markdown({ text, className = '' }) {
  const blocks = useMemo(() => parseBlocks(text), [text])
  return (
    <div className={`flex flex-col gap-2 text-sm leading-relaxed text-slate-300 select-text ${className}`}>
      <Blocks blocks={blocks} />
    </div>
  )
}
