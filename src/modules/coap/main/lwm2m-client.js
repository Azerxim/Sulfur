import {
  CODES,
  FORMATS,
  METHOD_NAMES,
  OPTIONS,
  codeName,
  formatLinks,
  isSuccess,
  messagePath,
  option,
  optionValue,
  optionValues,
  uriOptions
} from '../shared/codec'
import { COAP_MODULE, DEFAULT_DEVICE_CONFIG, MAX_LOG, UPDATE_RATIO } from '../shared/constants'
import {
  OBJECTS,
  decodeContent,
  displayValue,
  encodeSenml,
  encodeTlv,
  encodeTlvValue,
  parsePath,
  parseValue,
  pathLabel,
  resourceDef,
  valueToText
} from '../shared/lwm2m'
import { CoapEndpoint } from './endpoint'
import { t } from '../shared/i18n'

const EMIT_INTERVAL = 200
/** Valeurs simulées recalculées et observateurs notifiés toutes les TICK ms. */
const TICK = 1000
/** Nouvel essai d'enregistrement après un échec (ms). */
const RETRY_DELAY = 30_000
const REQUEST_TIMEOUT = 10_000

/** Réglages de l'appareil validés. */
export function normalizeDevice(options) {
  const config = { ...DEFAULT_DEVICE_CONFIG, ...options }
  const endpoint = String(config.endpoint ?? '').trim()
  const serverHost = String(config.serverHost ?? '').trim()
  const serverPort = Number(config.serverPort)
  const lifetime = Number(config.lifetime)
  if (!endpoint || /[\s&?/]/.test(endpoint)) throw new Error(t('coap.device.errors.invalidEndpoint'))
  if (!serverHost) throw new Error(t('coap.errors.missingHost'))
  if (!Number.isInteger(serverPort) || serverPort < 1 || serverPort > 65535)
    throw new Error(t('coap.errors.invalidPort'))
  if (!Number.isInteger(lifetime) || lifetime < 10 || lifetime > 86400)
    throw new Error(t('coap.device.errors.invalidLifetime'))
  const temperature = { ...DEFAULT_DEVICE_CONFIG.temperature, ...config.temperature }
  return {
    ...config,
    endpoint,
    serverHost,
    serverPort,
    lifetime,
    objects: { ...DEFAULT_DEVICE_CONFIG.objects, ...config.objects },
    temperature: {
      min: Number(temperature.min),
      max: Number(temperature.max),
      period: Math.max(1000, Number(temperature.period) || 30000)
    }
  }
}

/**
 * Appareil LwM2M simulé (client LwM2M, OMA LwM2M 1.1) : s'enregistre auprès d'un serveur, met son
 * enregistrement à jour avant son expiration et répond aux opérations du serveur sur ses objets :
 * Device (3), Temperature (3303) et Light Control (3311), instance 0. Lecture en texte, TLV ou
 * SenML JSON, écriture (texte, TLV, SenML JSON), exécution (redémarrage, remise à zéro du min / max),
 * découverte et observation (notification à chaque changement, au plus toutes les secondes).
 */
export class Lwm2mDevice {
  endpoint = null
  config = null
  /** État : stopped, registering, registered ou error. */
  state = 'stopped'
  location = null
  lastError = null
  registeredAt = null
  /** Valeurs des ressources : « /3303/0/5700 » → valeur. */
  values = new Map()
  /** Observateurs : clé → { address, port, token, path, format, seq, last }. */
  observers = new Map()
  log = []
  nextLog = 1
  outbox = []
  timers = []

  constructor({ onStatus = () => {}, onLog = () => {} } = {}) {
    this.onStatus = onStatus
    this.onLog = onLog
  }

  get running() {
    return !!this.endpoint
  }

  /** Instances des objets activés : [3, 3303, 3311]. */
  objectIds() {
    return [3, ...(this.config?.objects.temperature ? [3303] : []), ...(this.config?.objects.light ? [3311] : [])]
  }

  status() {
    return {
      // Appareil actif tant qu'il est enregistré.
      connected: this.state === 'registered',
      running: this.running,
      state: this.state,
      config: this.config,
      server: this.config ? `coap://${this.config.serverHost}:${this.config.serverPort}` : null,
      location: this.location,
      lastError: this.lastError,
      registeredAt: this.registeredAt,
      observers: [...this.observers.values()].map(({ path, address, port, seq }) => ({
        path,
        label: pathLabel(path),
        remote: `${address}:${port}`,
        sent: seq
      })),
      resources: this.running
        ? [...this.values].map(([path, value]) => ({ path, label: pathLabel(path), value: displayValue(value) }))
        : []
    }
  }

  emitStatus() {
    this.onStatus(this.status())
  }

  async start(options) {
    if (this.running) throw new Error(t('coap.device.errors.running'))
    const config = normalizeDevice(options)
    const endpoint = new CoapEndpoint({ onRequest: (msg, remote) => this.handle(msg, remote) })
    await endpoint.bind(0, '0.0.0.0')
    this.endpoint = endpoint
    this.config = config
    this.observers = new Map()
    this.initValues()
    this.started = Date.now()
    this.timers.push(
      setInterval(() => this.tick(), TICK),
      setInterval(() => this.flush(), EMIT_INTERVAL)
    )
    this.event('info', t('coap.device.log.started', { endpoint: config.endpoint }))
    await this.register()
    return this.status()
  }

  async stop() {
    if (!this.running) return this.status()
    for (const timer of this.timers) clearInterval(timer)
    this.timers = []
    clearTimeout(this.updateTimer)
    if (this.location && this.state === 'registered') {
      // Désenregistrement : sans attendre plus de 2 s un serveur injoignable.
      await this.send(CODES.DELETE, this.location, {}, 2000)
        .then(() => this.event('info', t('coap.device.log.deregistered')))
        .catch(() => {})
    }
    const endpoint = this.endpoint
    this.endpoint = null
    this.state = 'stopped'
    this.location = null
    this.observers = new Map()
    await endpoint.close()
    this.flush()
    this.emitStatus()
    return this.status()
  }

  send(code, path, { query = '', options = [], payload } = {}, timeout = REQUEST_TIMEOUT) {
    return this.endpoint.request({
      address: this.config.serverHost,
      port: this.config.serverPort,
      code,
      options: [...uriOptions(path, query), ...options],
      payload,
      timeout
    })
  }

  /** Liens des objets annoncés à l'enregistrement : « </>;rt="oma.lwm2m";ct=11542,</3/0>,… ». */
  links() {
    return formatLinks([
      { href: '/', attrs: { rt: 'oma.lwm2m', ct: FORMATS.TLV } },
      ...this.objectIds().map((id) => ({ href: `/${id}/0` }))
    ])
  }

  async register() {
    clearTimeout(this.updateTimer)
    const { endpoint, lifetime } = this.config
    this.state = 'registering'
    this.emitStatus()
    try {
      const { msg } = await this.send(CODES.POST, '/rd', {
        query: `ep=${encodeURIComponent(endpoint)}&lt=${lifetime}&lwm2m=1.1&b=U`,
        options: [option(OPTIONS.CONTENT_FORMAT, FORMATS.LINK)],
        payload: Buffer.from(this.links())
      })
      if (msg.code !== CODES.CREATED) throw new Error(t('coap.device.errors.refused', { code: codeName(msg.code) }))
      this.location = `/${optionValues(msg, OPTIONS.LOCATION_PATH).join('/')}`
      this.state = 'registered'
      this.lastError = null
      this.registeredAt = Date.now()
      this.event('info', t('coap.device.log.registered', { server: this.status().server, location: this.location }))
      this.scheduleUpdate()
    } catch (err) {
      this.failed(err)
    }
    this.emitStatus()
  }

  failed(err) {
    if (!this.running) return
    const message =
      err.code === 'timeout' ? t('coap.device.errors.noServer', { server: this.status().server }) : err.message
    this.state = 'error'
    this.lastError = message
    this.location = null
    this.event('error', t('coap.device.log.failed', { message, delay: RETRY_DELAY / 1000 }))
    this.updateTimer = setTimeout(() => this.register(), RETRY_DELAY)
  }

  scheduleUpdate() {
    clearTimeout(this.updateTimer)
    this.updateTimer = setTimeout(() => this.update(), this.config.lifetime * 1000 * UPDATE_RATIO)
  }

  /** Mise à jour de l'enregistrement ; réenregistrement si le serveur ne le connaît plus. */
  async update() {
    if (!this.running || !this.location) return
    try {
      const { msg } = await this.send(CODES.POST, this.location)
      if (msg.code === CODES.NOT_FOUND) return this.register()
      if (!isSuccess(msg.code)) throw new Error(t('coap.device.errors.refused', { code: codeName(msg.code) }))
      this.event('info', t('coap.device.log.updated'))
      this.scheduleUpdate()
    } catch (err) {
      this.failed(err)
    }
    this.emitStatus()
  }

  // --- Objets ---------------------------------------------------------------------------------------

  initValues() {
    const c = this.config
    const now = Math.floor(Date.now() / 1000)
    const entries = [
      ['/3/0/0', c.manufacturer],
      ['/3/0/1', c.model],
      ['/3/0/2', c.serial],
      // Version du firmware : celle du module, donc de Sulfur.
      ['/3/0/3', COAP_MODULE.version],
      ['/3/0/9', 100],
      ['/3/0/13', now],
      ['/3/0/14', '+01:00'],
      ['/3/0/16', 'U']
    ]
    if (c.objects.temperature) {
      const mid = (c.temperature.min + c.temperature.max) / 2
      entries.push(['/3303/0/5700', mid], ['/3303/0/5601', mid], ['/3303/0/5602', mid], ['/3303/0/5701', 'Cel'])
    }
    if (c.objects.light) {
      entries.push(['/3311/0/5850', false], ['/3311/0/5851', 100], ['/3311/0/5706', 'white'], ['/3311/0/5852', 0])
    }
    this.values = new Map(entries)
  }

  /** Valeurs simulées : température (sinusoïde), batterie, heure, durée d'allumage ; observateurs notifiés. */
  tick() {
    const elapsed = Date.now() - this.started
    this.values.set('/3/0/13', Math.floor(Date.now() / 1000))
    this.values.set('/3/0/9', Math.max(5, 100 - Math.floor(elapsed / 60_000)))
    if (this.values.has('/3303/0/5700')) {
      const { min, max, period } = this.config.temperature
      const value = Math.round((min + ((max - min) / 2) * (1 + Math.sin((2 * Math.PI * elapsed) / period))) * 100) / 100
      this.values.set('/3303/0/5700', value)
      this.values.set('/3303/0/5601', Math.min(this.values.get('/3303/0/5601'), value))
      this.values.set('/3303/0/5602', Math.max(this.values.get('/3303/0/5602'), value))
    }
    if (this.values.get('/3311/0/5850')) this.values.set('/3311/0/5852', this.values.get('/3311/0/5852') + 1)
    this.pump()
    this.emitStatus()
  }

  /** Nouvelle valeur d'une ressource (interface, point de données) ; notifiée aux observateurs. */
  setValue(path, raw) {
    const p = parsePath(path)
    const def = p && resourceDef(p.object, p.resource)
    if (!this.running || !def || !this.values.has(path))
      throw new Error(t('coap.device.errors.unknownResource', { path }))
    const value = parseValue(def.type, typeof raw === 'boolean' ? (raw ? '1' : '0') : raw)
    this.values.set(path, value)
    this.pump()
    this.emitStatus()
    return displayValue(value)
  }

  /** Ressources lisibles d'un chemin (objet, instance ou ressource) : [{ path, id, type, value }]. */
  readable(p) {
    return [...this.values]
      .map(([path, value]) => ({ path, value, ...parsePath(path) }))
      .filter((r) => r.object === p.object && (p.instance === undefined || r.instance === p.instance))
      .filter((r) => p.resource === undefined || r.resource === p.resource)
      .map((r) => ({ ...r, id: r.resource, type: resourceDef(r.object, r.resource)?.type ?? 'string' }))
      .filter((r) => resourceDef(r.object, r.resource)?.ops.includes('R'))
  }

  /** Contenu d'une lecture : { format, payload } ou { code } si le format demandé ne convient pas. */
  encodeRead(p, accept) {
    const resources = this.readable(p)
    if (p.depth === 3) {
      const [r] = resources
      if (accept === undefined || accept === FORMATS.TEXT)
        return { format: FORMATS.TEXT, payload: Buffer.from(valueToText(r.value)) }
      if (accept === FORMATS.TLV)
        return {
          format: FORMATS.TLV,
          payload: encodeTlv([{ type: 'resource', id: r.id, value: encodeTlvValue(r.type, r.value) }])
        }
    } else if (accept === undefined || accept === FORMATS.TLV) {
      const nodes = resources.map((r) => ({ type: 'resource', id: r.id, value: encodeTlvValue(r.type, r.value) }))
      return {
        format: FORMATS.TLV,
        payload: encodeTlv(p.depth === 1 ? [{ type: 'instance', id: 0, children: nodes }] : nodes)
      }
    }
    if (accept === FORMATS.SENML_JSON)
      return { format: FORMATS.SENML_JSON, payload: Buffer.from(encodeSenml(resources)) }
    return { code: CODES.NOT_ACCEPTABLE }
  }

  /** Chemin connu de l'appareil (objet activé, instance 0, ressource connue). */
  exists(p) {
    if (!this.objectIds().includes(p.object)) return false
    if (p.instance !== undefined && p.instance !== 0) return false
    if (p.resource !== undefined && !resourceDef(p.object, p.resource)) return false
    return p.resourceInstance === undefined
  }

  /** Requête du serveur : lecture, observation, découverte, écriture, exécution. */
  handle(msg, remote) {
    const path = messagePath(msg)
    const p = parsePath(path)
    const response = !p || !this.exists(p) ? { code: CODES.NOT_FOUND } : this.respond(msg, remote, p, path)
    this.append({
      remote: `${remote.address}:${remote.port}`,
      method: METHOD_NAMES[msg.code],
      path,
      code: response.code
    })
    return response
  }

  respond(msg, remote, p, path) {
    const def = p.resource !== undefined ? resourceDef(p.object, p.resource) : null

    if (msg.code === CODES.GET) {
      const accept = optionValue(msg, OPTIONS.ACCEPT)
      if (accept === FORMATS.LINK) {
        const links = (
          p.resource !== undefined ? [p.resource] : Object.keys(OBJECTS[p.object].resources).map(Number)
        ).map((id) => ({ href: `/${p.object}/0/${id}` }))
        return {
          code: CODES.CONTENT,
          options: [option(OPTIONS.CONTENT_FORMAT, FORMATS.LINK)],
          payload: Buffer.from(formatLinks(p.depth === 3 ? links : [{ href: `/${p.object}/0` }, ...links]))
        }
      }
      if (def && !def.ops.includes('R')) return { code: CODES.METHOD_NOT_ALLOWED }
      const content = this.encodeRead(p, accept)
      if (content.code) return content
      const options = [option(OPTIONS.CONTENT_FORMAT, content.format)]
      const observe = optionValue(msg, OPTIONS.OBSERVE)
      const key = `${remote.address}:${remote.port}:${msg.token.toString('hex')}`
      if (observe === 0) {
        this.observers.set(key, {
          address: remote.address,
          port: remote.port,
          token: Buffer.from(msg.token),
          path,
          accept,
          seq: 1,
          last: content.payload.toString('hex'),
          lastSent: Date.now()
        })
        options.push(option(OPTIONS.OBSERVE, 1))
        this.event('info', t('coap.device.log.observed', { path, label: pathLabel(path) }))
      } else if (observe === 1) {
        this.observers.delete(key)
      }
      return { code: CODES.CONTENT, options, payload: content.payload }
    }

    if (msg.code === CODES.PUT || (msg.code === CODES.POST && p.depth < 3)) {
      // Écriture d'attributs (pmin, pmax…) : acceptée, sans effet sur les notifications.
      if (!msg.payload.length && optionValues(msg, OPTIONS.URI_QUERY).length) return { code: CODES.CHANGED }
      return this.write(msg, p, path)
    }

    if (msg.code === CODES.POST) {
      if (!def?.ops.includes('E')) return { code: CODES.METHOD_NOT_ALLOWED }
      this.execute(path)
      return { code: CODES.CHANGED }
    }
    return { code: CODES.METHOD_NOT_ALLOWED }
  }

  write(msg, p, path) {
    const format = optionValue(msg, OPTIONS.CONTENT_FORMAT) ?? FORMATS.TEXT
    let entries
    try {
      if (format === FORMATS.TEXT) {
        if (p.depth !== 3) return { code: CODES.BAD_REQUEST }
        const def = resourceDef(p.object, p.resource)
        entries = [{ path, value: parseValue(def.type, msg.payload.toString('utf8')) }]
      } else if (format === FORMATS.TLV || format === FORMATS.SENML_JSON) {
        entries = decodeContent(format, msg.payload, path)
      } else {
        return { code: CODES.UNSUPPORTED_FORMAT }
      }
    } catch {
      return { code: CODES.BAD_REQUEST }
    }
    for (const entry of entries) {
      const e = parsePath(entry.path)
      const def = e && resourceDef(e.object, e.resource)
      if (!def || !this.values.has(entry.path)) return { code: CODES.NOT_FOUND }
      if (!def.ops.includes('W')) return { code: CODES.METHOD_NOT_ALLOWED }
    }
    for (const entry of entries) {
      const e = parsePath(entry.path)
      const def = resourceDef(e.object, e.resource)
      // Valeur décodée sans type (SenML JSON) : convertie selon la ressource.
      let value = entry.value
      if (def.type === 'boolean' && typeof value !== 'boolean') value = parseValue('boolean', value)
      else if ((def.type === 'integer' || def.type === 'time') && typeof value !== 'number')
        value = parseValue(def.type, value)
      this.values.set(entry.path, value)
      this.event('info', t('coap.device.log.written', { label: pathLabel(entry.path), value: displayValue(value) }))
    }
    this.pump()
    return { code: CODES.CHANGED }
  }

  execute(path) {
    this.event('info', t('coap.device.log.executed', { label: pathLabel(path) }))
    if (path === '/3303/0/5605') {
      const value = this.values.get('/3303/0/5700')
      this.values.set('/3303/0/5601', value)
      this.values.set('/3303/0/5602', value)
      this.pump()
    }
    // Redémarrage : nouvel enregistrement après une courte pause, observations perdues.
    if (path === '/3/0/4') {
      setTimeout(() => {
        if (!this.running) return
        this.observers = new Map()
        this.started = Date.now()
        this.initValues()
        this.register()
      }, 1000)
    }
  }

  /** Notifications des observateurs dont le contenu a changé (au plus toutes les secondes). */
  pump() {
    const now = Date.now()
    for (const [key, observer] of this.observers) {
      if (now - observer.lastSent < TICK - 50) continue
      const content = this.encodeRead(parsePath(observer.path), observer.accept)
      if (content.code) continue
      const hex = content.payload.toString('hex')
      if (hex === observer.last) continue
      observer.last = hex
      observer.lastSent = now
      observer.seq = (observer.seq + 1) & 0xffffff
      this.endpoint.notify(
        observer,
        {
          code: CODES.CONTENT,
          options: [option(OPTIONS.OBSERVE, observer.seq), option(OPTIONS.CONTENT_FORMAT, content.format)],
          payload: content.payload
        },
        {
          onFail: () => {
            if (this.observers.delete(key))
              this.event('warn', t('coap.device.log.observerGone', { path: observer.path }))
          }
        }
      )
    }
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
