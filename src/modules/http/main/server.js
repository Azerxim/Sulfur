import http from 'http'
import https from 'https'
import { randomUUID, timingSafeEqual } from 'crypto'
import { simulate } from '@azerxim/sulfur-sdk'
import { hashPassword, isPasswordHash, verifyPassword } from '@azerxim/sulfur-sdk/main'
import {
  DATA_TYPES,
  DEFAULT_SERVER_AUTH,
  LOG_BODY,
  MAX_BODY,
  MAX_LOG,
  NUMERIC_TYPES,
  ROUTE_METHODS
} from '../shared/constants'
import { VARIABLE_NAME, coerce, getPath, matchPath, renderTemplate } from '../shared/template'
import { t } from '../shared/i18n'
import { headerObject, httpRequest } from './request'

const VALUES_EMIT_INTERVAL = 250
export const SERVER_COMMON_NAME = 'HTTP@Sulfur'

const clip = (text) => {
  const s = String(text ?? '')
  return s.length > LOG_BODY ? `${s.slice(0, LOG_BODY)}…` : s
}

/** Comparaison en temps constant de deux secrets. */
function sameSecret(a, b) {
  const x = Buffer.from(String(a ?? ''))
  const y = Buffer.from(String(b ?? ''))
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y)
}

/** Vérifie une variable : nom utilisable dans une URL, type connu. */
export function validateVariable(def) {
  if (!VARIABLE_NAME.test(def.name ?? '')) throw new Error(t('http.errors.invalidName', { name: def.name ?? '' }))
  if (!DATA_TYPES.includes(def.dataType)) throw new Error(t('http.errors.unknownType', { type: def.dataType }))
}

/** Vérifie une route : méthode, chemin commençant par « / », code HTTP valide. */
export function validateRoute(route) {
  if (!ROUTE_METHODS.includes(route.method)) throw new Error(t('http.errors.invalidMethod', { method: route.method }))
  if (!String(route.path ?? '').startsWith('/'))
    throw new Error(t('http.errors.invalidPath', { path: route.path ?? '' }))
  const status = Number(route.status)
  if (!Number.isInteger(status) || status < 100 || status > 599)
    throw new Error(t('http.errors.invalidStatus', { status: route.status }))
}

/** Vérifie un webhook : URL http(s) valide. */
export function validateWebhook(hook) {
  let url
  try {
    url = new URL(hook.url)
  } catch {
    throw new Error(t('http.errors.invalidUrl', { url: hook.url ?? '' }))
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(t('http.errors.invalidUrl', { url: hook.url }))
}

/** Valeur initiale d'une variable, convertie dans son type (valeur vide : 0, false ou ''). */
function initialValue(def) {
  try {
    return coerce(def.initialValue, def.dataType)
  } catch {
    return def.dataType === 'Boolean' ? false : def.dataType === 'String' ? '' : def.dataType === 'JSON' ? null : 0
  }
}

/**
 * Serveur HTTP / HTTPS simulé :
 *  - variables simulées (sinus, rampe…) exposées par une API REST intégrée :
 *    GET <base>/variables, GET <base>/variables/<nom>, PUT / PATCH / POST <base>/variables/<nom> ;
 *  - routes personnalisées (méthode, chemin à paramètres, code, en-têtes, gabarit de réponse, délai),
 *    pouvant affecter une variable à partir de la requête ;
 *  - authentification Basic (mots de passe hachés), Bearer ou clé d'API ; en-têtes CORS ;
 *  - webhooks : appels sortants sur changement de variables ou périodiques ;
 *  - défauts injectés par le simulateur (délai, absence de réponse, coupure, code forcé, valeurs figées).
 */
export class HttpServer {
  server = null
  config = null
  certificate = null
  /** id -> { def, value, timestamp } */
  variables = new Map()
  sockets = new Set()
  logEntries = []
  faults = []
  requests = 0
  simTimer = null
  emitTimer = null
  /** id du webhook -> { timer, last (valeurs envoyées), sentAt } */
  hooks = new Map()

  /** `loadCertificate()` : { cert, key, info } du certificat du serveur HTTPS. */
  constructor(loadCertificate, { onStatus = () => {}, onValues = () => {}, onLog = () => {} } = {}) {
    this.loadCertificate = loadCertificate
    this.onStatus = onStatus
    this.onValues = onValues
    this.onLog = onLog
  }

  status() {
    return {
      running: !!this.server,
      url: this.server ? `${this.config.https ? 'https' : 'http'}://${this.displayHost()}:${this.config.port}` : null,
      config: this.config,
      certificate: this.server && this.config.https ? this.certificate : null,
      requests: this.requests
    }
  }

  displayHost() {
    const host = this.config.host || '0.0.0.0'
    return host === '0.0.0.0' || host === '::' ? 'localhost' : host
  }

  values() {
    return Object.fromEntries([...this.variables].map(([id, v]) => [id, v.value]))
  }

  logs() {
    return this.logEntries
  }

  clearLogs() {
    this.logEntries = []
    return []
  }

  log(entry) {
    const full = { id: randomUUID(), time: new Date().toISOString(), ...entry }
    this.logEntries.push(full)
    if (this.logEntries.length > MAX_LOG) this.logEntries.splice(0, this.logEntries.length - MAX_LOG)
    this.onLog(full)
  }

  // --- Démarrage / arrêt --------------------------------------------------------

  async start(input) {
    if (this.server) throw new Error(t('errors.alreadyStarted'))
    const port = Number(input.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(t('http.errors.invalidPort'))
    const variables = (input.variables ?? []).map((v) => ({ ...v, id: v.id ?? randomUUID() }))
    variables.forEach(validateVariable)
    this.checkUnique(variables)
    const routes = (input.routes ?? []).map((r) => ({ ...r, id: r.id ?? randomUUID() }))
    routes.forEach(validateRoute)
    const webhooks = (input.webhooks ?? []).map((w) => ({ ...w, id: w.id ?? randomUUID() }))
    webhooks.filter((w) => w.enabled !== false).forEach(validateWebhook)
    const auth = await this.prepareAuth({ ...DEFAULT_SERVER_AUTH, ...input.auth })
    const basePath = `/${String(input.basePath ?? '/api').replace(/^\/+|\/+$/g, '')}`.replace(/^\/$/, '')

    this.config = { ...input, port, basePath, variables, routes, webhooks, auth }
    this.variables.clear()
    for (const def of variables) this.variables.set(def.id, { def, value: initialValue(def), timestamp: Date.now() })

    const handler = (req, res) => this.onRequest(req, res)
    let server
    if (input.https) {
      const { cert, key, info } = await this.loadCertificate()
      this.certificate = info
      server = https.createServer({ cert, key, minVersion: 'TLSv1.2' }, handler)
    } else {
      server = http.createServer(handler)
    }
    server.on('connection', (socket) => {
      if (this.fault('cut')) return socket.destroy()
      this.sockets.add(socket)
      socket.on('close', () => this.sockets.delete(socket))
    })
    server.on('clientError', (_err, socket) => socket.destroy())
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, input.host || '0.0.0.0', () => {
          server.off('error', reject)
          resolve()
        })
      })
    } catch (err) {
      if (err.code === 'EACCES') throw new Error(t('http.errors.portPrivileged', { port }), { cause: err })
      if (err.code === 'EADDRINUSE') throw new Error(t('http.errors.portInUse', { port }), { cause: err })
      throw err
    }

    this.server = server
    this.requests = 0
    this.t0 = Date.now()
    this.startSimulation()
    this.startWebhooks()
    this.emitTimer = setInterval(() => this.onValues(this.values()), VALUES_EMIT_INTERVAL)
    this.onStatus(this.status())
    return this.status()
  }

  async stop() {
    const server = this.server
    clearInterval(this.simTimer)
    clearInterval(this.emitTimer)
    this.simTimer = this.emitTimer = null
    this.stopWebhooks()
    this.server = null
    for (const socket of this.sockets) socket.destroy()
    this.sockets.clear()
    if (server) await new Promise((resolve) => server.close(() => resolve()))
    this.onStatus(this.status())
    return this.status()
  }

  requireRunning() {
    if (!this.server) throw new Error(t('errors.notStarted'))
  }

  /** Mots de passe Basic hachés : seule l'empreinte est conservée. */
  async prepareAuth(auth) {
    const users = []
    for (const u of auth.users ?? []) {
      if (!u.username?.trim()) continue
      const passwordHash = isPasswordHash(u.passwordHash)
        ? u.passwordHash
        : u.password
          ? await hashPassword(u.password)
          : null
      if (!passwordHash) throw new Error(t('http.errors.userWithoutPassword', { name: u.username }))
      users.push({ username: u.username.trim(), passwordHash })
    }
    if (auth.type === 'basic' && !users.length) throw new Error(t('http.errors.basicNeedsUser'))
    if (auth.type === 'bearer' && !auth.token) throw new Error(t('http.errors.bearerNeedsToken'))
    if (auth.type === 'apiKey' && (!auth.apiKey || !auth.headerName)) throw new Error(t('http.errors.apiKeyNeedsKey'))
    return { ...auth, users }
  }

  // --- Traitement des requêtes -------------------------------------------------------

  /** Défaut actif d'un type donné. */
  fault(type) {
    return this.faults.find((f) => f.type === type)
  }

  setFaults(faults = []) {
    const wasCut = !!this.fault('cut')
    this.faults = faults
    if (this.server && !wasCut && this.fault('cut')) {
      for (const socket of this.sockets) socket.destroy()
    }
  }

  onRequest(req, res) {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size <= MAX_BODY) chunks.push(chunk)
    })
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      this.handle(req, res, body, size > MAX_BODY).catch((err) => {
        if (!res.headersSent) this.reply(res, 500, { error: err.message })
      })
    })
  }

  async handle(req, res, body, tooLarge) {
    const started = Date.now()
    this.requests++
    const url = new URL(req.url, 'http://localhost')
    const entry = {
      direction: 'in',
      remote: `${req.socket.remoteAddress?.replace(/^::ffff:/, '')}:${req.socket.remotePort}`,
      method: req.method,
      path: url.pathname + url.search,
      requestBody: clip(body)
    }

    if (this.fault('noResponse')) {
      this.log({ ...entry, status: null, note: t('http.log.noResponse') })
      return
    }
    const delay = Number(this.fault('delay')?.params?.ms) || 0
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
    if (!this.server) return

    const result = await this.route(req, url, body, tooLarge)
    const headers = { ...result.headers }
    if (this.config.cors) {
      headers['access-control-allow-origin'] = '*'
      headers['access-control-allow-methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
      headers['access-control-allow-headers'] = '*'
    }
    if (result.delay > 0) await new Promise((resolve) => setTimeout(resolve, result.delay))
    if (res.destroyed) return
    this.reply(res, result.status, result.body, headers, result.contentType)
    this.log({
      ...entry,
      status: result.status,
      duration: Date.now() - started,
      responseBody: clip(typeof result.body === 'string' ? result.body : JSON.stringify(result.body)),
      note: result.note
    })
  }

  reply(res, status, body, headers = {}, contentType) {
    const text = typeof body === 'string' ? body : body === undefined ? '' : JSON.stringify(body)
    res.writeHead(status, {
      'content-type': contentType ?? (typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json'),
      ...headers
    })
    res.end(text)
  }

  /** Réponse à une requête : { status, body, headers, contentType, delay, note }. */
  async route(req, url, body, tooLarge) {
    if (tooLarge) return { status: 413, body: { error: t('http.errors.tooLarge') } }
    if (req.method === 'OPTIONS' && this.config.cors) return { status: 204, body: '' }

    const denied = await this.authenticate(req)
    if (denied) return denied

    let json
    if (body) {
      try {
        json = JSON.parse(body)
      } catch {
        json = undefined
      }
    }
    const path = url.pathname

    // API intégrée des variables.
    if (this.config.api) {
      const params = matchPath(`${this.config.basePath}/variables/:name`, path)
      if (params || matchPath(`${this.config.basePath}/variables`, path)) {
        const forced = this.forcedStatus(params ? [params.name] : null)
        if (forced) return forced
        return this.variablesApi(req.method, params?.name, body, json)
      }
    }

    for (const route of this.config.routes) {
      if (route.method !== 'ANY' && route.method !== req.method) continue
      const params = matchPath(route.path, path)
      if (!params) continue
      const forced = this.forcedStatus(this.routeVariables(route))
      if (forced) return forced
      const query = Object.fromEntries(url.searchParams)
      const context = { params, query, headers: req.headers, body, json }
      if (route.setVariable) {
        const variable = this.variables.get(route.setVariable)
        if (variable) {
          const [root, ...rest] = String(route.source || 'body').split('.')
          const source = root === 'body' ? (rest.length ? json : (json ?? body)) : context[root]
          const value = getPath(source, rest.join('.'))
          if (value === undefined)
            return { status: 400, body: { error: t('http.errors.missingValue', { source: route.source || 'body' }) } }
          try {
            this.assign(variable, value)
          } catch (err) {
            return { status: 400, body: { error: err.message } }
          }
        }
      }
      context.variables = this.namedValues()
      return {
        status: Number(route.status),
        body: renderTemplate(route.body, context),
        contentType: route.contentType || 'application/json',
        headers: headerObject(route.headers),
        delay: Number(route.delay) || 0
      }
    }
    return { status: 404, body: { error: t('http.errors.notFound', { path }) } }
  }

  /** Code d'état forcé par le simulateur (toutes les requêtes, ou celles qui concernent ces variables). */
  forcedStatus(names) {
    const forced = this.faults.find((f) => {
      if (f.type !== 'badStatus') return false
      if (!f.points?.length) return true
      if (!names) return true
      return f.points.some((id) => names.includes(this.variables.get(id)?.def.name))
    })
    if (!forced) return null
    const status = Number(forced.params?.code) || 500
    return { status, body: { error: http.STATUS_CODES[status] ?? String(status) }, note: t('http.log.forced') }
  }

  /** Variables utilisées par une route (gabarit et variable affectée). */
  routeVariables(route) {
    const names = [...String(route.body ?? '').matchAll(/\{\{\s*var\.([\w-]+)\s*\}\}/g)].map((m) => m[1])
    const target = this.variables.get(route.setVariable)?.def.name
    return target ? [...names, target] : names
  }

  async authenticate(req) {
    const auth = this.config.auth
    const header = req.headers.authorization ?? ''
    const fail = (scheme) => ({
      status: 401,
      body: { error: t('http.errors.unauthorized') },
      headers: scheme ? { 'www-authenticate': scheme } : {},
      note: t('http.log.unauthorized')
    })
    switch (auth.type) {
      case 'basic': {
        const [scheme, encoded] = header.split(' ')
        if (scheme !== 'Basic' || !encoded) return fail('Basic realm="Sulfur"')
        const decoded = Buffer.from(encoded, 'base64').toString('utf8')
        const i = decoded.indexOf(':')
        const user = auth.users.find((u) => u.username === decoded.slice(0, i))
        if (!user || !(await verifyPassword(decoded.slice(i + 1), user.passwordHash)))
          return fail('Basic realm="Sulfur"')
        return null
      }
      case 'bearer':
        return header.startsWith('Bearer ') && sameSecret(header.slice(7), auth.token) ? null : fail('Bearer')
      case 'apiKey':
        return sameSecret(req.headers[auth.headerName.toLowerCase()], auth.apiKey) ? null : fail(null)
      default:
        return null
    }
  }

  describeVariable({ def, value, timestamp }) {
    return {
      name: def.name,
      value,
      dataType: def.dataType,
      writable: !!def.writable,
      timestamp: new Date(timestamp).toISOString()
    }
  }

  variablesApi(method, name, body, json) {
    if (!name) {
      if (method !== 'GET') return { status: 405, body: { error: t('http.errors.methodNotAllowed', { method }) } }
      return { status: 200, body: [...this.variables.values()].map((v) => this.describeVariable(v)) }
    }
    const variable = [...this.variables.values()].find((v) => v.def.name === name)
    if (!variable) return { status: 404, body: { error: t('http.errors.unknownVariable', { name }) } }
    if (method === 'GET') return { status: 200, body: this.describeVariable(variable) }
    if (!['PUT', 'PATCH', 'POST'].includes(method))
      return { status: 405, body: { error: t('http.errors.methodNotAllowed', { method }) } }
    if (!variable.def.writable) return { status: 403, body: { error: t('http.errors.readOnly', { name }) } }
    // Corps { "value": … }, ou valeur seule (JSON ou texte).
    const value =
      json !== undefined && json !== null && typeof json === 'object' && 'value' in json ? json.value : (json ?? body)
    try {
      this.assign(variable, value)
    } catch (err) {
      return { status: 400, body: { error: err.message } }
    }
    return { status: 200, body: this.describeVariable(variable) }
  }

  namedValues() {
    return Object.fromEntries([...this.variables.values()].map((v) => [v.def.name, v.value]))
  }

  assign(variable, raw) {
    variable.value = coerce(raw, variable.def.dataType)
    variable.timestamp = Date.now()
  }

  // --- Variables (modifiables à chaud) ---------------------------------------------

  checkUnique(variables) {
    const names = variables.map((v) => v.name)
    const duplicate = names.find((n, i) => names.indexOf(n) !== i)
    if (duplicate) throw new Error(t('http.errors.variableExists', { name: duplicate }))
  }

  syncConfig() {
    this.config = { ...this.config, variables: [...this.variables.values()].map((v) => v.def) }
  }

  changed() {
    this.onStatus(this.status())
    return this.status()
  }

  upsertVariable(def) {
    this.requireRunning()
    const next = { ...def, id: def.id ?? randomUUID() }
    validateVariable(next)
    this.checkUnique([...[...this.variables.values()].map((v) => v.def).filter((d) => d.id !== next.id), next])
    const current = this.variables.get(next.id)
    if (current && current.def.dataType === next.dataType) current.def = next
    else this.variables.set(next.id, { def: next, value: initialValue(next), timestamp: Date.now() })
    this.syncConfig()
    return this.changed()
  }

  removeVariable(id) {
    this.requireRunning()
    this.variables.delete(id)
    this.syncConfig()
    return this.changed()
  }

  setValue(id, raw) {
    this.requireRunning()
    const variable = this.variables.get(id)
    if (!variable) throw new Error(t('http.errors.unknownVariable', { name: id }))
    this.assign(variable, raw)
    this.onValues(this.values())
    return variable.value
  }

  setRoutes(routes) {
    this.requireRunning()
    const next = routes.map((r) => ({ ...r, id: r.id ?? randomUUID() }))
    next.forEach(validateRoute)
    this.config = { ...this.config, routes: next }
    return this.changed()
  }

  setWebhooks(webhooks) {
    this.requireRunning()
    const next = webhooks.map((w) => ({ ...w, id: w.id ?? randomUUID() }))
    next.filter((w) => w.enabled !== false).forEach(validateWebhook)
    this.stopWebhooks()
    this.config = { ...this.config, webhooks: next }
    this.startWebhooks()
    return this.changed()
  }

  setUpdateRate(rate) {
    this.requireRunning()
    const n = Number(rate)
    if (!Number.isFinite(n) || n < 10) throw new Error(t('errors.minPeriod', { min: 10 }))
    this.config = { ...this.config, updateRate: n }
    this.startSimulation()
    return this.changed()
  }

  startSimulation() {
    clearInterval(this.simTimer)
    const dt = Number(this.config.updateRate) || 100
    this.simTimer = setInterval(() => {
      const elapsed = Date.now() - this.t0
      const frozen = this.fault('freeze')
      for (const variable of this.variables.values()) {
        const { def } = variable
        if (def.simulation === 'none' || !NUMERIC_TYPES.includes(def.dataType)) continue
        if (frozen && (!frozen.points?.length || frozen.points.includes(def.id))) continue
        const spec = {
          ...def,
          min: Number(def.min),
          max: Number(def.max),
          period: Number(def.period) || 1000,
          dataType: def.dataType === 'Integer' ? 'Int32' : def.dataType
        }
        let value = simulate(spec, variable.value, elapsed, dt)
        if (def.dataType === 'Boolean' && typeof value !== 'boolean') value = value >= (spec.min + spec.max) / 2
        if (value !== variable.value) {
          variable.value = value
          variable.timestamp = Date.now()
        }
      }
    }, dt)
  }

  // --- Webhooks ------------------------------------------------------------------

  startWebhooks() {
    for (const hook of this.config.webhooks ?? []) {
      if (hook.enabled === false) continue
      const state = { hook, last: this.hookValues(hook), sentAt: 0, sending: false, timer: null }
      const seconds = Math.max(0, Number(hook.interval) || 0)
      if (hook.mode === 'interval') {
        state.timer = setInterval(() => this.sendHook(state, null), Math.max(1, seconds) * 1000)
      } else {
        // Changement : vérifié au rythme de la simulation, au plus un appel toutes les `interval` s.
        state.timer = setInterval(
          () => this.checkHook(state, seconds * 1000),
          Math.max(50, Number(this.config.updateRate) || 100)
        )
      }
      this.hooks.set(hook.id, state)
    }
  }

  stopWebhooks() {
    for (const state of this.hooks.values()) clearInterval(state.timer)
    this.hooks.clear()
  }

  /** Valeurs des variables suivies par un webhook (toutes si aucune n'est choisie), par nom. */
  hookValues(hook) {
    const ids = hook.variables?.length ? hook.variables : [...this.variables.keys()]
    return Object.fromEntries(
      ids
        .filter((id) => this.variables.has(id))
        .map((id) => [this.variables.get(id).def.name, this.variables.get(id).value])
    )
  }

  checkHook(state, minSpacing) {
    if (state.sending || Date.now() - state.sentAt < minSpacing) return
    const values = this.hookValues(state.hook)
    const changes = Object.keys(values)
      .filter((name) => JSON.stringify(values[name]) !== JSON.stringify(state.last[name]))
      .map((name) => ({ variable: name, value: values[name], previous: state.last[name] }))
    if (changes.length) this.sendHook(state, changes, values)
  }

  async sendHook(state, changes, values = this.hookValues(state.hook)) {
    const { hook } = state
    state.sending = true
    state.sentAt = Date.now()
    state.last = values
    const payload = JSON.stringify({
      event: changes ? 'change' : 'interval',
      timestamp: new Date().toISOString(),
      ...(changes ? { changes } : {}),
      values
    })
    const entry = {
      direction: 'out',
      remote: hook.name || hook.url,
      method: hook.method || 'POST',
      path: hook.url,
      requestBody: clip(payload)
    }
    try {
      const res = await httpRequest(hook.url, {
        method: hook.method || 'POST',
        headers: { 'content-type': 'application/json', ...headerObject(hook.headers) },
        body: payload,
        timeout: 5000,
        allowInsecure: true
      })
      this.log({ ...entry, status: res.status, duration: res.duration, responseBody: clip(res.body) })
    } catch (err) {
      this.log({ ...entry, status: null, error: err.message })
    } finally {
      state.sending = false
    }
  }
}
