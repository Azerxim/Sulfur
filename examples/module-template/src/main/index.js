/**
 * Process principal du module (Node, avec les droits de Sulfur) : canaux IPC `my-module:<action>`
 * appelés par l'interface, événement `my-module:state` diffusé à l'interface, et points de données
 * `my-module/<id>` publiés pour le simulateur et les courbes.
 */
import { toNumber, withDefaults } from '@azerxim/sulfur-sdk'
import { DEFAULTS, manifest } from '../manifest.js'
import { t } from '../i18n.js'

/** Points publiés : `writable` indique ceux que le simulateur et l'interface peuvent écrire. */
const POINTS = [
  { id: 'value', group: 'server', name: 'value', dataType: 'Double', numeric: true, writable: false },
  { id: 'step', group: 'server', name: 'step', dataType: 'Double', numeric: true, writable: true },
  { id: 'running', group: 'server', name: 'running', dataType: 'Boolean', numeric: true, writable: false }
]

let ctx = null
let timer = null
const values = { value: 0, step: DEFAULTS.step, running: false }

const state = () => ({ ...values })
const changed = () => ctx?.emit('state', state())

function start(options) {
  const settings = withDefaults(DEFAULTS, options)
  const interval = toNumber(settings.interval)
  if (interval === null || interval < 100 || interval > 60_000) throw new Error(t('my-module.errors.interval'))
  stop()
  values.step = toNumber(settings.step) ?? DEFAULTS.step
  values.running = true
  timer = setInterval(() => {
    values.value += values.step
    changed()
  }, interval)
  ctx.log(`compteur démarré (${interval} ms)`)
  changed()
  return state()
}

function stop() {
  clearInterval(timer)
  timer = null
  values.running = false
  changed()
  return state()
}

/** Écriture d'un point (simulateur, interface) : lève une erreur traduite si elle est impossible. */
async function write(id, value) {
  if (id !== 'step') throw new Error(t('my-module.errors.readOnly', { id }))
  const number = toNumber(value)
  if (number === null) throw new Error(t('my-module.errors.notNumber'))
  values.step = number
  changed()
  return number
}

export default {
  manifest,
  activate(context) {
    ctx = context
    // Configuration enregistrée par l'interface (usePersistentState), complétée par les défauts.
    values.step = withDefaults(DEFAULTS, ctx.config().counter).step
    ctx.handle('start', start)
    ctx.handle('stop', stop)
    ctx.handle('state', state)
    ctx.handle('step', (value) => write('step', value))
    ctx.handle('reset', () => ((values.value = 0), changed(), state()))
    ctx.expose({
      name: t('my-module.name'),
      points: () => POINTS,
      read: (ids) => Object.fromEntries(ids.map((id) => [id, values[id]])),
      write
    })
  },
  /** En marche : Sulfur refuse alors de désactiver, mettre à jour ou supprimer le module. */
  busy: () => timer !== null,
  deactivate() {
    stop()
    ctx = null
  }
}
