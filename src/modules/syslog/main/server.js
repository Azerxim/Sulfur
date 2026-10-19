import dgram from 'dgram'
import net from 'net'
import tls from 'tls'
import { randomUUID } from 'crypto'
import { DEFAULT_SERVER_CONFIG, MAX_MESSAGES, SEVERITIES, TRANSPORTS } from '../shared/constants'
import { parseMessage } from '../shared/codec'
import { t } from '../shared/i18n'
import { FrameDecoder } from './framing'

/** Regroupement des messages reçus avant leur envoi à l'interface (ms). */
const EMIT_INTERVAL = 200
const STATUS_INTERVAL = 1000

const emptyCounts = () => SEVERITIES.map(() => 0)

/**
 * Serveur Syslog : reçoit les messages en UDP, TCP et TLS (RFC 5424, RFC 3164 et texte libre), les
 * analyse et conserve les plus récents. Défaut injectable : coupure (connexions TCP / TLS fermées
 * et refusées).
 */
export class SyslogServer {
  config = null
  /** transport -> socket UDP ou serveur TCP / TLS */
  listeners = new Map()
  /** Connexions TCP / TLS ouvertes. */
  connections = new Set()
  messages = []
  pending = []
  counts = emptyCounts()
  total = 0
  certificate = null
  faults = []
  timers = []

  /** `getCertificate()` : certificat du serveur TLS ({ cert, key, info }). */
  constructor(getCertificate, { onStatus = () => {}, onMessages = () => {} } = {}) {
    this.getCertificate = getCertificate
    this.onStatus = onStatus
    this.onMessages = onMessages
  }

  get running() {
    return this.listeners.size > 0
  }

  status() {
    const host = this.config?.host || '0.0.0.0'
    return {
      running: this.running,
      config: this.config,
      endpoints: TRANSPORTS.filter((tr) => this.listeners.has(tr)).map(
        (tr) => `${tr}://${host}:${this.config[tr].port}`
      ),
      certificate: this.listeners.has('tls') ? this.certificate?.info : null,
      connections: this.connections.size,
      total: this.total,
      counts: this.counts,
      cut: !!this.fault('cut')
    }
  }

  list() {
    return this.messages
  }

  clear() {
    this.messages = []
    this.counts = emptyCounts()
    this.total = 0
    this.onStatus(this.status())
    return []
  }

  async start(input) {
    if (this.running) throw new Error(t('errors.alreadyStarted'))
    const config = {
      ...DEFAULT_SERVER_CONFIG,
      ...input,
      ...Object.fromEntries(TRANSPORTS.map((tr) => [tr, { ...DEFAULT_SERVER_CONFIG[tr], ...input?.[tr] }]))
    }
    const enabled = TRANSPORTS.filter((tr) => config[tr].enabled)
    if (!enabled.length) throw new Error(t('syslog.errors.noTransport'))
    for (const tr of enabled) {
      const port = Number(config[tr].port)
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(t('syslog.errors.invalidPort'))
      config[tr] = { enabled: true, port }
    }
    if (config.tcp.enabled && config.tls.enabled && config.tcp.port === config.tls.port) {
      throw new Error(t('syslog.errors.samePort', { port: config.tcp.port }))
    }
    if (config.tls.enabled) this.certificate = await this.getCertificate()

    const host = config.host || '0.0.0.0'
    try {
      for (const tr of enabled) this.listeners.set(tr, await this.listen(tr, host, config[tr].port))
    } catch (err) {
      await this.closeListeners()
      if (err.code === 'EACCES') throw new Error(t('syslog.errors.portPrivileged', { port: err.port }), { cause: err })
      if (err.code === 'EADDRINUSE') throw new Error(t('syslog.errors.portInUse', { port: err.port }), { cause: err })
      throw err
    }
    this.config = config
    this.timers = [
      setInterval(() => this.flush(), EMIT_INTERVAL),
      setInterval(() => this.onStatus(this.status()), STATUS_INTERVAL)
    ]
    this.onStatus(this.status())
    return this.status()
  }

  listen(transport, host, port) {
    return new Promise((resolve, reject) => {
      const fail = (err) => reject(Object.assign(err, { port }))
      if (transport === 'udp') {
        const socket = dgram.createSocket(net.isIPv6(host) ? 'udp6' : 'udp4')
        socket.once('error', fail)
        socket.on('message', (msg, rinfo) => this.receive(msg.toString('utf8'), 'udp', rinfo.address))
        socket.bind(port, host, () => {
          socket.off('error', fail)
          socket.on('error', () => {})
          resolve(socket)
        })
        return
      }
      const onConnection = (socket) => this.accept(socket, transport)
      const server =
        transport === 'tls'
          ? tls.createServer({ cert: this.certificate.cert, key: this.certificate.key }, onConnection)
          : net.createServer(onConnection)
      server.once('error', fail)
      server.listen(port, host, () => {
        server.off('error', fail)
        server.on('error', () => {})
        resolve(server)
      })
    })
  }

  accept(socket, transport) {
    if (this.fault('cut')) return socket.destroy()
    const decoder = new FrameDecoder()
    const address = socket.remoteAddress
    this.connections.add(socket)
    socket.on('data', (chunk) => decoder.push(chunk).forEach((text) => this.receive(text, transport, address)))
    socket.on('end', () => decoder.end().forEach((text) => this.receive(text, transport, address)))
    socket.on('error', () => {})
    socket.on('close', () => this.connections.delete(socket))
  }

  receive(text, transport, address) {
    if (!text.trim()) return
    const entry = {
      id: randomUUID(),
      received: new Date().toISOString(),
      transport,
      address: address?.replace(/^::ffff:/, '') ?? '',
      ...parseMessage(text),
      raw: text.length > 4096 ? `${text.slice(0, 4096)}…` : text
    }
    this.total++
    this.counts[entry.severity]++
    this.messages.push(entry)
    if (this.messages.length > MAX_MESSAGES) this.messages.splice(0, this.messages.length - MAX_MESSAGES)
    this.pending.push(entry)
    this.last = entry
  }

  flush() {
    if (!this.pending.length) return
    const batch = this.pending
    this.pending = []
    this.onMessages(batch)
  }

  async closeListeners() {
    for (const socket of this.connections) socket.destroy()
    this.connections.clear()
    await Promise.all([...this.listeners.values()].map((l) => new Promise((resolve) => l.close(() => resolve()))))
    this.listeners.clear()
  }

  async stop() {
    this.timers.forEach(clearInterval)
    this.timers = []
    this.flush()
    await this.closeListeners()
    this.onStatus(this.status())
    return this.status()
  }

  fault(type) {
    return this.faults.find((f) => f.type === type)
  }

  setFaults(faults = []) {
    this.faults = faults
    if (this.fault('cut')) {
      for (const socket of this.connections) socket.destroy()
    }
    if (this.running) this.onStatus(this.status())
  }
}
