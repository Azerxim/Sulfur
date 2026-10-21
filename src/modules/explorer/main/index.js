import { EXPLORER_MODULE, MAX_PREVIEW } from '../shared/constants'
import { PRIVATE_NETWORKS } from '@shared/networks'
import '../shared/locales'
import { localNetworks, parseTargets } from './targets'

/**
 * Partie "main" du module Explorateur réseau. Canaux : `explorer:targets:check`,
 * `explorer:networks`. Les cibles sont limitées aux réseaux privés (RFC 1918) ; la recherche et
 * l'identification des équipements sont prévues plus tard (voir la roadmap).
 */
export const explorerMainModule = {
  manifest: EXPLORER_MODULE,

  activate(ctx) {
    /** Adresses désignées par la saisie : nombre, premières adresses, première et dernière. */
    ctx.handle('targets:check', async (text) => {
      const addresses = await parseTargets(text)
      return {
        count: addresses.length,
        first: addresses[0],
        last: addresses.at(-1),
        preview: addresses.slice(0, MAX_PREVIEW)
      }
    })
    ctx.handle('networks', () => ({
      private: PRIVATE_NETWORKS.map((n) => n.cidr),
      local: localNetworks()
    }))
  }
}
