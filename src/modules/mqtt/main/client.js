import { randomUUID } from 'crypto'
import { connect } from 'mqtt'
import { DEFAULT_CLIENT_CONFIG, LOG_PAYLOAD, MAX_LOG, PROTOCOL_VERSIONS, QOS_LEVELS } from '../shared/constants'
import { isValidFilter, isValidTopic, matchTopic, payloadValue } from '../shared/topics'
import { t } from '../shared/i18n'

const CONNECT_TIMEOUT = 5000
const EMIT_INTERVAL = 200

/** Raison lisible d'un refus de connexion (codes CONNACK 3.1.1 et 5.0). */
function connackError(err) {
  const code = err?.code
  if (code === 4 || code === 134) return t('mqtt.errors.badCredentials')
  if (code === 5 || code === 135) return t('mqtt.errors.notAuthorized')
  if (code === 'ECONNREFUSED') return t('mqtt.errors.refused')
  if (err?.message === 'connack timeout') return t('mqtt.errors.connectTimeout')
  return err?.message ?? String(err)
}

function validateSubscription(sub) {
  if (!isValidFilter(sub.topic)) throw new Error(t('mqtt.errors.invalidFilter', { topic: sub.topic ?? '' }))
  if (!QOS_LEVELS.includes(Number(sub.qos))) throw new Error(t('mqtt.errors.invalidQos'))
}

/**
 * Client MQTT (mqtt.js, MQTT 3.1 / 3.1.1 / 5.0) en TCP ou TLS : abonnements (dernière valeur de
 * chacun, extraite d'un champ JSON au besoin), publications, message de dernière volonté, journal
 * des messages reçus.
 */
export class MqttClient {
  client = null
  config = null
  connected = false
  error = null
  /** id -> { id, topic, qos, field, granted } */
  subscriptions = new Map()
  /** id d'abonnement -> { value, payload, topic, time } */
  last = new Map()
  logEntries = []
  pending = []
  received = 0
  timer = null

  constructor({ onStatus = () => {}, onMessages = () => {} } = {}) {
    this.onStatus = onStatus
    this.onMessages = onMessages
  }

  status() {
    return {
      connected: this.connected,
      connecting: !!this.client && !this.connected,
      url: this.config ? `${this.config.tls ? 'mqtts' : 'mqtt'}://${this.config.host}:${this.config.port}` : null,
      clientId: this.client?.options.clientId ?? null,
      error: this.error,
      received: this.received,
      subscriptions: [...this.subscriptions.values()]
    }
  }

  messages() {
    return this.logEntries
  }

  clearMessages() {
    this.logEntries = []
    return []
  }

  changed() {
    this.onStatus(this.status())
    return this.status()
  }

  async connect(input) {
    if (this.client) throw new Error(t('mqtt.errors.alreadyConnected'))
    const config = { ...DEFAULT_CLIENT_CONFIG, ...input, will: { ...DEFAULT_CLIENT_CONFIG.will, ...input?.will } }
    if (!String(config.host ?? '').trim()) throw new Error(t('mqtt.errors.missingHost'))
    const port = Number(config.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(t('mqtt.errors.invalidPort'))
    if (!PROTOCOL_VERSIONS.includes(Number(config.protocolVersion))) throw new Error(t('mqtt.errors.invalidVersion'))
    const subscriptions = config.subscriptions ?? []
    subscriptions.forEach(validateSubscription)
    if (config.will.enabled && !isValidTopic(config.will.topic)) {
      throw new Error(t('mqtt.errors.invalidTopic', { topic: config.will.topic }))
    }

    const host = config.host.trim()
    this.config = { ...config, host, port }
    this.error = null
    const client = connect({
      protocol: config.tls ? 'mqtts' : 'mqtt',
      host,
      port,
      protocolVersion: Number(config.protocolVersion),
      clientId: config.clientId?.trim() || `sulfur_${randomUUID().slice(0, 8)}`,
      username: config.username || undefined,
      password: config.password || undefined,
      clean: !!config.clean,
      keepalive: Number(config.keepalive) || 0,
      connectTimeout: CONNECT_TIMEOUT,
      reconnectPeriod: config.autoReconnect ? 2000 : 0,
      rejectUnauthorized: !!config.rejectUnauthorized,
      will: config.will.enabled
        ? {
            topic: config.will.topic,
            payload: Buffer.from(String(config.will.payload ?? '')),
            qos: Number(config.will.qos),
            retain: !!config.will.retain
          }
        : undefined
    })
    this.client = client
    this.subscriptions = new Map(subscriptions.map((s) => [s.id, { ...s, qos: Number(s.qos), granted: null }]))
    this.last.clear()
    this.timer = setInterval(() => this.flush(), EMIT_INTERVAL)

    client.on('message', (topic, payload, packet) => this.onMessage(topic, payload, packet))
    client.on('connect', () => {
      this.connected = true
      this.error = null
      this.subscribeAll()
      this.changed()
    })
    client.on('close', () => {
      if (this.connected) {
        this.connected = false
        this.changed()
      }
    })
    client.on('error', (err) => {
      this.error = connackError(err)
      this.changed()
    })

    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(t('mqtt.errors.connectTimeout'))), CONNECT_TIMEOUT + 500)
        client.once('connect', () => {
          clearTimeout(timer)
          resolve()
        })
        client.once('error', (err) => {
          clearTimeout(timer)
          reject(new Error(connackError(err), { cause: err }))
        })
        client.once('close', () => {
          clearTimeout(timer)
          reject(new Error(this.error ?? t('mqtt.errors.closed')))
        })
      })
    } catch (err) {
      await this.disconnect()
      this.error = err.message
      this.changed()
      throw err
    }
    return this.changed()
  }

  async disconnect() {
    clearInterval(this.timer)
    this.timer = null
    const client = this.client
    this.client = null
    this.connected = false
    if (client) await new Promise((resolve) => client.end(true, {}, () => resolve()))
    this.flush()
    return this.changed()
  }

  requireConnected() {
    if (!this.client || !this.connected) throw new Error(t('errors.notConnected'))
  }

  subscribeAll() {
    for (const sub of this.subscriptions.values()) this.subscribeOne(sub)
  }

  subscribeOne(sub) {
    this.client?.subscribe(sub.topic, { qos: sub.qos }, (err, granted) => {
      const current = this.subscriptions.get(sub.id)
      if (!current || current.topic !== sub.topic) return
      current.granted = err ? 128 : (granted?.[0]?.qos ?? 128)
      this.changed()
    })
  }

  /** Remplace la liste des abonnements (connecté : désabonnements et abonnements correspondants). */
  setSubscriptions(list = []) {
    list.forEach(validateSubscription)
    const next = new Map(list.map((s) => [s.id, { ...s, qos: Number(s.qos), granted: null }]))
    for (const [id, old] of this.subscriptions) {
      const sub = next.get(id)
      if (sub && sub.topic === old.topic && sub.qos === old.qos) sub.granted = old.granted
      else if (this.connected && ![...next.values()].some((s) => s.topic === old.topic)) {
        this.client.unsubscribe(old.topic)
      }
      if (!sub || sub.topic !== old.topic || sub.field !== old.field) this.last.delete(id)
    }
    this.subscriptions = next
    if (this.connected) for (const sub of next.values()) if (sub.granted === null) this.subscribeOne(sub)
    return this.changed()
  }

  async publish({ topic, payload = '', qos = 0, retain = false }) {
    this.requireConnected()
    if (!isValidTopic(topic)) throw new Error(t('mqtt.errors.invalidTopic', { topic: topic ?? '' }))
    if (!QOS_LEVELS.includes(Number(qos))) throw new Error(t('mqtt.errors.invalidQos'))
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload)
    await new Promise((resolve, reject) =>
      this.client.publish(topic, data, { qos: Number(qos), retain: !!retain }, (err) => (err ? reject(err) : resolve()))
    )
    return this.status()
  }

  onMessage(topic, payload, packet) {
    this.received++
    const text = payload.toString('utf8')
    const time = new Date().toISOString()
    for (const sub of this.subscriptions.values()) {
      if (matchTopic(sub.topic, topic))
        this.last.set(sub.id, { value: payloadValue(text, sub.field), payload: text, topic, time })
    }
    this.logEntries.push({
      id: randomUUID(),
      time,
      topic,
      payload: text.length > LOG_PAYLOAD ? `${text.slice(0, LOG_PAYLOAD)}…` : text,
      size: payload.length,
      qos: packet.qos,
      retain: !!packet.retain
    })
    if (this.logEntries.length > MAX_LOG) this.logEntries.splice(0, this.logEntries.length - MAX_LOG)
    this.pending.push(this.logEntries.at(-1))
  }

  flush() {
    if (!this.pending.length) return
    const batch = this.pending
    this.pending = []
    this.onMessages({ messages: batch, last: Object.fromEntries(this.last) })
  }

  /** Dernières valeurs par abonnement. */
  values() {
    return Object.fromEntries(this.last)
  }
}
