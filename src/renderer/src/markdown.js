/**
 * Markdown des notes de release GitHub converti en arbre simple, rendu ensuite en éléments React
 * (components/Markdown.jsx) : aucun HTML n'est injecté dans la page.
 *
 * Blocs : { type: 'heading', level, inline } | { type: 'paragraph', inline } | { type: 'rule' }
 *   | { type: 'code', text } | { type: 'quote', blocks } | { type: 'table', header, rows }
 *   | { type: 'list', ordered, items: [{ inline, children: [bloc] }] }
 * En ligne : { type: 'text' | 'code', text } | { type: 'strong' | 'em', children }
 *   | { type: 'link', href, children }
 */

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/
const FENCE = /^\s*(```|~~~)/
const QUOTE = /^\s{0,3}>\s?/
const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

const indentOf = (line) => line.match(/^\s*/)[0].replace(/\t/g, '    ').length
const startsBlock = (line, next) =>
  HEADING.test(line) ||
  RULE.test(line) ||
  FENCE.test(line) ||
  QUOTE.test(line) ||
  ITEM.test(line) ||
  isTable(line, next)
const isTable = (line, next) => /^\s*\|/.test(line) && TABLE_SEPARATOR.test(next ?? '')
const cells = (line) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => parseInline(cell.trim()))

/** Liste à partir de la ligne `start` : éléments de même retrait, sous-listes plus en retrait. */
function parseList(lines, start) {
  const first = lines[start].match(ITEM)
  const base = indentOf(first[1])
  const ordered = /\d/.test(first[2])
  const items = []
  let i = start
  while (i < lines.length) {
    const line = lines[i]
    const item = line.match(ITEM)
    if (item && indentOf(item[1]) === base && /\d/.test(item[2]) === ordered) {
      items.push({ text: item[3], sub: [] })
      i++
    } else if (line.trim() && indentOf(line) > base && items.length) {
      // Sous-liste ou suite du texte de l'élément précédent.
      const current = items.at(-1)
      if (ITEM.test(line) || current.sub.length) current.sub.push(line)
      else current.text += ` ${line.trim()}`
      i++
    } else if (!line.trim() && ITEM.test(lines[i + 1] ?? '') && indentOf(lines[i + 1]) >= base) {
      i++ // ligne vide entre deux éléments
    } else {
      break
    }
  }
  return {
    block: {
      type: 'list',
      ordered,
      items: items.map(({ text, sub }) => ({ inline: parseInline(text), children: sub.length ? parseBlocks(sub) : [] }))
    },
    next: i
  }
}

export function parseBlocks(input) {
  const lines = Array.isArray(input)
    ? input
    : String(input ?? '')
        .replace(/\r\n?/g, '\n')
        .split('\n')
  const blocks = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    if (FENCE.test(line)) {
      const fence = line.trim().slice(0, 3)
      const code = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith(fence)) code.push(lines[i++])
      blocks.push({ type: 'code', text: code.join('\n') })
      i++
      continue
    }
    const heading = line.match(HEADING)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, inline: parseInline(heading[2]) })
      i++
      continue
    }
    if (RULE.test(line)) {
      blocks.push({ type: 'rule' })
      i++
      continue
    }
    if (QUOTE.test(line)) {
      const quoted = []
      while (i < lines.length && QUOTE.test(lines[i])) quoted.push(lines[i++].replace(QUOTE, ''))
      blocks.push({ type: 'quote', blocks: parseBlocks(quoted) })
      continue
    }
    if (isTable(line, lines[i + 1])) {
      const header = cells(line)
      const rows = []
      i += 2
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++]))
      blocks.push({ type: 'table', header, rows })
      continue
    }
    if (ITEM.test(line)) {
      const { block, next } = parseList(lines, i)
      blocks.push(block)
      i = next
      continue
    }
    const text = [line.trim()]
    i++
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i], lines[i + 1])) text.push(lines[i++].trim())
    blocks.push({ type: 'paragraph', inline: parseInline(text.join(' ')) })
  }
  return blocks
}

/** Motifs en ligne, essayés à chaque position (le plus proche l'emporte, puis l'ordre ci-dessous). */
const INLINE = [
  { type: 'code', re: /`([^`]+)`/ },
  { type: 'link', re: /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/ },
  { type: 'autolink', re: /https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"]/ },
  { type: 'strong', re: /\*\*(?=\S)([\s\S]*?\S)\*\*|__(?=\S)([\s\S]*?\S)__/ },
  { type: 'em', re: /\*(?=[^\s*])([^*]*?[^\s*])\*|(?<![\w])_(?=\S)([^_]*?\S)_(?![\w])/ }
]

export function parseInline(text) {
  const nodes = []
  let rest = String(text ?? '')
  const pushText = (value) => {
    if (!value) return
    const last = nodes.at(-1)
    if (last?.type === 'text') last.text += value
    else nodes.push({ type: 'text', text: value })
  }
  while (rest) {
    let best = null
    for (const pattern of INLINE) {
      const m = pattern.re.exec(rest)
      if (m && (!best || m.index < best.m.index)) best = { pattern, m }
    }
    if (!best) {
      pushText(rest)
      break
    }
    const { pattern, m } = best
    pushText(rest.slice(0, m.index))
    if (pattern.type === 'code') nodes.push({ type: 'code', text: m[1] })
    else if (pattern.type === 'link') nodes.push({ type: 'link', href: m[2], children: parseInline(m[1]) })
    else if (pattern.type === 'autolink')
      nodes.push({ type: 'link', href: m[0], children: [{ type: 'text', text: m[0] }] })
    else nodes.push({ type: pattern.type, children: parseInline(m[1] ?? m[2]) })
    rest = rest.slice(m.index + m[0].length)
  }
  return nodes
}

/** Langue d'un titre de section de release : « 🇬🇧 English », « 🇫🇷 Français », « … (français) ». */
function headingLanguage(text) {
  if (/\b(english|anglais)\b/i.test(text)) return 'en'
  if (/fran[çc]ais|\bfrench\b/i.test(text)) return 'fr'
  return null
}

/**
 * Partie d'une note de release dans la langue `lang`. Les notes de Sulfur ont une section par
 * langue (titre « 🇬🇧 English », « 🇫🇷 Français »…) ; le titre principal (« # Sulfur 0.3.1 ») est
 * retiré. Sans section pour cette langue : le texte placé avant la première section de langue,
 * sinon la section anglaise, sinon la note entière.
 */
export function releaseSection(body, lang) {
  const lines = String(body ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
  const marks = []
  let fenced = false
  lines.forEach((line, index) => {
    if (FENCE.test(line)) fenced = !fenced
    const heading = !fenced && line.match(HEADING)
    const language = heading && headingLanguage(heading[2])
    if (language) marks.push({ index, language })
  })
  const slice = (from, to) => lines.slice(from, to).join('\n')
  const after = (mark) => {
    const next = marks.find((m) => m.index > mark.index)
    return slice(mark.index + 1, next?.index)
  }
  const withoutTitle = (text) => text.replace(/^\s*#\s+Sulfur\b[^\n]*\n/i, '')
  // Séparateurs (---) placés entre deux sections de langue : retirés en fin de section.
  const clean = (text) =>
    text
      .trim()
      .replace(/(\n\s*([-*_])(\s*\2){2,}\s*)+$/, '')
      .trim()
  const own = marks.find((m) => m.language === lang)
  if (own) return clean(after(own))
  const before = clean(withoutTitle(slice(0, marks[0]?.index)))
  if (before) return before
  const english = marks.find((m) => m.language === 'en')
  return clean(english ? after(english) : withoutTitle(lines.join('\n')))
}
