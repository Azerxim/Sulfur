import { describe, expect, it } from 'vitest'
import { parseBlocks, parseInline, releaseSection } from '../src/renderer/src/markdown'
import { createReleaseNotes } from '../src/main/releases'
import { errorOf } from './helpers'

describe('Markdown des notes de release', () => {
  it('lit le texte en ligne', () => {
    expect(
      parseInline('**Linux**: run `chmod +x`, see [notes](https://example.com/a) or https://github.com/x.')
    ).toEqual([
      { type: 'strong', children: [{ type: 'text', text: 'Linux' }] },
      { type: 'text', text: ': run ' },
      { type: 'code', text: 'chmod +x' },
      { type: 'text', text: ', see ' },
      { type: 'link', href: 'https://example.com/a', children: [{ type: 'text', text: 'notes' }] },
      { type: 'text', text: ' or ' },
      { type: 'link', href: 'https://github.com/x', children: [{ type: 'text', text: 'https://github.com/x' }] },
      { type: 'text', text: '.' }
    ])
    expect(parseInline('open by right-click → *Open*, keep snake_case_name')).toEqual([
      { type: 'text', text: 'open by right-click → ' },
      { type: 'em', children: [{ type: 'text', text: 'Open' }] },
      { type: 'text', text: ', keep snake_case_name' }
    ])
    // Un lien javascript: n'est pas reconnu comme lien.
    expect(parseInline('[x](javascript:alert(1))')).toEqual([{ type: 'text', text: '[x](javascript:alert(1))' }])
  })

  it('lit les blocs : titres, listes imbriquées, tableau, citation, code', () => {
    const blocks = parseBlocks(`### Fixes\r
- **Linux**: icon\r
  shown in the menu\r
  - nested\r
- second\r
\r
| System | File |\r
|--------|------|\r
| Windows | \`Setup.exe\` |\r
\r
> Not signed:\r
> right-click\r
\r
\`\`\`\r
xattr -cr Sulfur.app\r
\`\`\`\r
Plain\r
text`)
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'list', 'table', 'quote', 'code', 'paragraph'])
    expect(blocks[1].items).toHaveLength(2)
    expect(blocks[1].items[0].inline.at(-1)).toEqual({ type: 'text', text: ': icon shown in the menu' })
    expect(blocks[1].items[0].children[0]).toMatchObject({ type: 'list', items: [{ inline: [{ text: 'nested' }] }] })
    expect(blocks[2].rows[0][1]).toEqual([{ type: 'code', text: 'Setup.exe' }])
    expect(blocks[3].blocks).toEqual([
      { type: 'paragraph', inline: [{ type: 'text', text: 'Not signed: right-click' }] }
    ])
    expect(blocks[4]).toEqual({ type: 'code', text: 'xattr -cr Sulfur.app' })
    expect(blocks[5]).toEqual({ type: 'paragraph', inline: [{ type: 'text', text: 'Plain text' }] })
  })
})

describe('Section de la langue de l’interface', () => {
  const bilingual = `# Sulfur 0.3.1

## 🇬🇧 English

Linux packaging fixes.

### Fixes
- icon

---

## 🇫🇷 Français

Corrections du paquet Linux.

### Corrections
- icône
`
  // Format de la 0.1.0 : anglais d'abord, puis un titre « (français) ».
  const first = `# Sulfur v0.1.0\r\n\r\nFirst public release.\r\n\r\n## Features\r\n\r\n# Sulfur v0.1.0 (français)\r\n\r\nPremière version.`

  it('prend la section de la langue', () => {
    expect(releaseSection(bilingual, 'fr')).toBe('Corrections du paquet Linux.\n\n### Corrections\n- icône')
    expect(releaseSection(bilingual, 'en')).toBe('Linux packaging fixes.\n\n### Fixes\n- icon')
    expect(releaseSection(first, 'fr')).toBe('Première version.')
    expect(releaseSection(first, 'en')).toBe('First public release.\n\n## Features')
  })

  it('revient à l’anglais ou à la note entière', () => {
    expect(releaseSection(bilingual, 'de')).toBe('Linux packaging fixes.\n\n### Fixes\n- icon')
    expect(releaseSection('# Sulfur 1.0.0\n\nOnly text.', 'fr')).toBe('Only text.')
    expect(releaseSection('', 'fr')).toBe('')
  })
})

describe('Releases GitHub', () => {
  const RELEASES = [
    { tag_name: 'v0.5.0-beta.1', prerelease: true, body: 'beta' },
    { tag_name: 'v0.4.0', name: 'v0.4.0', draft: true, body: 'draft' },
    {
      tag_name: 'v0.3.1',
      name: 'v0.3.1',
      published_at: '2026-10-19T14:01:34Z',
      html_url: 'https://x/v0.3.1',
      body: 'notes'
    },
    { tag_name: 'v0.3.0', name: '', html_url: 'https://x/v0.3.0', body: null }
  ]

  /** Faux fetch : réponses successives, appels comptés. */
  function fakeFetch(...responses) {
    const fn = async (url, options) => {
      fn.calls.push({ url, options })
      const next = responses.shift()
      if (next instanceof Error) throw next
      return { ok: next.status === 200, status: next.status, json: async () => next.body }
    }
    fn.calls = []
    return fn
  }

  it('garde les releases publiées et les met en cache', async () => {
    const fetchImpl = fakeFetch({ status: 200, body: RELEASES }, { status: 200, body: [] })
    const releases = createReleaseNotes(fetchImpl)
    expect(await releases()).toEqual([
      { version: '0.3.1', name: 'v0.3.1', publishedAt: '2026-10-19T14:01:34Z', url: 'https://x/v0.3.1', body: 'notes' },
      { version: '0.3.0', name: 'v0.3.0', publishedAt: undefined, url: 'https://x/v0.3.0', body: '' }
    ])
    expect(fetchImpl.calls[0].url).toBe('https://api.github.com/repos/Azerxim/Sulfur/releases?per_page=20')
    expect(await releases()).toHaveLength(2)
    expect(fetchImpl.calls).toHaveLength(1)
    expect(await releases({ refresh: true })).toEqual([])
    expect(fetchImpl.calls).toHaveLength(2)
  })

  it('signale GitHub injoignable ou la limite de requêtes', async () => {
    const releases = createReleaseNotes(fakeFetch(new Error('getaddrinfo ENOTFOUND'), { status: 403 }, { status: 500 }))
    expect(await errorOf(releases())).toBe('The GitHub releases could not be read: getaddrinfo ENOTFOUND')
    expect(await errorOf(releases())).toBe('GitHub temporarily limits the requests: try again later.')
    expect(await errorOf(releases())).toBe('The GitHub releases could not be read: HTTP 500')
  })
})
