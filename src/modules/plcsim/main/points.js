import { TEXT_TYPES } from '../shared/constants'

const numericType = (w) => (w.kind === 'address' ? !['Char'].includes(w.dataType) : !TEXT_TYPES.includes(w.type))

/**
 * Points de données du module PLCSim Advanced pour les autres modules (contrat : `points.js` du SDK) :
 * les surveillances, dans le groupe « plc ». Écrire un point écrit la variable ou l'adresse de
 * l'automate virtuel : un flux du simulateur peut ainsi piloter ses entrées.
 */
export function createPointsApi({ manager }) {
  return {
    name: 'PLCSim Advanced',

    points() {
      return [...manager.watches.values()].map((w) => ({
        id: w.id,
        group: 'plc',
        name: `${w.instance} · ${w.label || (w.kind === 'address' ? w.address : w.name)}`,
        dataType: w.dataType,
        numeric: numericType(w),
        writable: true
      }))
    },

    read(ids) {
      return Object.fromEntries(ids.map((id) => [id, manager.last.get(id)?.value ?? undefined]))
    },

    write(id, value) {
      return manager.writeWatch(id, value)
    }
  }
}
