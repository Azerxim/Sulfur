import { randomBytes } from 'crypto'
import {
  CODES,
  CODE_LABELS,
  FORMATS,
  METHOD_NAMES,
  OPTIONS,
  codeName,
  formatName,
  isSuccess,
  messagePath,
  messageQuery,
  option,
  optionValue,
  parseLinks,
  payloadText,
  uriOptions
} from '../shared/codec'
import { DEFAULT_LWM2M_SERVER_CONFIG, LOG_PAYLOAD, MAX_LOG, READ_FORMATS } from '../shared/constants'
import {
  decodeContent,
  displayValue,
  parsePath,
  parseValue,
  pathLabel,
  resourceDef,
  valueToText
} from '../shared/lwm2m'
import { CoapEndpoint } from './endpoint'
import { translateBindError } from './server'
import { t } from '../shared/i18n'

const EMIT_INTERVAL = 200
const EXPIRY_CHECK = 5000
/** Délai d'attente des opérations envoyées aux appareils (ms). */
const OPERATION_TIMEOUT = 15_000

/** Objets annoncés par un appareil : liens « </3/0>,</3303/0> » (le lien racine « </> » est ignoré). */
const objectLinks = (payload) =>
  parseLinks(payload.toString('utf8'))
    .map((l) => l.href)
    .filter((href) => parsePath(href))

const describeCode = (value) => `${codeName(value)} ${CODE_LABELS[value] ?? ''}`.trim()

/**
 * Serveur LwM2M (interface d'enregistrement, OMA LwM2M 1.0 / 1.1) : les appareils s'enregistrent
 * (POST /rd?ep=…&lt=…), se mettent à jour (POST /rd/<id>) et se désenregistrent (DELETE /rd/<id>) ;
 * un enregistrement non mis à jour expire après sa durée. Opérations sur un appareil enregistré :
 * lecture (TLV, SenML JSON ou texte), écriture, exécution, découverte et observation.
 */
export class Lwm2mServer {
  endpoint = null
  config = null
  /** Enregistrements : id → { id, endpoint, lifetime, binding, version, address, port, objects, … }. */
  registrations = new Map()
  /** Observations en cours : jeton → { token, registration, endpoint, path, since, count, values }. */
  observations = new Map()
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

  status() {
    return {
      running: this.running,
      endpoint: this.running ? `coap://${this.config.host}:${this.config.port}` : null,
      config: this.config,
      // Appareils enregistrés : affichés comme sessions dans la barre latérale et la vue d'ensemble.
      sessions: this.registrations.size,
      registrations: [...this.registrations.values()],
      observations: [...this.observations.values()]
    }
  }

  emitStatus() {
    this.onStatus(this.status())
  }

  async start(options) {
    if (this.running) throw new Error(t('coap.errors.serverRunning'))
    const config = { ...DEFAULT_LWM2M_SERVER_CONFIG, ...options }
    const port = Number(config.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(t('coap.errors.invalidPort'))
    const endpoint = new CoapEndpoint({ onRequest: (msg, remote) => this.handle(msg, remote) })
    try {
      await endpoint.bind(port, config.host || '0.0.0.0')
    } catch (err) {
      throw translateBindError(err, port)
    }
    this.endpoint = endpoint
    this.config = { ...config, port }
    this.registrations = new Map()
    this.observations = new Map()
    this.timers.push(
      setInterval(() => this.expire(), EXPIRY_CHECK),
      setInterval(() => this.flush(), EMIT_INTERVAL)
    )
    this.event('info', t('coap.lwm2m.log.started', { endpoint: this.status().endpoint }))
    this.emitStatus()
    return this.status()
  }

  async stop() {
    if (!this.running) return this.status()
    for (const timer of this.timers) clearInterval(timer)
    this.timers = []
    const endpoint = this.endpoint
    this.endpoint = null
    this.registrations = new Map()
    this.observations = new Map()
    await endpoint.close()
    this.event('info', t('coap.lwm2m.log.stopped'))
    this.flush()
    this.emitStatus()
    return this.status()
  }

  /** Enregistrements expirés (non mis à jour pendant leur durée) retirés. */
  expire() {
    const now = Date.now()
    let changed = false
    for (const reg of [...this.registrations.values()]) {
      if (reg.updatedAt + reg.lifetime * 1000 >= now) continue
      this.forget(reg)
      this.event('warn', t('coap.lwm2m.log.expired', { endpoint: reg.endpoint }))
      changed = true
    }
    if (changed) this.emitStatus()
  }

  forget(reg) {
    this.registrations.delete(reg.id)
    for (const [token, observation] of this.observations) {
      if (observation.registration !== reg.id) continue
      this.endpoint?.cancelObservation(token)
      this.observations.delete(token)
    }
  }

  /** Requête d'un appareil : interface d'enregistrement (/rd). */
  handle(msg, remote) {
    const path = messagePath(msg)
    const segments = path.split('/').filter(Boolean)
    if (segments[0] !== 'rd' || segments.length > 2) return { code: CODES.NOT_FOUND }
    const query = messageQuery(msg)

    if (segments.length === 1) {
      if (msg.code !== CODES.POST) return { code: CODES.METHOD_NOT_ALLOWED }
      if (!query.ep) return { code: CODES.BAD_REQUEST, payload: Buffer.from('Missing endpoint name (ep)') }
      // Un appareil qui se réenregistre remplace son enregistrement précédent.
      for (const reg of [...this.registrations.values()]) if (reg.endpoint === query.ep) this.forget(reg)
      const reg = {
        id: randomBytes(3).toString('hex'),
        endpoint: query.ep,
        lifetime: Number(query.lt) > 0 ? Number(query.lt) : 86400,
        binding: query.b || 'U',
        version: query.lwm2m || '1.0',
        address: remote.address,
        port: remote.port,
        objects: objectLinks(msg.payload),
        registeredAt: Date.now(),
        updatedAt: Date.now()
      }
      this.registrations.set(reg.id, reg)
      this.event(
        'info',
        t('coap.lwm2m.log.registered', {
          endpoint: reg.endpoint,
          remote: `${remote.address}:${remote.port}`,
          lifetime: reg.lifetime
        })
      )
      this.emitStatus()
      return {
        code: CODES.CREATED,
        options: [option(OPTIONS.LOCATION_PATH, 'rd'), option(OPTIONS.LOCATION_PATH, reg.id)]
      }
    }

    const reg = this.registrations.get(segments[1])
    if (!reg) return { code: CODES.NOT_FOUND }
    if (msg.code === CODES.POST) {
      if (Number(query.lt) > 0) reg.lifetime = Number(query.lt)
      if (query.b) reg.binding = query.b
      if (msg.payload.length) reg.objects = objectLinks(msg.payload)
      Object.assign(reg, { address: remote.address, port: remote.port, updatedAt: Date.now() })
      this.event('info', t('coap.lwm2m.log.updated', { endpoint: reg.endpoint }))
      this.emitStatus()
      return { code: CODES.CHANGED }
    }
    if (msg.code === CODES.DELETE) {
      this.forget(reg)
      this.event('info', t('coap.lwm2m.log.deregistered', { endpoint: reg.endpoint }))
      this.emitStatus()
      return { code: CODES.DELETED }
    }
    return { code: CODES.METHOD_NOT_ALLOWED }
  }

  // --- Opérations sur les appareils ---------------------------------------------------------------

  registration(id) {
    const reg = this.registrations.get(id)
    if (!this.running || !reg) throw new Error(t('coap.lwm2m.errors.unknownDevice'))
    return reg
  }

  /** Requête vers un appareil, enregistrée dans le journal ; erreurs traduites. */
  async operation(id, op, path, { code, options = [], payload, onNotify = null }) {
    const reg = this.registration(id)
    if (!parsePath(path)) throw new Error(t('coap.lwm2m.errors.invalidPath', { path }))
    try {
      const result = await this.endpoint.request({
        address: reg.address,
        port: reg.port,
        code,
        options: [...uriOptions(path), ...options],
        payload,
        timeout: OPERATION_TIMEOUT,
        onNotify
      })
      const format = optionValue(result.msg, OPTIONS.CONTENT_FORMAT)
      this.append({
        op,
        endpoint: reg.endpoint,
        path,
        method: METHOD_NAMES[code],
        code: result.msg.code,
        format: format === undefined ? null : formatName(format),
        payload: payloadText(result.msg.payload).slice(0, LOG_PAYLOAD),
        rtt: result.rtt
      })
      return result
    } catch (err) {
      const message =
        err.code === 'timeout'
          ? t('coap.lwm2m.errors.timeout', { endpoint: reg.endpoint })
          : err.code === 'reset'
            ? t('coap.lwm2m.errors.reset', { endpoint: reg.endpoint })
            : err.message
      this.append({ op, endpoint: reg.endpoint, path, method: METHOD_NAMES[code], error: message })
      throw new Error(message, { cause: err })
    }
  }

  /** Résultat d'une opération pour l'interface : code, format, valeurs décodées ou contenu brut. */
  result(msg, path) {
    const format = optionValue(msg, OPTIONS.CONTENT_FORMAT)
    const out = {
      code: describeCode(msg.code),
      ok: isSuccess(msg.code),
      format: format === undefined ? null : formatName(format)
    }
    if (!msg.payload.length) return out
    if (format === FORMATS.LINK) return { ...out, links: parseLinks(msg.payload.toString('utf8')) }
    if (!isSuccess(msg.code)) return { ...out, text: payloadText(msg.payload) }
    try {
      const values = decodeContent(format, msg.payload, path).map(({ path: p, value }) => ({
        path: p,
        label: pathLabel(p),
        value: displayValue(value)
      }))
      return { ...out, values }
    } catch {
      return { ...out, text: payloadText(msg.payload) }
    }
  }

  async read(id, path, format = FORMATS.TLV) {
    if (!READ_FORMATS.includes(Number(format))) throw new Error(t('coap.errors.invalidFormat'))
    const { msg } = await this.operation(id, 'read', path, {
      code: CODES.GET,
      options: [option(OPTIONS.ACCEPT, Number(format))]
    })
    return this.result(msg, path)
  }

  /** Écriture d'une ressource en texte (valeur convertie selon le type de la ressource s'il est connu). */
  async write(id, path, raw) {
    const p = parsePath(path)
    if (!p || p.depth !== 3) throw new Error(t('coap.lwm2m.errors.writeResource'))
    const def = resourceDef(p.object, p.resource)
    let value
    try {
      value = def ? parseValue(def.type, raw) : String(raw)
    } catch {
      throw new Error(t('coap.lwm2m.errors.invalidValue', { value: raw }))
    }
    const { msg } = await this.operation(id, 'write', path, {
      code: CODES.PUT,
      options: [option(OPTIONS.CONTENT_FORMAT, FORMATS.TEXT)],
      payload: Buffer.from(valueToText(value))
    })
    return this.result(msg, path)
  }

  async execute(id, path, args = '') {
    const p = parsePath(path)
    if (!p || p.depth !== 3) throw new Error(t('coap.lwm2m.errors.executeResource'))
    const { msg } = await this.operation(id, 'execute', path, {
      code: CODES.POST,
      payload: args ? Buffer.from(String(args)) : undefined
    })
    return this.result(msg, path)
  }

  async discover(id, path) {
    const { msg } = await this.operation(id, 'discover', path, {
      code: CODES.GET,
      options: [option(OPTIONS.ACCEPT, FORMATS.LINK)]
    })
    return this.result(msg, path)
  }

  async observe(id, path, format = FORMATS.TLV) {
    const reg = this.registration(id)
    let token = null
    const { msg, token: key } = await this.operation(id, 'observe', path, {
      code: CODES.GET,
      options: [option(OPTIONS.OBSERVE, 0), option(OPTIONS.ACCEPT, Number(format))],
      onNotify: (notification) => this.notification(token, notification)
    })
    token = key
    const result = this.result(msg, path)
    if (optionValue(msg, OPTIONS.OBSERVE) !== undefined && result.ok) {
      this.observations.set(key, {
        token: key,
        registration: id,
        endpoint: reg.endpoint,
        path,
        label: pathLabel(path),
        since: Date.now(),
        count: 0,
        values: result.values ?? []
      })
      this.emitStatus()
    } else {
      result.notObservable = true
    }
    return result
  }

  notification(token, msg) {
    const observation = this.observations.get(token)
    if (!observation) return
    const result = this.result(msg, observation.path)
    observation.count++
    observation.values = result.values ?? observation.values
    observation.updatedAt = Date.now()
    this.append({
      op: 'notify',
      endpoint: observation.endpoint,
      path: observation.path,
      code: msg.code,
      format: result.format,
      payload: (result.values ?? []).map((v) => `${v.path} = ${v.value}`).join(', ') || result.text || ''
    })
    if (optionValue(msg, OPTIONS.OBSERVE) === undefined || !result.ok) this.observations.delete(token)
    this.emitStatus()
  }

  cancelObservation(token) {
    this.endpoint?.cancelObservation(token)
    this.observations.delete(token)
    this.emitStatus()
    return this.status()
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
