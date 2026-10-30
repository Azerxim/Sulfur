import { t } from '../shared/i18n'

const POINTS = [
  { id: 'proxy:running', name: 'redirections started', dataType: 'Int32', numeric: true },
  { id: 'proxy:connections', name: 'active connections', dataType: 'Int32', numeric: true },
  { id: 'proxy:bytesUp', name: 'bytes client → device', dataType: 'Int32', numeric: true },
  { id: 'proxy:bytesDown', name: 'bytes device → client', dataType: 'Int32', numeric: true },
  { id: 'proxy:dropped', name: 'sends dropped', dataType: 'Int32', numeric: true },
  { id: 'proxy:corrupted', name: 'sends altered', dataType: 'Int32', numeric: true }
]

/**
 * Points de données du module Proxy (contrat : `points.js` du SDK) : compteurs de toutes les
 * redirections démarrées. Défauts injectables par le simulateur : retard, absence de réponse
 * (données ignorées) et coupure (connexions coupées et refusées).
 */
export function createPointsApi({ engine }) {
  return {
    name: 'Proxy',

    points() {
      return POINTS.map((p) => ({ ...p, group: 'server', writable: false }))
    },

    read(ids) {
      const rules = [...engine.rules.values()]
      const sum = (key) => rules.reduce((n, rule) => n + rule.counters[key], 0)
      const values = {
        'proxy:running': rules.length,
        'proxy:connections': rules.reduce((n, rule) => n + rule.sessions.size, 0),
        'proxy:bytesUp': sum('up'),
        'proxy:bytesDown': sum('down'),
        'proxy:dropped': sum('dropped'),
        'proxy:corrupted': sum('corrupted')
      }
      return Object.fromEntries(ids.map((id) => [id, values[id]]))
    },

    async write(id) {
      throw new Error(t('proxy.errors.readOnlyPoint', { id }))
    },

    faultTypes() {
      return [{ type: 'delay' }, { type: 'noResponse' }, { type: 'cut' }]
    },

    setFaults(faults) {
      engine.setFaults(faults)
    }
  }
}
