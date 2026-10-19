import net from 'net'
import tls from 'tls'
import { randomUUID } from 'crypto'
import { Aedes } from 'aedes'
import { simulate } from '@shared/simulator'
import { hashPassword, isPasswordHash, verifyPassword } from '@shared/passwords'
import {
  DATA_TYPES,
  DEFAULT_SERVER_AUTH,
  DEFAULT_SERVER_CONFIG,
  LOG_PAYLOAD,
  MAX_LOG,
  MAX_TOPICS,
  NUMERIC_TYPES,
  PAYLOAD_FORMATS,
  QOS_LEVELS,
  SET_SUFFIX
} from '../shared/constants'
import { isValidTopic, payloadValue } from '../shared/topics'
import { t } from '../shared/i18n'

const EMIT_INTERVAL = 200
const STATUS_INTERVAL = 1000

/** Codes de retour CONNACK (MQTT 3.1.1) : identifiants refusés, connexion non autorisée. */
const BAD_CREDENTIALS = 4
const NOT_AUTHORIZED = 5

/** Convertit une valeur saisie ou reçue dans le type du topic. */
export function convertValue(dataType, raw) {
  if (dataType === 'String') return typeof raw === 'string' ? raw : JSON.stringify(raw)
  if (dataType === 'Boolean') {
    if (typeof raw === 'boolean') return raw
    const s = String(raw).trim().toLowerCase()
    if (['true', '1', 'on'].includes(s)) return true
    if (['false', '0', 'off'].includes(s)) return false
    throw new Error(t('mqtt.errors.invalidBoolean', { value: raw }))
  }
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
  if (String(raw).trim() === '' || !Number.isFinite(n)) throw new Error(t('errors.invalidNumber', { value: raw }))
  if (dataType === 'Integer' && !Number.isInteger(n)) throw new Error(t('errors.invalidInteger', { value: raw }))
  return n
}

/** Vérifie la définition d'un topic simulé. */
export function validateTopicDef(def, others = []) {
  if (!isValidTopic(def.topic)) throw new Error(t('mqtt.errors.invalidTopic', { topic: def.topic ?? '' }))
  if (def.topic.startsWith('$')) throw new Error(t('mqtt.errors.reservedTopic'))
  if (others.some((o) => o.id !== def.id && o.topic === def.topic)) {
    throw new Error(t('mqtt.errors.duplicateTopic', { topic: def.topic }))
  }
  if (!DATA_TYPES.includes(def.dataType)) throw new Error(t('mqtt.errors.invalidType'))
  if (!QOS_LEVELS.includes(Number(def.qos))) throw new Error(t('mqtt.errors.invalidQos'))
  if (!PAYLOAD_FORMATS.includes(def.format)) throw new Error(t('mqtt.errors.invalidFormat'))
  const interval = Number(def.interval)
  if (!Number.isFinite(interval) || (interval !== 0 && interval < 10)) throw new Error(t('mqtt.errors.invalidInterval'))
}

/** Contenu publié pour une valeur. */
export function encodePayload(def, value, timestamp = Date.now()) {
  if (def.format === 'json') return JSON.stringify({ value, timestamp: new Date(timestamp).toISOString() })
  return typeof value === 'string' ? value : JSON.stringify(value)
}

/** Aperçu texte d'un contenu (binaire en hexadécimal). */
function preview(payload) {
  const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload ?? ''))
  const text = buf.toString('utf8')
  // Texte lisible : ni caractère de contrôle (hors tabulation et fins de ligne), ni UTF-8 invalide.
  const printable = ![...text].some((c) => {
    const code = c.charCodeAt(0)
    return (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 0xfffd
  })
  const shown = printable ? text : `0x${buf.subarray(0, LOG_PAYLOAD / 2).toString('hex')}`
  return {
    text: shown.length > LOG_PAYLOAD ? `${shown.slice(0, LOG_PAYLOAD)}…` : shown,
    size: buf.length,
    binary: !printable
  }
}

/**
 * Broker MQTT (aedes, MQTT 3.1 / 3.1.1) en TCP ou TLS :
 *  - topics simulés publiés périodiquement ou à chaque changement (valeur seule ou JSON), modifiables
 *    par une publication sur `<topic>/set` ;
 *  - authentification facultative (utilisateurs, mots de passe hachés) ;
 *  - journal des messages, explorateur des topics (dernier message de chaque topic), clients connectés ;
 *  - défauts injectés par le simulateur (délai, absence de réponse, coupure, valeurs figées).
 */
export class MqttServer {
  broker = null
  listener = null
  config = null
  certificate = null
  /** id -> { def, value, timestamp, lastPublished } */
  variables = new Map()
  /** topic -> { topic, payload, size, qos, retain, count, time, clientId } */
  topicStats = new Map()
  /** clientId -> { id, address, username, version, connectedAt, subscriptions } */
  clients = new Map()
  logEntries = []
  pending = []
  messages = 0
  faults = []
  timers = []
  simTimer = null
  t0 = Date.now()

  /** `getCertificate()` : certificat du serveur TLS ({ cert, key, info }). */
  constructor(getCertificate, { onStatus = () => {}, onLog = () => {}, onValues = () => {} } = {}) {
    this.getCertificate = getCertificate
    this.onStatus = onStatus
    this.onLog = onLog
    this.onValues = onValues
  }

  get running() {
    return !!this.broker
  }

  status() {
    const running = this.running
    return {
      running,
      url: running
        ? `${this.config.tls ? 'mqtts' : 'mqtt'}://${this.config.host || '0.0.0.0'}:${this.config.port}`
        : null,
      config: this.config,
      certificate: running && this.config.tls ? this.certificate?.info : null,
      messages: this.messages,
      clients: [...this.clients.values()],
      cut: !!this.fault('cut')
    }
  }

  values() {
    return Object.fromEntries([...this.variables].map(([id, v]) => [id, v.value]))
  }

  logs() {
    return this.logEntries
  }

  clearLogs() {
    this.logEntries = []
    this.topicStats.clear()
    return []
  }

  topics() {
    return [...this.topicStats.values()]
  }

  /** Utilisateurs : mot de passe saisi (`password`) haché, empreinte existante conservée. */
  async prepareUsers(users = []) {
    const names = new Set()
    const prepared = []
    for (const u of users) {
      const username = String(u.username ?? '').trim()
      if (!username) throw new Error(t('mqtt.errors.emptyUsername'))
      if (names.has(username)) throw new Error(t('mqtt.errors.duplicateUser', { name: username }))
      names.add(username)
      const passwordHash = isPasswordHash(u.passwordHash)
        ? u.passwordHash
        : u.password
          ? await hashPassword(u.password)
          : null
      if (!passwordHash) throw new Error(t('mqtt.errors.missingPassword', { name: username }))
      prepared.push({ username, passwordHash })
    }
    return prepared
  }

  async start(input) {
    if (this.running) throw new Error(t('errors.alreadyStarted'))
    const config = {
      ...DEFAULT_SERVER_CONFIG,
      ...input,
      auth: { ...DEFAULT_SERVER_AUTH, ...input?.auth }
    }
    const port = Number(config.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(t('mqtt.errors.invalidPort'))
    const rate = Number(config.updateRate)
    if (!Number.isFinite(rate) || rate < 10) throw new Error(t('errors.minPeriod', { min: 10 }))
    config.topics.forEach((def) => validateTopicDef(def, config.topics))
    config.auth = { ...config.auth, users: await this.prepareUsers(config.auth.users) }
    if (!config.auth.anonymous && !config.auth.users.length) throw new Error(t('mqtt.errors.noUser'))
    if (config.tls) this.certificate = await this.getCertificate()

    const broker = await Aedes.createBroker({ heartbeatInterval: 3_600_000, drainTimeout: 10_000 })
    this.setupBroker(broker)
    const host = config.host || '0.0.0.0'
    const listener = config.tls
      ? tls.createServer({ cert: this.certificate.cert, key: this.certificate.key }, broker.handle)
      : net.createServer(broker.handle)
    try {
      await new Promise((resolve, reject) => {
        listener.once('error', reject)
        listener.listen(port, host, () => {
          listener.off('error', reject)
          resolve()
        })
      })
    } catch (err) {
      await new Promise((resolve) => broker.close(resolve))
      if (err.code === 'EACCES') throw new Error(t('mqtt.errors.portPrivileged', { port }), { cause: err })
      if (err.code === 'EADDRINUSE') throw new Error(t('mqtt.errors.portInUse', { port }), { cause: err })
      throw err
    }
    listener.on('error', () => {})

    this.broker = broker
    this.listener = listener
    this.config = { ...config, port, updateRate: rate }
    this.messages = 0
    this.clients.clear()
    this.variables.clear()
    this.t0 = Date.now()
    for (const def of config.topics) this.addVariable(def)
    this.startSimulation()
    this.timers = [
      setInterval(() => this.flush(), EMIT_INTERVAL),
      setInterval(() => this.onStatus(this.status()), STATUS_INTERVAL),
      setInterval(() => this.onValues(this.values()), 250)
    ]
    this.onStatus(this.status())
    return this.status()
  }

  async stop() {
    clearInterval(this.simTimer)
    this.simTimer = null
    this.timers.forEach(clearInterval)
    this.timers = []
    const { broker, listener } = this
    this.broker = null
    this.listener = null
    if (broker) {
      // Les connexions sont fermées par le broker ; le serveur cesse d'en accepter.
      listener.close()
      await new Promise((resolve) => broker.close(resolve))
    }
    this.flush()
    this.clients.clear()
    this.onStatus(this.status())
    return this.status()
  }

  // --- Broker -------------------------------------------------------------------------

  setupBroker(broker) {
    broker.preConnect = (client, packet, callback) => {
      if (this.fault('cut')) return callback(null, false)
      // Absence de réponse : le CONNECT reste sans CONNACK, le client atteint son délai.
      if (this.fault('noResponse')) return
      callback(null, true)
    }

    broker.authenticate = (client, username, password, callback) => {
      const { auth } = this.config ?? { auth: DEFAULT_SERVER_AUTH }
      if (!username) {
        if (auth.anonymous) return callback(null, true)
        return callback(Object.assign(new Error('not authorized'), { returnCode: NOT_AUTHORIZED }), false)
      }
      const user = auth.users.find((u) => u.username === username)
      const refuse = () => callback(Object.assign(new Error('bad credentials'), { returnCode: BAD_CREDENTIALS }), false)
      if (!user) return refuse()
      verifyPassword(password?.toString('utf8') ?? '', user.passwordHash).then(
        (ok) => {
          if (!ok) return refuse()
          client.sulfurUser = username
          callback(null, true)
        },
        () => refuse()
      )
    }

    broker.authorizePublish = (client, packet, callback) => {
      if (packet.topic.startsWith('$SYS/')) return callback(new Error(t('mqtt.errors.reservedTopic')))
      const delay = Number(this.fault('delay')?.params?.ms) || 0
      if (delay > 0) setTimeout(() => callback(null), delay)
      else callback(null)
    }

    // Absence de réponse : les messages ne sont plus distribués aux abonnés.
    broker.authorizeForward = (client, packet) => (this.fault('noResponse') ? null : packet)

    broker.on('clientReady', (client) => {
      this.clients.set(client.id, {
        id: client.id,
        address: client.conn?.remoteAddress?.replace(/^::ffff:/, '') ?? '',
        username: client.sulfurUser ?? '',
        version: client.version,
        connectedAt: new Date().toISOString(),
        subscriptions: []
      })
      this.event('connect', { clientId: client.id })
    })
    broker.on('clientDisconnect', (client) => {
      if (this.clients.delete(client.id)) this.event('disconnect', { clientId: client.id })
    })
    broker.on('subscribe', (subscriptions, client) => {
      const info = this.clients.get(client.id)
      if (!info) return
      const topics = subscriptions.map((s) => s.topic)
      info.subscriptions = [...info.subscriptions.filter((s) => !topics.includes(s.topic)), ...subscriptions]
      this.event('subscribe', { clientId: client.id, topic: topics.join(', ') })
    })
    broker.on('unsubscribe', (topics, client) => {
      const info = this.clients.get(client.id)
      if (info) info.subscriptions = info.subscriptions.filter((s) => !topics.includes(s.topic))
      this.event('unsubscribe', { clientId: client.id, topic: topics.join(', ') })
    })
    broker.on('publish', (packet, client) => this.onPublish(packet, client))
  }

  /** Message distribué par le broker (publication d'un client ou d'un topic simulé). */
  onPublish(packet, client) {
    if (packet.topic.startsWith('$SYS/')) return
    this.messages++
    const { text, size, binary } = preview(packet.payload)
    const entry = {
      id: randomUUID(),
      time: new Date().toISOString(),
      type: 'publish',
      topic: packet.topic,
      payload: text,
      size,
      binary,
      qos: packet.qos,
      retain: !!packet.retain,
      clientId: client?.id ?? null
    }
    this.log(entry)
    const stats = this.topicStats.get(packet.topic)
    this.topicStats.delete(packet.topic)
    this.topicStats.set(packet.topic, {
      topic: packet.topic,
      payload: text,
      size,
      qos: packet.qos,
      retain: entry.retain,
      count: (stats?.count ?? 0) + 1,
      time: entry.time,
      clientId: entry.clientId
    })
    if (this.topicStats.size > MAX_TOPICS) this.topicStats.delete(this.topicStats.keys().next().value)
    if (client && packet.topic.endsWith(SET_SUFFIX)) this.onSetRequest(packet)
  }

  /** Publication sur `<topic>/set` : nouvelle valeur d'un topic simulé modifiable. */
  onSetRequest(packet) {
    const target = packet.topic.slice(0, -SET_SUFFIX.length)
    const variable = [...this.variables.values()].find((v) => v.def.topic === target)
    if (!variable?.def.writable) return
    try {
      // Valeur seule, ou objet `{ "value": … }` comme celui publié au format JSON.
      const raw = payloadValue(packet.payload.toString('utf8'))
      const value = raw !== null && typeof raw === 'object' && 'value' in raw ? raw.value : raw
      this.setValue(variable.def.id, value)
    } catch (err) {
      this.event('error', { topic: packet.topic, message: err.message })
    }
  }

  event(type, data) {
    this.log({ id: randomUUID(), time: new Date().toISOString(), type, ...data })
  }

  log(entry) {
    this.logEntries.push(entry)
    if (this.logEntries.length > MAX_LOG) this.logEntries.splice(0, this.logEntries.length - MAX_LOG)
    this.pending.push(entry)
  }

  flush() {
    if (!this.pending.length) return
    const batch = this.pending
    this.pending = []
    this.onLog(batch)
  }

  // --- Topics simulés -----------------------------------------------------------------

  addVariable(def) {
    let value
    try {
      value = convertValue(def.dataType, def.initialValue)
    } catch {
      value = def.dataType === 'String' ? '' : def.dataType === 'Boolean' ? false : 0
    }
    this.variables.set(def.id, { def, value, timestamp: Date.now(), lastPublished: 0 })
    this.publishVariable(def.id)
  }

  publishVariable(id) {
    const variable = this.variables.get(id)
    if (!variable || !this.broker) return
    variable.lastPublished = Date.now()
    variable.dirty = false
    this.broker.publish(
      {
        cmd: 'publish',
        topic: variable.def.topic,
        payload: Buffer.from(encodePayload(variable.def, variable.value, variable.timestamp)),
        qos: Number(variable.def.qos),
        retain: !!variable.def.retain,
        dup: false
      },
      () => {}
    )
  }

  /** Nouvelle valeur d'un topic simulé (interface, point, publication `<topic>/set`). */
  setValue(id, raw) {
    this.requireRunning()
    const variable = this.variables.get(id)
    if (!variable) throw new Error(t('mqtt.errors.unknownTopic'))
    variable.value = convertValue(variable.def.dataType, raw)
    variable.timestamp = Date.now()
    this.publishVariable(id)
    return variable.value
  }

  upsertTopic(def) {
    this.requireRunning()
    const others = this.config.topics.filter((d) => d.id !== def.id)
    validateTopicDef(def, others)
    const existing = this.variables.get(def.id)
    this.config = { ...this.config, topics: [...others, def] }
    if (existing && existing.def.dataType === def.dataType) {
      const topicChanged = existing.def.topic !== def.topic
      existing.def = def
      if (topicChanged) this.publishVariable(def.id)
    } else {
      this.addVariable(def)
    }
    return this.status()
  }

  removeTopic(id) {
    this.requireRunning()
    this.variables.delete(id)
    this.config = { ...this.config, topics: this.config.topics.filter((d) => d.id !== id) }
    return this.status()
  }

  setUpdateRate(rate) {
    this.requireRunning()
    const n = Number(rate)
    if (!Number.isFinite(n) || n < 10) throw new Error(t('errors.minPeriod', { min: 10 }))
    this.config = { ...this.config, updateRate: n }
    this.startSimulation()
    return this.status()
  }

  startSimulation() {
    clearInterval(this.simTimer)
    const dt = Number(this.config.updateRate) || 100
    this.simTimer = setInterval(() => {
      const now = Date.now()
      const elapsed = now - this.t0
      const frozen = this.fault('freeze')
      for (const [id, variable] of this.variables) {
        const { def } = variable
        const isFrozen = frozen && (!frozen.points?.length || frozen.points.includes(id))
        if (!isFrozen && def.simulation !== 'none' && NUMERIC_TYPES.includes(def.dataType)) {
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
            variable.timestamp = now
            variable.dirty = true
          }
        }
        const interval = Number(def.interval)
        if (interval > 0 ? now - variable.lastPublished >= interval : variable.dirty) this.publishVariable(id)
      }
    }, dt)
  }

  requireRunning() {
    if (!this.running) throw new Error(t('errors.notStarted'))
  }

  // --- Défauts ------------------------------------------------------------------------

  fault(type) {
    return this.faults.find((f) => f.type === type)
  }

  setFaults(faults = []) {
    this.faults = faults
    if (this.fault('cut') && this.broker) {
      for (const client of Object.values(this.broker.clients)) client.close()
    }
    if (this.running) this.onStatus(this.status())
  }
}
