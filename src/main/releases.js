import { t } from '@azerxim/sulfur-sdk'

const API_URL = 'https://api.github.com/repos/Azerxim/Sulfur/releases?per_page=20'
/** Durée de conservation de la liste (l'API GitHub limite les requêtes anonymes à 60 par heure). */
const CACHE_TTL = 30 * 60 * 1000
const TIMEOUT = 10_000

/** Release publiée réduite à ce qu'affiche l'interface ; `version` sans le « v » du tag. */
export const toRelease = (release) => ({
  version: String(release.tag_name ?? '').replace(/^v/, ''),
  name: release.name || release.tag_name,
  publishedAt: release.published_at,
  url: release.html_url,
  body: release.body ?? ''
})

/**
 * Notes des releases GitHub de Sulfur (brouillons et préversions exclus), de la plus récente à la
 * plus ancienne. Lues dans le process principal (la politique de sécurité de l'interface interdit
 * les requêtes externes) et conservées CACHE_TTL ms. `fetchImpl` : remplaçable dans les tests.
 */
export function createReleaseNotes(fetchImpl = fetch) {
  let cache = null

  return async function releases({ refresh = false } = {}) {
    if (!refresh && cache && Date.now() - cache.time < CACHE_TTL) return cache.releases
    let response
    try {
      response = await fetchImpl(API_URL, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Sulfur' },
        signal: AbortSignal.timeout(TIMEOUT)
      })
    } catch (err) {
      throw new Error(t('settings.updates.notes.unreachable', { message: err.message }), { cause: err })
    }
    if (response.status === 403 || response.status === 429) throw new Error(t('settings.updates.notes.rateLimited'))
    if (!response.ok) throw new Error(t('settings.updates.notes.unreachable', { message: `HTTP ${response.status}` }))
    const list = await response.json()
    const releases = (Array.isArray(list) ? list : []).filter((r) => !r.draft && !r.prerelease).map(toRelease)
    cache = { time: Date.now(), releases }
    return releases
  }
}
