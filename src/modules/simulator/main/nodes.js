import vm from 'vm'
import { simulate, toNumber } from '@azerxim/sulfur-sdk'
import { RAMP_INTERVAL } from '../shared/constants'
import { FUNCTION_TIMEOUT, getProperty, nodeOutputs } from '../shared/flows'
import { t } from '../shared/i18n'
import { seconds } from './engine'

/** Intervalle minimal de scrutation d'un point ou d'émission d'un générateur (ms). */
const MIN_INTERVAL = 50

/** Texte court d'une valeur pour le statut d'un nœud. */
export function shortValue(value, max = 32) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (text === undefined) return String(value)
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** Valeur « vraie » d'une charge utile (false, 0, 'false', '0', '', null et undefined sont faux). */
export function truthy(value) {
  if (typeof value === 'string') return !['', '0', 'false', 'off'].includes(value.trim().toLowerCase())
  return !!value
}

function interval(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) throw new Error(t('simulator.errors.invalidInterval', { value }))
  return Math.max(MIN_INTERVAL, n)
}

function number(value, label) {
  const n = toNumber(value)
  if (n === null) throw new Error(t('simulator.errors.notNumber', { value: shortValue(value), label }))
  return n
}

function requirePoint(point) {
  if (!point) throw new Error(t('simulator.errors.noPoint'))
  return point
}

/** Charge utile d'un déclencheur selon son type. */
export function injectPayload(type, payload) {
  switch (type) {
    case 'number':
      return number(payload, t('simulator.props.payload'))
    case 'boolean':
      return truthy(payload)
    case 'json':
      try {
        return JSON.parse(payload)
      } catch {
        throw new Error(t('simulator.errors.invalidJson'))
      }
    case 'timestamp':
      return Date.now()
    default:
      return String(payload ?? '')
  }
}

/** Règle d'un aiguillage vérifiée par `value`. */
export function matchRule(rule, value) {
  const a = toNumber(value)
  const b = toNumber(rule.value)
  switch (rule.op) {
    case 'eq':
      return a !== null && b !== null ? a === b : String(value) === String(rule.value)
    case 'neq':
      return a !== null && b !== null ? a !== b : String(value) !== String(rule.value)
    case 'lt':
      return a !== null && b !== null && a < b
    case 'lte':
      return a !== null && b !== null && a <= b
    case 'gt':
      return a !== null && b !== null && a > b
    case 'gte':
      return a !== null && b !== null && a >= b
    case 'between': {
      const c = toNumber(rule.value2)
      return a !== null && b !== null && c !== null && a >= Math.min(b, c) && a <= Math.max(b, c)
    }
    case 'true':
      return value === true || value === 1 || value === 'true'
    case 'false':
      return value === false || value === 0 || value === 'false'
    default:
      return false
  }
}

/**
 * Implémentations des nœuds : `(api) => { start?(), input?(msg), trigger?(), close?() }`.
 * `api` est fourni par FlowRuntime.nodeApi : configuration, envoi de messages, statut, points,
 * défauts et minuteurs arrêtés automatiquement au redéploiement.
 */
export const NODE_IMPLEMENTATIONS = {
  inject(api) {
    const { payloadType, payload, topic, once, repeat } = api.config
    const every = Number(repeat) > 0 ? seconds(repeat) : 0
    const fire = () => {
      api.send({ payload: injectPayload(payloadType, payload), topic })
      api.status(new Date().toLocaleTimeString(undefined, { hour12: false }), 'grey')
    }
    return {
      start() {
        if (once) api.setTimeout(fire, 100)
        if (every) api.setInterval(fire, every)
      },
      trigger: fire
    }
  },

  watch(api) {
    const point = requirePoint(api.config.point)
    const period = interval(api.config.interval)
    let last
    let first = true
    const poll = () => {
      const value = api.read(point)
      const text = JSON.stringify(value)
      if (value === undefined) {
        if (first || last !== undefined) api.status(t('simulator.status.unavailable'), 'grey')
        first = false
        last = undefined
        return
      }
      if (!first && text === last) return
      const emit = !first || api.config.initial
      const previous = last === undefined ? undefined : JSON.parse(last)
      first = false
      last = text
      api.status(shortValue(value))
      if (emit) api.send({ payload: value, topic: point, previous })
    }
    return {
      start() {
        poll()
        api.setInterval(poll, period)
      }
    }
  },

  read(api) {
    const point = requirePoint(api.config.point)
    return {
      input(msg) {
        msg.payload = api.read(point)
        if (msg.payload === undefined) throw new Error(t('simulator.errors.unavailable', { point }))
        api.status(shortValue(msg.payload))
        api.send(msg)
      }
    }
  },

  write(api) {
    const point = requirePoint(api.config.point)
    const { source, value } = api.config
    return {
      async input(msg) {
        const written = source === 'fixed' ? value : msg.payload
        await api.write(point, written)
        api.status(shortValue(written))
        api.send(msg)
      }
    }
  },

  delay(api) {
    const ms = seconds(api.config.duration)
    let pending = 0
    const show = () =>
      pending ? api.status(t('simulator.status.pending', { count: pending }), 'blue') : api.clearStatus()
    return {
      input(msg) {
        pending++
        show()
        api.setTimeout(() => {
          pending--
          show()
          api.send(msg)
        }, ms)
      }
    }
  },

  ramp(api) {
    const point = requirePoint(api.config.point)
    const duration = seconds(api.config.duration)
    // Un nouveau message remplace la rampe en cours.
    let current = null
    return {
      async input(msg) {
        if (current) current.cancelled = true
        const run = { cancelled: false }
        current = run
        const empty = (v) => v === '' || v === undefined || v === null
        const start = number(empty(api.config.from) ? api.read(point) : api.config.from, point)
        const end = number(empty(api.config.to) ? msg.payload : api.config.to, point)
        const count = Math.max(1, Math.round(duration / RAMP_INTERVAL))
        // Bornes entières : valeurs intermédiaires entières (variables de type entier).
        const integer = Number.isInteger(start) && Number.isInteger(end)
        for (let k = 1; k <= count; k++) {
          await api.sleep(duration / count)
          if (run.cancelled || api.closed) return
          const value = start + ((end - start) * k) / count
          await api.write(point, integer ? Math.round(value) : value)
          api.status(`${shortValue(integer ? Math.round(value) : value)} → ${end}`, 'blue')
        }
        current = null
        api.status(shortValue(end))
        api.send({ ...msg, payload: end })
      }
    }
  },

  fault(api) {
    const { fault, action } = api.config
    return {
      async input(msg) {
        const def = api.faults().find((f) => f.id === fault)
        if (!def) throw new Error(t('simulator.errors.unknownFault'))
        const on = action === 'msg' ? truthy(msg.payload) : action !== 'off'
        if (on) await api.activateFault(def)
        else await api.deactivateFault(def.id)
        api.status(on ? t('simulator.status.faultOn') : t('simulator.status.faultOff'), on ? 'red' : 'grey')
        api.send(msg)
      }
    }
  },

  switch(api) {
    const { property, rules = [], checkAll } = api.config
    return {
      input(msg) {
        const value = getProperty(msg, property)
        const out = rules.map(() => null)
        let matched = false
        rules.forEach((rule, i) => {
          if (matched && !checkAll) return
          if (rule.op === 'else' ? !matched : matchRule(rule, value)) {
            out[i] = msg
            matched = true
          }
        })
        api.send(out)
      }
    }
  },

  scale(api) {
    const inMin = number(api.config.inMin, 'in min')
    const inMax = number(api.config.inMax, 'in max')
    const outMin = number(api.config.outMin, 'out min')
    const outMax = number(api.config.outMax, 'out max')
    if (inMin === inMax) throw new Error(t('simulator.errors.emptyRange'))
    return {
      input(msg) {
        let value = outMin + ((number(msg.payload, 'payload') - inMin) * (outMax - outMin)) / (inMax - inMin)
        if (api.config.clamp) value = Math.min(Math.max(value, Math.min(outMin, outMax)), Math.max(outMin, outMax))
        if (api.config.round) value = Math.round(value)
        msg.payload = value
        api.send(msg)
      }
    }
  },

  counter(api) {
    const initial = number(api.config.initial, 'initial')
    const step = number(api.config.step, 'step')
    let count = initial
    return {
      start() {
        api.status(count, 'grey')
      },
      input(msg) {
        if (msg.reset) {
          count = initial
          api.status(count, 'grey')
          return
        }
        count += step
        api.status(count)
        msg.payload = count
        api.send(msg)
      }
    }
  },

  filter(api) {
    const deadband = Math.abs(toNumber(api.config.deadband) ?? 0)
    let last
    let seen = false
    return {
      input(msg) {
        const value = msg.payload
        let changed
        if (!seen) changed = true
        else if (deadband > 0 && toNumber(value) !== null && toNumber(last) !== null)
          changed = Math.abs(toNumber(value) - toNumber(last)) >= deadband
        else changed = JSON.stringify(value) !== JSON.stringify(last)
        if (!changed) return
        seen = true
        last = value
        api.send(msg)
      }
    }
  },

  /**
   * Code JavaScript exécuté dans un contexte isolé (module vm) : `msg`, `node`, `context`, `flow` et
   * `global` sont disponibles ; retourner un message, un tableau (un élément par sortie) ou null.
   * Chaque appel est limité à FUNCTION_TIMEOUT ms. Ce n'est pas une frontière de sécurité : le code
   * est celui de l'utilisateur.
   */
  function(api) {
    const outputs = nodeOutputs({ type: 'function', config: api.config })
    const sandbox = vm.createContext({
      node: {
        id: api.id,
        name: api.name,
        outputs,
        send: (msgs) => api.send(msgs),
        status: (text, fill) => api.status(text, fill),
        warn: (text) => api.warn(text),
        error: (text) => api.error(text)
      },
      context: api.context,
      flow: api.flow,
      global: api.global,
      console: { log: (...args) => api.debug(args.length === 1 ? args[0] : args) }
    })
    const filename = `function:${api.name || api.id}`
    new vm.Script(`globalThis.__run = function (msg) {\n${api.config.code ?? ''}\n}`, { filename }).runInContext(
      sandbox,
      { timeout: FUNCTION_TIMEOUT }
    )
    const call = new vm.Script('__run(__msg)', { filename })
    return {
      input(msg) {
        sandbox.__msg = msg
        let result
        try {
          result = call.runInContext(sandbox, { timeout: FUNCTION_TIMEOUT })
        } catch (err) {
          // Erreurs nées dans le contexte isolé : instances d'un autre Error.
          throw new Error(err?.message ?? String(err), { cause: err })
        } finally {
          delete sandbox.__msg
        }
        if (result !== null && result !== undefined) api.send(result)
      }
    }
  },

  generator(api) {
    const { simulation, min, max, integer, autostart } = api.config
    const period = Math.max(MIN_INTERVAL, seconds(api.config.period))
    const every = interval(api.config.interval)
    const variable = {
      simulation,
      period,
      min: number(min, 'min'),
      max: number(max, 'max'),
      dataType: integer ? 'Int32' : 'Double'
    }
    let timer = null
    let value = variable.min
    let started = 0
    const tick = () => {
      value = simulate(variable, value, Date.now() - started, every)
      api.status(shortValue(typeof value === 'number' && !integer ? Math.round(value * 100) / 100 : value))
      api.send({ payload: value, topic: api.name })
    }
    const run = () => {
      if (timer) return
      started = Date.now()
      tick()
      timer = api.setInterval(tick, every)
    }
    const pause = () => {
      if (timer) api.clearTimer(timer)
      timer = null
      api.status(t('simulator.status.paused'), 'grey')
    }
    return {
      start() {
        if (autostart) run()
        else pause()
      },
      input(msg) {
        if (truthy(msg.payload)) run()
        else pause()
      }
    }
  },

  debug(api) {
    const { property, active } = api.config
    return {
      input(msg) {
        if (!active) return
        const value = property === 'msg' ? msg : getProperty(msg, property)
        api.debug(value)
        api.status(shortValue(value), 'grey')
      }
    }
  }
}
