import dgram from 'dgram'
import net from 'net'
import { randomUUID } from 'crypto'
import { DEFAULT_SERVER_CONFIG, KISS_CODES, LEAP_INDICATORS, MAX_CLIENTS, MAX_STRATUM } from '../shared/constants'
import { t } from '../shared/i18n'
import { SimClock } from './clock'
import { MODES, decodePacket, encodePacket } from './packet'

const MAX_LOG = 300
const STATUS_INTERVAL = 1000
/** Dernière synchronisation annoncée de l'horloge de référence (ms avant l'heure de réponse). */
const REFERENCE_AGE = 64_000

export function validateServerSettings({ stratum, leap, refId }) {
  const s = Number(stratum)
  if (!Number.isInteger(s) || s < 1 || s > MAX_STRATUM) throw new Error(t('ntp.errors.invalidStratum'))
  if (!LEAP_INDICATORS.includes(Number(leap))) throw new Error(t('ntp.errors.invalidLeap'))
  if (s === 1 && !/^[\x20-\x7e]{0,4}$/.test(refId ?? '')) throw new Error(t('ntp.errors.invalidRefId'))
}

/**
 * Serveur NTP (UDP) à horloge simulée : heure décalée ou fixée, dérive, strate et indicateur de
 * seconde intercalaire choisis. Répond aux requêtes client (mode 3) des versions 1 à 4 dans leur
 * version. Défauts injectables : délai, absence de réponse, Kiss-o'-Death, horloge figée.
 */
export class NtpServer {
  socket = null
  config = null
  clock = null
  requests = 0
  /** ip:port -> { address, version, count, last } */
  clients = new Map()
  logEntries = []
  faults = []
  statusTimer = null

  constructor({ onStatus = () => {}, onLog = () => {} } = {}) {
    this.onStatus = onStatus
    this.onLog = onLog
  }

  status() {
    const running = !!this.socket
    return {
      running,
      endpoint: running ? `udp://${this.config.host || '0.0.0.0'}:${this.config.port}` : null,
      config: this.config,
      // Heure simulée et écart avec l'heure réelle, au moment de l'état.
      time: running ? this.clock.now() : null,
      offset: running ? this.clock.offset() : null,
      frozen: running && this.clock.frozenAt !== null,
      requests: this.requests,
      clients: [...this.clients.values()].sort((a, b) => b.last.localeCompare(a.last))
    }
  }

  logs() {
    return this.logEntries
  }

  clearLogs() {
    this.logEntries = []
    return []
  }

  log(level, message) {
    const entry = { id: randomUUID(), time: new Date().toISOString(), level, message }
    this.logEntries.push(entry)
    if (this.logEntries.length > MAX_LOG) this.logEntries.splice(0, this.logEntries.length - MAX_LOG)
    this.onLog(entry)
  }

  async start(input) {
    if (this.socket) throw new Error(t('errors.alreadyStarted'))
    const config = {
      ...DEFAULT_SERVER_CONFIG,
      ...input,
      clock: { ...DEFAULT_SERVER_CONFIG.clock, ...input?.clock }
    }
    const port = Number(config.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(t('ntp.errors.invalidPort'))
    validateServerSettings(config)
    const clock = new SimClock(config.clock)

    const host = config.host || '0.0.0.0'
    const socket = dgram.createSocket(net.isIPv6(host) ? 'udp6' : 'udp4')
    try {
      await new Promise((resolve, reject) => {
        socket.once('error', reject)
        socket.bind(port, host, () => {
          socket.off('error', reject)
          resolve()
        })
      })
    } catch (err) {
      socket.close()
      if (err.code === 'EACCES') throw new Error(t('ntp.errors.portPrivileged', { port }), { cause: err })
      if (err.code === 'EADDRINUSE') throw new Error(t('ntp.errors.portInUse', { port }), { cause: err })
      throw err
    }
    socket.on('error', (err) => this.log('error', t('ntp.log.socketError', { message: err.message })))
    socket.on('message', (msg, rinfo) => this.onMessage(msg, rinfo))

    this.config = { ...config, port, stratum: Number(config.stratum), leap: Number(config.leap) }
    this.clock = clock
    this.clock.freeze(!!this.fault('freeze'))
    this.socket = socket
    this.requests = 0
    this.clients.clear()
    this.statusTimer = setInterval(() => this.onStatus(this.status()), STATUS_INTERVAL)
    this.log('info', t('ntp.log.started', { address: `${host}:${port}`, time: new Date(clock.now()).toISOString() }))
    this.onStatus(this.status())
    return this.status()
  }

  async stop() {
    const socket = this.socket
    clearInterval(this.statusTimer)
    this.statusTimer = null
    this.socket = null
    if (socket) {
      await new Promise((resolve) => socket.close(() => resolve()))
      this.log('info', t('ntp.log.stopped'))
    }
    this.onStatus(this.status())
    return this.status()
  }

  requireRunning() {
    if (!this.socket) throw new Error(t('errors.notStarted'))
  }

  fault(type) {
    return this.faults.find((f) => f.type === type)
  }

  setFaults(faults = []) {
    this.faults = faults
    this.clock?.freeze(!!this.fault('freeze'))
  }

  onMessage(msg, rinfo) {
    // Heure de réception relevée avant tout traitement.
    const received = this.clock.now()
    let request
    try {
      request = decodePacket(msg)
    } catch {
      return
    }
    if (request.mode !== MODES.CLIENT || request.version < 1 || request.version > 4) return
    this.requests++
    const key = `${rinfo.address}:${rinfo.port}`
    const client = this.clients.get(rinfo.address) ?? { address: rinfo.address, count: 0 }
    client.version = request.version
    client.count++
    client.last = new Date().toISOString()
    this.clients.delete(rinfo.address)
    this.clients.set(rinfo.address, client)
    if (this.clients.size > MAX_CLIENTS) this.clients.delete(this.clients.keys().next().value)

    if (this.fault('noResponse')) return
    const kiss = this.fault('kissOfDeath')
    const { config } = this
    // Réponse datée dès son traitement : un délai injecté simule une latence réseau, comptée dans le
    // délai aller-retour mesuré par le client (et décalant son écart de la moitié du délai).
    const transmit = this.clock.now()
    const response = kiss
      ? encodePacket({
          leap: 3,
          version: request.version,
          mode: MODES.SERVER,
          stratum: 0,
          poll: request.poll,
          precision: config.precision,
          refId: KISS_CODES.includes(kiss.params?.code) ? kiss.params.code : 'DENY',
          origin: request.rawTransmit,
          receive: received,
          transmit
        })
      : encodePacket({
          leap: config.leap,
          version: request.version,
          mode: MODES.SERVER,
          stratum: config.stratum,
          poll: request.poll,
          precision: Number(config.precision),
          rootDelay: 0,
          rootDispersion: 0.001,
          refId: config.refId,
          reference: transmit - REFERENCE_AGE,
          origin: request.rawTransmit,
          receive: received,
          transmit
        })
    if (kiss) this.log('warn', t('ntp.log.kiss', { client: key, code: kiss.params?.code ?? 'DENY' }))
    const send = () => this.socket?.send(response, rinfo.port, rinfo.address, () => {})
    const delay = Number(this.fault('delay')?.params?.ms) || 0
    if (delay > 0) setTimeout(send, delay)
    else send()
  }

  // --- Réglages à chaud ---------------------------------------------------------------

  changed(message) {
    if (message) this.log('info', message)
    this.onStatus(this.status())
    return this.status()
  }

  /** Règle l'horloge (mode, décalage, heure fixée, dérive) : l'heure saute aussitôt. */
  setClock(clock) {
    this.requireRunning()
    const next = { ...this.config.clock, ...clock }
    this.clock.configure(next)
    this.clock.freeze(!!this.fault('freeze'))
    this.config = { ...this.config, clock: next }
    return this.changed(t('ntp.log.clockSet', { time: new Date(this.clock.now()).toISOString() }))
  }

  /** Décale l'horloge de `seconds` par rapport à l'heure simulée actuelle. */
  shift(seconds) {
    this.requireRunning()
    const delta = Number(seconds)
    if (!Number.isFinite(delta)) throw new Error(t('ntp.errors.invalidOffset', { value: seconds }))
    return this.setClock({ mode: 'offset', offset: Math.round(this.clock.offset() + delta) })
  }

  setDrift(ppm) {
    this.requireRunning()
    this.clock.setDrift(ppm)
    this.config = { ...this.config, clock: { ...this.config.clock, drift: Number(ppm) } }
    return this.changed()
  }

  /** Strate, indicateur de seconde intercalaire, identifiant de référence, précision. */
  setSettings(settings) {
    this.requireRunning()
    const next = { ...this.config, ...settings }
    validateServerSettings(next)
    this.config = { ...next, stratum: Number(next.stratum), leap: Number(next.leap), precision: Number(next.precision) }
    return this.changed()
  }
}
