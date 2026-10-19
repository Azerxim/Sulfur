import dgram from 'dgram'
import net from 'net'
import os from 'os'
import tls from 'tls'
import {
  DEFAULT_CLIENT_CONFIG,
  FACILITIES,
  FORMATS,
  MAX_BURST,
  MAX_HISTORY,
  SEVERITIES,
  TRANSPORTS
} from '../shared/constants'
import { encodeMessage, fillTemplate } from '../shared/codec'
import { t } from '../shared/i18n'
import { frame } from './framing'

const CONNECT_TIMEOUT = 5000

/** Vérifie et complète les réglages de l'émetteur. */
export function normalizeClientConfig(input) {
  const config = { ...DEFAULT_CLIENT_CONFIG, ...input }
  if (!String(config.host ?? '').trim()) throw new Error(t('syslog.errors.missingHost'))
  const port = Number(config.port)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(t('syslog.errors.invalidPort'))
  if (!TRANSPORTS.includes(config.transport)) throw new Error(t('syslog.errors.invalidTransport'))
  if (!FORMATS.includes(config.format)) throw new Error(t('syslog.errors.invalidFormat'))
  const facility = Number(config.facility)
  const severity = Number(config.severity)
  if (!Number.isInteger(facility) || facility < 0 || facility >= FACILITIES.length) {
    throw new Error(t('syslog.errors.invalidFacility'))
  }
  if (!Number.isInteger(severity) || severity < 0 || severity >= SEVERITIES.length) {
    throw new Error(t('syslog.errors.invalidSeverity'))
  }
  const count = Number(config.count ?? 1)
  if (!Number.isInteger(count) || count < 1 || count > MAX_BURST) {
    throw new Error(t('syslog.errors.invalidCount', { max: MAX_BURST }))
  }
  return { ...config, host: config.host.trim(), port, facility, severity, count }
}

/**
 * Émetteur Syslog : envoie des messages (un seul, une rafale, ou périodiquement) en UDP, TCP ou TLS.
 * Une connexion TCP / TLS est conservée tant que la destination ne change pas.
 */
export class SyslogClient {
  /** Connexion TCP / TLS ouverte : { key, socket } */
  stream = null
  repeatTimer = null
  repeatConfig = null
  sequence = 0
  sent = 0
  errors = 0
  history = []
  /** Dernière configuration utilisée (envoi d'un message par un point). */
  lastConfig = null

  constructor({ onStatus = () => {}, onSent = () => {} } = {}) {
    this.onStatus = onStatus
    this.onSent = onSent
  }

  status() {
    return {
      repeating: !!this.repeatTimer,
      interval: this.repeatConfig?.interval ?? null,
      connected: !!this.stream && !this.stream.socket.destroyed,
      destination: this.stream?.key ?? null,
      sent: this.sent,
      errors: this.errors,
      hostname: os.hostname()
    }
  }

  clearHistory() {
    this.history = []
    return []
  }

  record(entry) {
    this.history.push(entry)
    if (this.history.length > MAX_HISTORY) this.history.splice(0, this.history.length - MAX_HISTORY)
    this.onSent(entry)
  }

  /** Socket TCP / TLS vers la destination (réutilisé tant qu'elle ne change pas). */
  async connect(config) {
    const key = `${config.transport}://${config.host}:${config.port}`
    if (this.stream?.key === key && !this.stream.socket.destroyed) return this.stream.socket
    this.disconnect()
    const socket = await new Promise((resolve, reject) => {
      const options = { host: config.host, port: config.port, timeout: CONNECT_TIMEOUT }
      const s =
        config.transport === 'tls'
          ? tls.connect(
              {
                ...options,
                servername: net.isIP(config.host) ? undefined : config.host,
                rejectUnauthorized: !!config.rejectUnauthorized
              },
              () => done()
            )
          : net.connect(options, () => done())
      const timer = setTimeout(() => fail(new Error(t('syslog.errors.connectTimeout'))), CONNECT_TIMEOUT)
      const done = () => {
        clearTimeout(timer)
        s.off('error', fail)
        s.setTimeout(0)
        resolve(s)
      }
      const fail = (err) => {
        clearTimeout(timer)
        s.destroy()
        reject(err)
      }
      s.once('error', fail)
    })
    socket.on('error', () => {})
    socket.on('close', () => {
      if (this.stream?.socket === socket) {
        this.stream = null
        this.onStatus(this.status())
      }
    })
    // Le serveur n'envoie rien : les données reçues sont ignorées.
    socket.on('data', () => {})
    this.stream = { key, socket }
    this.onStatus(this.status())
    return socket
  }

  disconnect() {
    this.stream?.socket.destroy()
    this.stream = null
  }

  async write(config, texts) {
    if (config.transport === 'udp') {
      const socket = dgram.createSocket(net.isIPv6(config.host) ? 'udp6' : 'udp4')
      try {
        for (const text of texts) {
          await new Promise((resolve, reject) =>
            socket.send(Buffer.from(text, 'utf8'), config.port, config.host, (err) => (err ? reject(err) : resolve()))
          )
        }
      } finally {
        socket.close()
      }
      return
    }
    const socket = await this.connect(config)
    const data = texts.map((text) => frame(text, config.framing)).join('')
    await new Promise((resolve, reject) => socket.write(data, (err) => (err ? reject(err) : resolve())))
  }

  /** Envoie `count` messages (`text` remplace le texte du message s'il est donné). */
  async send(input, text) {
    const config = normalizeClientConfig(input)
    this.lastConfig = config
    const hostname = config.hostname?.trim() || os.hostname()
    const texts = []
    for (let i = 0; i < config.count; i++) {
      const time = new Date()
      const n = ++this.sequence
      texts.push(
        encodeMessage({ ...config, hostname, time, message: fillTemplate(text ?? config.message, { n, time }) })
      )
    }
    const destination = `${config.transport}://${config.host}:${config.port}`
    try {
      await this.write(config, texts)
      this.sent += texts.length
      this.record({ at: new Date().toISOString(), destination, count: texts.length, text: texts.at(-1) })
    } catch (err) {
      this.errors++
      this.disconnect()
      const message = err.code === 'ECONNREFUSED' ? t('syslog.errors.refused', { destination }) : err.message
      this.record({ at: new Date().toISOString(), destination, count: 0, error: message })
      this.onStatus(this.status())
      throw new Error(message, { cause: err })
    }
    this.onStatus(this.status())
    return this.status()
  }

  startRepeat(input) {
    const config = normalizeClientConfig(input)
    const interval = Number(config.interval)
    if (!Number.isFinite(interval) || interval < 0.1) throw new Error(t('syslog.errors.minInterval'))
    this.stopRepeat()
    this.repeatConfig = config
    // Les erreurs d'un envoi périodique sont dans l'historique : l'envoi continue.
    const tick = () => this.send(config).catch(() => {})
    this.repeatTimer = setInterval(tick, interval * 1000)
    tick()
    this.onStatus(this.status())
    return this.status()
  }

  stopRepeat() {
    clearInterval(this.repeatTimer)
    this.repeatTimer = null
    this.repeatConfig = null
    this.onStatus(this.status())
    return this.status()
  }

  close() {
    clearInterval(this.repeatTimer)
    this.repeatTimer = null
    this.disconnect()
  }
}
