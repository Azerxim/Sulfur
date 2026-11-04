import { simulate } from '@azerxim/sulfur-sdk'
import {
  CODES,
  FORMATS,
  METHOD_NAMES,
  OPTIONS,
  formatLinks,
  messagePath,
  option,
  optionValue,
  payloadText
} from '../shared/codec'
import {
  DATA_TYPES,
  DEFAULT_SERVER_CONFIG,
  LOG_PAYLOAD,
  MAX_LOG,
  RESOURCE_FORMATS,
  SIMULATIONS
} from '../shared/constants'
import { CoapEndpoint } from './endpoint'
import { t } from '../shared/i18n'

const EMIT_INTERVAL = 200
const STATUS_INTERVAL = 1000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Valeur saisie ou reçue convertie dans le type de la ressource. */
export function convertValue(dataType, raw) {
  if (dataType === 'String') return typeof raw === 'string' ? raw : JSON.stringify(raw)
  if (dataType === 'Boolean') {
    if (typeof raw === 'boolean') return raw
    const s = String(raw).trim().toLowerCase()
    if (['true', '1', 'on'].includes(s)) return true
    if (['false', '0', 'off'].includes(s)) return false
    throw new Error(t('coap.errors.invalidBoolean', { value: raw }))
  }
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
  if (String(raw).trim() === '' || !Number.isFinite(n)) throw new Error(t('errors.invalidNumber', { value: raw }))
  if (dataType === 'Integer' && !Number.isInteger(n)) throw new Error(t('errors.invalidInteger', { value: raw }))
  return n
}

/** Chemin d'une ressource sans barres obliques en tête ni en fin : « sensors/temperature ». */
export const normalizePath = (path) =>
  String(path ?? '')
    .trim()
    .replace(/^\/+|\/+$/g, '')

/** Vérifie la définition d'une ressource simulée (chemin unique, type, format, simulation). */
export function validateResource(def, others = []) {
  const path = normalizePath(def.path)
  if (!path || !/^[A-Za-z0-9._~\-/]+$/.test(path) || path.includes('//'))
    throw new Error(t('coap.errors.invalidPath', { path: def.path ?? '' }))
  if (path.startsWith('.well-known')) throw new Error(t('coap.errors.reservedPath'))
  if (others.some((o) => o.id !== def.id && normalizePath(o.path) === path))
    throw new Error(t('coap.errors.duplicatePath', { path }))
  if (!DATA_TYPES.includes(def.dataType)) throw new Error(t('coap.errors.invalidType'))
  if (!RESOURCE_FORMATS.includes(Number(def.format))) throw new Error(t('coap.errors.invalidFormat'))
  if (!SIMULATIONS.includes(def.simulation)) throw new Error(t('coap.errors.invalidSimulation'))
  const interval = Number(def.interval)
  if (!Number.isFinite(interval) || interval < 0) throw new Error(t('coap.errors.invalidInterval'))
}

const round = (value) =>
  typeof value === 'number' && !Number.isInteger(value) ? Math.round(value * 1000) / 1000 : value

/** Contenu servi pour une valeur : texte, ou JSON `{ "value": …, "timestamp": … }`. */
export function encodeValue(def, value, timestamp = Date.now()) {
  if (Number(def.format) === FORMATS.JSON)
    return Buffer.from(JSON.stringify({ value: round(value), timestamp: new Date(timestamp).toISOString() }))
  return Buffer.from(String(round(value)))
}

/** Valeur d'un contenu reçu (PUT) : JSON `{ "value": … }` ou valeur seule, texte sinon. */
export function decodeValue(def, payload, format) {
  const text = payload.toString('utf8').trim()
  if (format === FORMATS.JSON || (format === undefined && text.startsWith('{'))) {
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new Error(t('coap.errors.invalidJson'))
    }
    return convertValue(def.dataType, parsed && typeof parsed === 'object' && 'value' in parsed ? parsed.value : parsed)
  }
  return convertValue(def.dataType, text)
}

/**
 * Serveur CoAP simulé : ressources simulées (valeur générée ou fixe), lues par GET, modifiées par
 * PUT si elles l'autorisent, observées (RFC 7641) avec des notifications au plus toutes les
 * `interval` ms ; découverte par /.well-known/core (RFC 6690). Défauts injectés par le simulateur :
 * délai, absence de réponse, code de réponse forcé.
 */
export class CoapServer {
  endpoint = null
  config = null
  values = new Map()
  /** Observateurs par ressource : id → Map(clé → { address, port, token, seq, lastSent, lastValue }). */
  observers = new Map()
  faults = []
  requests = 0
  log = []
  nextLog = 1
  outbox = []
  timers = []

  constructor({ onStatus = () => {}, onLog = () => {}, onValues = () => {} } = {}) {
    this.onStatus = onStatus
    this.onLog = onLog
    this.onValues = onValues
  }

  get running() {
    return !!this.endpoint
  }

  observerCount() {
    return [...this.observers.values()].reduce((n, map) => n + map.size, 0)
  }

  status() {
    return {
      running: this.running,
      endpoint: this.running ? `coap://${this.config.host}:${this.config.port}` : null,
      config: this.config,
      requests: this.requests,
      // Observateurs : affichés comme sessions dans la barre latérale et la vue d'ensemble.
      sessions: this.observerCount(),
      observers: [...this.observers].flatMap(([id, map]) =>
        [...map.values()].map((o) => ({ resource: id, remote: `${o.address}:${o.port}`, since: o.since, sent: o.seq }))
      )
    }
  }

  currentValues() {
    return Object.fromEntries(this.values)
  }

  async start(options) {
    if (this.running) throw new Error(t('coap.errors.serverRunning'))
    const config = { ...DEFAULT_SERVER_CONFIG, ...options }
    const port = Number(config.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(t('coap.errors.invalidPort'))
    const resources = (config.resources ?? []).map((r) => ({ ...r, path: normalizePath(r.path) }))
    resources.forEach((r) => validateResource(r, resources))
    const endpoint = new CoapEndpoint({ onRequest: (msg, remote) => this.handle(msg, remote) })
    try {
      await endpoint.bind(port, config.host || '0.0.0.0')
    } catch (err) {
      throw translateBindError(err, port)
    }
    this.endpoint = endpoint
    this.config = { ...config, port, resources }
    this.values = new Map(resources.map((r) => [r.id, convertValue(r.dataType, r.initialValue)]))
    this.observers = new Map()
    this.requests = 0
    this.startSimulation()
    this.timers.push(
      setInterval(() => this.flush(), EMIT_INTERVAL),
      setInterval(() => this.onStatus(this.status()), STATUS_INTERVAL),
      setInterval(() => this.onValues(this.currentValues()), 250)
    )
    this.event('info', t('coap.server.log.started', { endpoint: this.status().endpoint }))
    this.onStatus(this.status())
    return this.status()
  }

  async stop() {
    if (!this.running) return this.status()
    for (const timer of this.timers) clearInterval(timer)
    this.timers = []
    clearInterval(this.simTimer)
    const endpoint = this.endpoint
    this.endpoint = null
    this.observers = new Map()
    await endpoint.close()
    this.event('info', t('coap.server.log.stopped'))
    this.flush()
    this.onStatus(this.status())
    return this.status()
  }

  /** Ressources modifiées serveur démarré : valeurs conservées, observateurs des ressources retirées oubliés. */
  update(options) {
    if (!this.running) return this.status()
    const resources = (options.resources ?? []).map((r) => ({ ...r, path: normalizePath(r.path) }))
    resources.forEach((r) => validateResource(r, resources))
    const previous = new Map(this.config.resources.map((r) => [r.id, r]))
    const values = new Map()
    for (const r of resources) {
      const old = previous.get(r.id)
      values.set(
        r.id,
        old && old.dataType === r.dataType && this.values.has(r.id)
          ? this.values.get(r.id)
          : convertValue(r.dataType, r.initialValue)
      )
      if (old && (old.path !== r.path || !r.observable)) this.observers.delete(r.id)
    }
    for (const id of this.observers.keys()) if (!values.has(id)) this.observers.delete(id)
    this.values = values
    this.config = { ...this.config, resources, updateRate: options.updateRate ?? this.config.updateRate }
    this.startSimulation()
    this.onStatus(this.status())
    return this.status()
  }

  /** Nouvelle valeur d'une ressource (interface, point de données) ; notifiée aux observateurs. */
  setValue(id, raw) {
    const def = this.config?.resources.find((r) => r.id === id)
    if (!this.running || !def) throw new Error(t('coap.errors.serverStopped'))
    this.values.set(id, convertValue(def.dataType, raw))
    this.pump()
    return this.values.get(id)
  }

  setFaults(faults = []) {
    this.faults = faults
  }

  fault(type) {
    return this.faults.find((f) => f.type === type)
  }

  startSimulation() {
    clearInterval(this.simTimer)
    const dt = Math.max(10, Number(this.config.updateRate) || 100)
    const started = Date.now()
    this.simTimer = setInterval(() => {
      const elapsed = Date.now() - started
      for (const def of this.config.resources) {
        if (def.simulation === 'none') continue
        const spec = {
          ...def,
          period: Number(def.period),
          min: Number(def.min),
          max: Number(def.max),
          dataType: def.dataType === 'Integer' ? 'Int32' : def.dataType
        }
        this.values.set(def.id, simulate(spec, this.values.get(def.id), elapsed, dt))
      }
      this.pump()
    }, dt)
  }

  /** Notifications des observateurs dont la ressource a changé depuis leur dernière notification. */
  pump() {
    const now = Date.now()
    for (const [id, map] of this.observers) {
      const def = this.config.resources.find((r) => r.id === id)
      if (!def) continue
      const value = this.values.get(id)
      for (const [key, observer] of map) {
        if (observer.lastValue === value || now - observer.lastSent < Number(def.interval)) continue
        this.sendNotification(def, key, observer, value)
      }
    }
  }

  sendNotification(def, key, observer, value) {
    observer.seq = (observer.seq + 1) & 0xffffff
    observer.lastSent = Date.now()
    observer.lastValue = value
    this.endpoint.notify(
      observer,
      {
        code: CODES.CONTENT,
        options: [option(OPTIONS.OBSERVE, observer.seq), option(OPTIONS.CONTENT_FORMAT, Number(def.format))],
        payload: encodeValue(def, value)
      },
      {
        onFail: (reason) => {
          if (!this.observers.get(def.id)?.delete(key)) return
          this.event(
            'warn',
            t(`coap.server.log.observerGone.${reason === 'reset' ? 'reset' : 'timeout'}`, {
              remote: `${observer.address}:${observer.port}`,
              path: `/${def.path}`
            })
          )
        }
      }
    )
  }

  /** Requête reçue : réponse { code, options, payload } ou null (pas de réponse). */
  async handle(msg, remote) {
    this.requests++
    const path = messagePath(msg)
    const method = METHOD_NAMES[msg.code] ?? '?'
    const entry = { remote: `${remote.address}:${remote.port}`, method, path }
    if (this.fault('noResponse')) {
      this.append({ ...entry, code: null, fault: 'noResponse' })
      return null
    }
    const delay = this.fault('delay')
    if (delay) await sleep(Number(delay.params?.ms) || 0)
    const forced = this.fault('exception')
    const response = forced
      ? { code: Number(forced.params?.code) || CODES.SERVICE_UNAVAILABLE }
      : this.respond(msg, remote, path)
    this.append({
      ...entry,
      code: response.code,
      observe: response.observe,
      payload: response.payload ? payloadText(response.payload).slice(0, LOG_PAYLOAD) : '',
      ...(forced ? { fault: 'exception' } : {})
    })
    return response
  }

  respond(msg, remote, path) {
    if (path === '/.well-known/core') {
      if (msg.code !== CODES.GET) return { code: CODES.METHOD_NOT_ALLOWED }
      const links = this.config.resources.map((r) => ({
        href: `/${r.path}`,
        attrs: { ...(r.title ? { title: r.title } : {}), ct: Number(r.format), ...(r.observable ? { obs: true } : {}) }
      }))
      return {
        code: CODES.CONTENT,
        options: [option(OPTIONS.CONTENT_FORMAT, FORMATS.LINK)],
        payload: Buffer.from(formatLinks(links))
      }
    }
    const def = this.config.resources.find((r) => `/${r.path}` === path)
    if (!def) return { code: CODES.NOT_FOUND }
    const value = this.values.get(def.id)

    if (msg.code === CODES.GET) {
      const accept = optionValue(msg, OPTIONS.ACCEPT)
      if (accept !== undefined && accept !== Number(def.format)) return { code: CODES.NOT_ACCEPTABLE }
      const options = [option(OPTIONS.CONTENT_FORMAT, Number(def.format))]
      const observe = optionValue(msg, OPTIONS.OBSERVE)
      const key = `${remote.address}:${remote.port}:${msg.token.toString('hex')}`
      let observeAction = null
      if (observe === 0 && def.observable) {
        if (!this.observers.has(def.id)) this.observers.set(def.id, new Map())
        this.observers.get(def.id).set(key, {
          address: remote.address,
          port: remote.port,
          token: Buffer.from(msg.token),
          seq: 1,
          since: Date.now(),
          lastSent: Date.now(),
          lastValue: value
        })
        options.push(option(OPTIONS.OBSERVE, 1))
        observeAction = 'register'
      } else if (observe === 1) {
        if (this.observers.get(def.id)?.delete(key)) observeAction = 'cancel'
      }
      return { code: CODES.CONTENT, options, payload: encodeValue(def, value), observe: observeAction }
    }

    if (msg.code === CODES.PUT) {
      if (!def.writable) return { code: CODES.METHOD_NOT_ALLOWED }
      const format = optionValue(msg, OPTIONS.CONTENT_FORMAT)
      if (format !== undefined && !RESOURCE_FORMATS.includes(format)) return { code: CODES.UNSUPPORTED_FORMAT }
      try {
        this.values.set(def.id, decodeValue(def, msg.payload, format))
      } catch (err) {
        return { code: CODES.BAD_REQUEST, payload: Buffer.from(err.message) }
      }
      this.pump()
      return { code: CODES.CHANGED }
    }
    return { code: CODES.METHOD_NOT_ALLOWED }
  }

  // --- Journal ------------------------------------------------------------------------------------

  event(level, text) {
    this.append({ level, text })
  }

  append(entry) {
    const full = { id: this.nextLog++, time: Date.now(), ...entry }
    this.log.push(full)
    if (this.log.length > MAX_LOG) this.log.splice(0, this.log.length - MAX_LOG)
    this.outbox.push(full)
  }

  flush() {
    if (!this.outbox.length) return
    const batch = this.outbox
    this.outbox = []
    this.onLog(batch)
  }

  clearLog() {
    this.log = []
    this.outbox = []
    return this.log
  }
}

/** Erreur d'ouverture d'un port UDP, traduite. */
export function translateBindError(err, port) {
  if (err.code === 'EACCES') return new Error(t('coap.errors.portPrivileged', { port }), { cause: err })
  if (err.code === 'EADDRINUSE') return new Error(t('coap.errors.portInUse', { port }), { cause: err })
  if (err.code === 'EADDRNOTAVAIL') return new Error(t('coap.errors.addressUnavailable'), { cause: err })
  return err
}
