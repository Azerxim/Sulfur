import net from 'net'
import {
  CODE_LABELS,
  FORMATS,
  METHODS,
  OPTIONS,
  codeName,
  formatName,
  option,
  optionValue,
  parseLinks,
  payloadText,
  uriOptions
} from '../shared/codec'
import { DEFAULT_CLIENT_CONFIG, LOG_PAYLOAD, MAX_LOG } from '../shared/constants'
import { CoapEndpoint } from './endpoint'
import { t } from '../shared/i18n'

/** Réglages d'une requête validés. */
export function normalizeRequest(options) {
  const config = { ...DEFAULT_CLIENT_CONFIG, ...options }
  const host = String(config.host ?? '').trim()
  const port = Number(config.port)
  const timeout = Number(config.timeout)
  if (!host) throw new Error(t('coap.errors.missingHost'))
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(t('coap.errors.invalidPort'))
  if (!METHODS[config.method]) throw new Error(t('coap.errors.invalidMethod'))
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 300) throw new Error(t('coap.errors.invalidTimeout'))
  const path = `/${String(config.path ?? '')
    .trim()
    .replace(/^\/+/, '')}`
  return {
    ...config,
    host,
    port,
    path,
    timeout,
    format: Number(config.format),
    accept: config.accept === '' || config.accept === null ? '' : Number(config.accept)
  }
}

/** Contenu d'une requête : texte, ou octets saisis en hexadécimal pour application/octet-stream. */
function requestPayload({ method, format, payload }) {
  if (method !== 'POST' && method !== 'PUT') return undefined
  const text = String(payload ?? '')
  if (format !== FORMATS.OCTETS) return text ? Buffer.from(text) : undefined
  const hex = text.replace(/0x/gi, '').replace(/[\s,:-]/g, '')
  if (!/^([0-9a-f]{2})*$/i.test(hex)) throw new Error(t('coap.errors.invalidHex'))
  return Buffer.from(hex, 'hex')
}

/** URI affichée d'une requête : « coap://host:port/path?query ». */
const uriOf = ({ host, port, path, query }) =>
  `coap://${net.isIPv6(host) ? `[${host}]` : host}:${port}${path}${query ? `?${String(query).replace(/^\?/, '')}` : ''}`

/** Réponse (ou notification) résumée pour l'historique. */
function describeResponse(msg) {
  const format = optionValue(msg, OPTIONS.CONTENT_FORMAT)
  return {
    code: msg.code,
    codeName: `${codeName(msg.code)} ${CODE_LABELS[msg.code] ?? ''}`.trim(),
    format: format === undefined ? null : formatName(format),
    observe: optionValue(msg, OPTIONS.OBSERVE) ?? null,
    payload: payloadText(msg.payload).slice(0, LOG_PAYLOAD),
    size: msg.payload.length
  }
}

/**
 * Client CoAP : requêtes GET / POST / PUT / DELETE confirmables ou non, découverte des ressources
 * (/.well-known/core) et observations (RFC 7641), avec l'historique des échanges. Un socket par
 * famille d'adresses, ouvert à la première requête.
 */
export class CoapClient {
  endpoints = {}
  history = []
  nextId = 1
  /** Observations en cours : jeton → { token, uri, since, count, last }. */
  observations = new Map()

  constructor({ onStatus = () => {}, onEntry = () => {} } = {}) {
    this.onStatus = onStatus
    this.onEntry = onEntry
  }

  status() {
    return {
      // Client actif tant qu'il observe une ressource.
      connected: this.observations.size > 0,
      observations: [...this.observations.values()]
    }
  }

  async endpoint(host) {
    const family = net.isIPv6(host) ? 'udp6' : 'udp4'
    if (!this.endpoints[family]) {
      const endpoint = new CoapEndpoint()
      await endpoint.bind(0, family === 'udp6' ? '::' : '0.0.0.0')
      this.endpoints[family] = endpoint
    }
    return this.endpoints[family]
  }

  record(entry) {
    const full = { id: this.nextId++, time: Date.now(), ...entry }
    this.history.push(full)
    if (this.history.length > MAX_LOG) this.history.splice(0, this.history.length - MAX_LOG)
    this.onEntry(full)
    return full
  }

  /** Échange : requête envoyée, réponse ou erreur enregistrée dans l'historique. */
  async exchange(config, { observe = false, path } = {}) {
    const request = normalizeRequest(path ? { ...config, method: 'GET', path, query: '' } : config)
    const payload = requestPayload(request)
    const options = [
      ...uriOptions(request.path, request.query),
      ...(payload ? [option(OPTIONS.CONTENT_FORMAT, request.format)] : []),
      ...(request.accept !== '' ? [option(OPTIONS.ACCEPT, request.accept)] : []),
      ...(observe ? [option(OPTIONS.OBSERVE, 0)] : [])
    ]
    const uri = uriOf(request)
    const base = { method: request.method, uri, type: request.confirmable ? 'CON' : 'NON', observe }
    const endpoint = await this.endpoint(request.host)
    let tokenKey = null
    try {
      const { msg, rtt, token } = await endpoint.request({
        address: request.host,
        port: request.port,
        code: METHODS[request.method],
        options,
        payload,
        confirmable: request.confirmable,
        timeout: request.timeout * 1000,
        onNotify: observe ? (notification) => this.notification(tokenKey, notification) : null
      })
      tokenKey = token
      const response = describeResponse(msg)
      if (observe) {
        if (response.observe !== null) {
          this.observations.set(token, { token, uri, since: Date.now(), count: 0, last: response })
          this.onStatus(this.status())
        } else {
          response.notObservable = true
        }
      }
      return { entry: this.record({ ...base, ...response, rtt }), msg }
    } catch (err) {
      const message =
        err.code === 'timeout'
          ? t('coap.client.errors.timeout', { uri, timeout: request.timeout })
          : err.code === 'reset'
            ? t('coap.client.errors.reset', { uri })
            : err.message
      this.record({ ...base, error: message })
      throw new Error(message, { cause: err })
    }
  }

  async request(config) {
    return (await this.exchange(config)).entry
  }

  /** Ressources annoncées par /.well-known/core : { entry, links: [{ href, attrs }] }. */
  async discover(config) {
    const { entry, msg } = await this.exchange({ ...config, accept: FORMATS.LINK }, { path: '/.well-known/core' })
    return { entry, links: msg.code >> 5 === 2 ? parseLinks(msg.payload.toString('utf8')) : [] }
  }

  async observe(config) {
    return (await this.exchange({ ...config, method: 'GET' }, { observe: true })).entry
  }

  notification(token, msg) {
    const observation = this.observations.get(token)
    if (!observation) return
    const response = describeResponse(msg)
    observation.count++
    observation.last = response
    this.record({ method: 'GET', uri: observation.uri, type: 'NOTIFY', notification: true, ...response })
    if (response.observe === null || msg.code >> 5 !== 2) this.observations.delete(token)
    this.onStatus(this.status())
  }

  /** Fin d'une observation : les notifications suivantes sont refusées (RST). */
  cancel(token) {
    for (const endpoint of Object.values(this.endpoints)) endpoint.cancelObservation(token)
    this.observations.delete(token)
    this.onStatus(this.status())
    return this.status()
  }

  clear() {
    this.history = []
    return this.history
  }

  async dispose() {
    this.observations.clear()
    await Promise.all(Object.values(this.endpoints).map((e) => e.close()))
    this.endpoints = {}
  }
}
