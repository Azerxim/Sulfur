import { randomUUID } from 'crypto'
import { DEFAULT_CLIENT_CONFIG, METHODS } from '../shared/constants'
import { getPath } from '../shared/template'
import { t } from '../shared/i18n'
import { authHeaders, headerObject, httpRequest } from './request'

/** Corps de réponse : JSON décodé si possible, sinon texte. */
function parseBody(text) {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * Client HTTP / REST : requêtes ponctuelles et surveillances périodiques (GET d'une URL, valeur
 * extraite par un chemin JSON). Adresse de base, authentification et en-têtes communs viennent de
 * la configuration (`configure`).
 */
export class HttpClient {
  config = { ...DEFAULT_CLIENT_CONFIG }
  /** id -> { id, label, path, jsonPath, writeMethod } */
  watches = new Map()
  /** id -> { value, error, status, time } */
  last = new Map()
  pollTimer = null
  polling = false

  constructor({ onStatus = () => {}, onData = () => {} } = {}) {
    this.onStatus = onStatus
    this.onData = onData
  }

  status() {
    return {
      baseUrl: this.config.baseUrl,
      pollInterval: this.config.pollInterval,
      watches: [...this.watches.values()],
      polling: !!this.pollTimer
    }
  }

  configure(config = {}) {
    this.config = {
      ...DEFAULT_CLIENT_CONFIG,
      ...config,
      auth: { ...DEFAULT_CLIENT_CONFIG.auth, ...config.auth }
    }
    if (this.watches.size) this.startPolling()
    this.onStatus(this.status())
    return this.status()
  }

  /** URL absolue d'un chemin : tel quel s'il commence par http(s)://, sinon ajouté à l'adresse de base. */
  resolve(path) {
    const p = String(path ?? '').trim()
    if (/^https?:\/\//i.test(p)) return p
    const base = String(this.config.baseUrl ?? '').replace(/\/+$/, '')
    if (!base) throw new Error(t('http.errors.noBaseUrl'))
    return `${base}${p.startsWith('/') ? '' : '/'}${p}`
  }

  async send({ method = 'GET', path = '', headers = [], body = '' } = {}) {
    if (!METHODS.includes(method)) throw new Error(t('http.errors.invalidMethod', { method }))
    const url = this.resolve(path)
    const all = {
      accept: 'application/json, text/plain, */*',
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...headerObject(this.config.headers),
      ...authHeaders(this.config.auth),
      ...headerObject(headers)
    }
    const response = await httpRequest(url, {
      method,
      headers: all,
      body: method === 'GET' ? undefined : body,
      timeout: Math.max(100, Number(this.config.timeout) || 5000),
      allowInsecure: !!this.config.allowInsecure
    })
    return { ...response, url, method, time: new Date().toISOString() }
  }

  // --- Surveillance périodique ----------------------------------------------------

  addWatch(item) {
    const watch = {
      id: randomUUID(),
      label: item.label?.trim() || '',
      path: String(item.path ?? '').trim(),
      jsonPath: String(item.jsonPath ?? '').trim(),
      // Méthode d'écriture (PUT, POST, PATCH) : la surveillance est alors modifiable par le simulateur.
      writeMethod: METHODS.includes(item.writeMethod) && item.writeMethod !== 'GET' ? item.writeMethod : ''
    }
    if (!watch.path) throw new Error(t('http.errors.noPath'))
    this.resolve(watch.path)
    this.watches.set(watch.id, watch)
    this.startPolling()
    this.onStatus(this.status())
    this.poll()
    return this.status()
  }

  removeWatch(id) {
    this.watches.delete(id)
    this.last.delete(id)
    if (!this.watches.size) this.stopPolling()
    this.onStatus(this.status())
    return this.status()
  }

  setPollInterval(ms) {
    const n = Number(ms)
    if (!Number.isFinite(n) || n < 100) throw new Error(t('http.errors.minPoll'))
    this.config = { ...this.config, pollInterval: n }
    if (this.watches.size) this.startPolling()
    this.onStatus(this.status())
    return this.status()
  }

  startPolling() {
    clearInterval(this.pollTimer)
    this.pollTimer = setInterval(() => this.poll(), Math.max(100, Number(this.config.pollInterval) || 1000))
  }

  stopPolling() {
    clearInterval(this.pollTimer)
    this.pollTimer = null
  }

  async poll() {
    if (this.polling || !this.watches.size) return
    this.polling = true
    try {
      await Promise.all([...this.watches.values()].map((w) => this.pollOne(w)))
    } finally {
      this.polling = false
    }
  }

  async pollOne(watch) {
    const time = new Date().toISOString()
    try {
      const res = await this.send({ method: 'GET', path: watch.path })
      if (res.status >= 400) throw new Error(`HTTP ${res.status} ${res.statusText ?? ''}`.trim())
      const value = getPath(parseBody(res.body), watch.jsonPath)
      if (value === undefined) throw new Error(t('http.errors.pathNotFound', { path: watch.jsonPath }))
      this.received({ id: watch.id, value, error: null, status: res.status, time })
    } catch (err) {
      this.received({ id: watch.id, value: null, error: err.message, status: null, time })
    }
  }

  received(data) {
    if (this.watches.has(data.id)) this.last.set(data.id, data)
    this.onData(data)
  }

  /** Écrit une valeur par la méthode d'écriture d'une surveillance : corps { "value": … }. */
  async writeWatch(id, value) {
    const watch = this.watches.get(id)
    if (!watch) throw new Error(t('http.errors.unknownWatch'))
    if (!watch.writeMethod) throw new Error(t('http.errors.watchReadOnly'))
    const res = await this.send({ method: watch.writeMethod, path: watch.path, body: JSON.stringify({ value }) })
    if (res.status >= 400) throw new Error(`HTTP ${res.status} ${res.statusText ?? ''}`.trim())
    this.poll()
    return res.status
  }

  dispose() {
    this.stopPolling()
  }
}
