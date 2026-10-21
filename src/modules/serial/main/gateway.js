import net from 'net'
import { DEFAULT_GATEWAY_CONFIG } from '../shared/constants'
import { t } from '../shared/i18n'

/** Clients TCP simultanés au plus. */
const MAX_CLIENTS = 16

/** Réglages de la passerelle validés : { host, port, maxClients }. */
export function normalizeGateway(options) {
  const config = { ...DEFAULT_GATEWAY_CONFIG, ...options }
  const port = Number(config.port)
  const maxClients = Number(config.maxClients)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(t('serial.errors.invalidTcpPort'))
  if (!Number.isInteger(maxClients) || maxClients < 1 || maxClients > MAX_CLIENTS) {
    throw new Error(t('serial.errors.invalidMaxClients', { max: MAX_CLIENTS }))
  }
  return { host: String(config.host ?? '').trim() || '0.0.0.0', port, maxClients }
}

const remoteOf = (socket) => `${socket.remoteAddress?.replace(/^::ffff:/, '')}:${socket.remotePort}`

/**
 * Passerelle série ↔ TCP brute (à la manière de ser2net) : un serveur TCP relaie vers le port série
 * ouvert du terminal les octets reçus de ses clients, et envoie à tous ses clients les octets reçus
 * sur le port. Les échanges apparaissent dans le journal du terminal ; la passerelle s'arrête avec
 * le port.
 */
export class SerialGateway {
  server = null
  config = null
  /** Clients connectés : socket → { remote, since }. */
  clients = new Map()
  connections = 0

  constructor(terminal, { onStatus = () => {} } = {}) {
    this.terminal = terminal
    this.onStatus = onStatus
    terminal.onReceive((bytes) => {
      for (const socket of this.clients.keys()) socket.write(bytes)
    })
    terminal.onClose(() => {
      if (this.server) this.stop()
    })
  }

  get running() {
    return !!this.server
  }

  status() {
    return {
      running: this.running,
      config: this.config,
      endpoint: this.server ? `tcp://${this.config.host}:${this.config.port}` : null,
      clients: [...this.clients.values()],
      connections: this.connections
    }
  }

  async start(options) {
    if (this.server) throw new Error(t('serial.errors.gatewayRunning'))
    if (!this.terminal.isOpen) throw new Error(t('serial.errors.gatewayNeedsPort'))
    const config = normalizeGateway(options)
    const server = net.createServer((socket) => this.accept(socket))
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(config.port, config.host, () => {
          server.off('error', reject)
          resolve()
        })
      })
    } catch (err) {
      if (err.code === 'EACCES')
        throw new Error(t('serial.errors.portPrivileged', { port: config.port }), { cause: err })
      if (err.code === 'EADDRINUSE')
        throw new Error(t('serial.errors.portInUse', { port: config.port }), { cause: err })
      throw err
    }
    server.on('error', (err) => this.terminal.event('error', t('serial.log.gatewayError', { message: err.message })))
    this.server = server
    this.config = config
    this.connections = 0
    this.terminal.event('info', t('serial.log.gatewayStarted', { endpoint: `${config.host}:${config.port}` }))
    this.onStatus(this.status())
    return this.status()
  }

  accept(socket) {
    const remote = remoteOf(socket)
    socket.on('error', () => {})
    if (this.clients.size >= this.config.maxClients) {
      this.terminal.event('error', t('serial.log.clientRefused', { remote, max: this.config.maxClients }))
      socket.destroy()
      return
    }
    socket.setNoDelay(true)
    this.clients.set(socket, { remote, since: Date.now() })
    this.connections++
    this.terminal.event('info', t('serial.log.clientConnected', { remote }))
    this.onStatus(this.status())
    socket.on('data', (bytes) => {
      this.terminal
        .write(bytes, `TCP ${remote}`)
        .catch((err) => this.terminal.event('error', t('serial.log.forwardError', { remote, message: err.message })))
    })
    socket.on('close', () => {
      if (!this.clients.delete(socket)) return
      this.terminal.event('info', t('serial.log.clientDisconnected', { remote }))
      this.onStatus(this.status())
    })
  }

  async stop() {
    const server = this.server
    if (!server) return this.status()
    this.server = null
    // Clients retirés avant leur fermeture : pas de message de déconnexion pour chacun.
    const sockets = [...this.clients.keys()]
    this.clients.clear()
    for (const socket of sockets) socket.destroy()
    await new Promise((resolve) => server.close(() => resolve()))
    this.terminal.event('info', t('serial.log.gatewayStopped'))
    this.onStatus(this.status())
    return this.status()
  }
}
