import { toNumber, withDefaults } from '@azerxim/sulfur-sdk'
import { DEFAULTS, manifest } from '../manifest.js'
import { t } from '../i18n.js'

/** Points publiés : `test-signal/<id>` pour le simulateur et les courbes. */
const POINTS = [
  { id: 'sine', group: 'server', name: 'sine', dataType: 'Double', numeric: true, writable: false },
  { id: 'ramp', group: 'server', name: 'ramp', dataType: 'Double', numeric: true, writable: false },
  { id: 'square', group: 'server', name: 'square', dataType: 'Boolean', numeric: true, writable: false },
  { id: 'setpoint', group: 'server', name: 'setpoint', dataType: 'Double', numeric: true, writable: true },
  { id: 'running', group: 'server', name: 'running', dataType: 'Boolean', numeric: true, writable: false }
]

let ctx = null
let timer = null
let started = 0
let settings = DEFAULTS
const values = { sine: 0, ramp: 0, square: false, setpoint: 50, running: false }

/** Valeurs du signal au temps présent (période en secondes, amplitude crête). */
function sample() {
  const phase = (((Date.now() - started) / 1000) % settings.period) / settings.period
  values.sine = Math.round(settings.amplitude * Math.sin(2 * Math.PI * phase) * 1000) / 1000
  values.ramp = Math.round(settings.amplitude * phase * 1000) / 1000
  values.square = phase < 0.5
}

const snapshot = () => ({ ...values, settings })

function stop() {
  clearInterval(timer)
  timer = null
  values.running = false
  ctx?.emit('tick', snapshot())
}

function start(options) {
  const next = withDefaults(DEFAULTS, options)
  const interval = toNumber(next.interval)
  if (interval === null || interval < 50 || interval > 10_000) throw new Error(t('test-signal.errors.interval'))
  stop()
  settings = {
    period: Math.max(0.1, toNumber(next.period) ?? DEFAULTS.period),
    amplitude: toNumber(next.amplitude) ?? DEFAULTS.amplitude,
    interval
  }
  started = Date.now()
  values.running = true
  timer = setInterval(() => {
    sample()
    ctx.emit('tick', snapshot())
  }, interval)
  sample()
  ctx.emit('tick', snapshot())
  ctx.log(`générateur démarré (${JSON.stringify(settings)})`)
  return snapshot()
}

/** Écriture d'un point (simulateur, interface) : seule la consigne est inscriptible. */
async function write(id, value) {
  if (id !== 'setpoint') throw new Error(t('test-signal.errors.readOnly', { id }))
  const number = toNumber(value)
  if (number === null) throw new Error(t('test-signal.errors.notNumber'))
  values.setpoint = number
  ctx.emit('tick', snapshot())
  return number
}

export default {
  manifest,
  activate(context) {
    ctx = context
    settings = withDefaults(DEFAULTS, ctx.config().generator)
    ctx.handle('start', start)
    ctx.handle('stop', () => (stop(), snapshot()))
    ctx.handle('status', snapshot)
    ctx.handle('setpoint', (value) => write('setpoint', value))
    ctx.handle('ping', () => ({ pid: process.pid, node: process.versions.node }))
    ctx.expose({
      name: t('test-signal.name'),
      points: () => POINTS,
      read: (ids) => Object.fromEntries(ids.map((id) => [id, values[id]])),
      write
    })
  },
  /** Générateur en marche : Sulfur refuse alors de désactiver le module ou d'importer une configuration. */
  busy: () => timer !== null,
  deactivate() {
    stop()
    ctx = null
  }
}
