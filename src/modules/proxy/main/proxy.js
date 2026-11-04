import dgram from 'dgram'
import net from 'net'
import {
  DEFAULT_FAULTS,
  DIRECTIONS,
  MAX_LATENCY,
  MAX_LOG,
  MAX_LOGGED,
  MAX_PERCENT,
  PROTOCOLS,
  UDP_IDLE
} from '../shared/constants'
import { escapedText, toHex } from '../shared/codec'
import { t } from '../shared/i18n'

/** Regroupement des entrées du journal envoyées à l'interface (ms). */
const EMIT_PERIOD = 100

/** Intervalle minimal entre deux états envoyés à l'interface pendant le trafic (ms). */
const STATUS_PERIOD = 250

const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '::1', '0.0.0.0', '::']

const isPort = (value) => Number.isInteger(value) && value >= 1 && value <= 65535

const remoteOf = (address, port) => `${String(address).replace(/^::ffff:/, '')}:${port}`

const random = (max) => Math.floor(Math.random() * max)

/** Défauts d'une redirection validés : { latency, jitter, loss, corrupt, direction, block }. */
export function normalizeFaults(options) {
  const faults = { ...DEFAULT_FAULTS, ...options }
  const ms = (key) => {
    const value = Number(faults[key])
    if (!Number.isFinite(value) || value < 0 || value > MAX_LATENCY)
      throw new Error(t('proxy.errors.invalidDelay', { max: MAX_LATENCY }))
    return Math.round(value)
  }
  const percent = (key) => {
    const value = Number(faults[key])
    if (!Number.isFinite(value) || value < 0 || value > MAX_PERCENT) throw new Error(t('proxy.errors.invalidPercent'))
    return value
  }
  if (!DIRECTIONS.includes(faults.direction)) throw new Error(t('proxy.errors.invalidDirection'))
  return {
    latency: ms('latency'),
    jitter: ms('jitter'),
    loss: percent('loss'),
    corrupt: percent('corrupt'),
    direction: faults.direction,
    block: !!faults.block
  }
}

/** Redirection validée : { id, name, protocol, listenHost, listenPort, targetHost, targetPort, faults }. */
export function normalizeRule(options = {}) {
  const protocol = options.protocol
  if (!PROTOCOLS.includes(protocol)) throw new Error(t('proxy.errors.invalidProtocol'))
  const listenPort = Number(options.listenPort)
  const targetPort = Number(options.targetPort)
  if (!isPort(listenPort)) throw new Error(t('proxy.errors.invalidListenPort'))
  if (!isPort(targetPort)) throw new Error(t('proxy.errors.invalidTargetPort'))
  const listenHost = String(options.listenHost ?? '').trim() || '0.0.0.0'
  const targetHost = String(options.targetHost ?? '').trim()
  if (!targetHost) throw new Error(t('proxy.errors.missingTarget'))
  // Redirection vers elle-même : chaque envoi reviendrait au proxy, sans fin.
  if (targetPort === listenPort && (LOCAL_HOSTS.includes(targetHost) || targetHost === listenHost))
    throw new Error(t('proxy.errors.loop'))
  return {
    id: String(options.id ?? ''),
    name: String(options.name ?? '').trim() || `${protocol.toUpperCase()} ${listenPort}`,
    protocol,
    listenHost,
    listenPort,
    targetHost,
    targetPort,
    faults: normalizeFaults(options.faults)
  }
}

/** Champs d'adresse d'une redirection, figés tant qu'elle est démarrée. */
const ADDRESS_FIELDS = ['protocol', 'listenHost', 'listenPort', 'targetHost', 'targetPort']

const newCounters = () => ({ up: 0, down: 0, upPackets: 0, downPackets: 0, dropped: 0, corrupted: 0, connections: 0 })

/**
 * Proxy TCP / UDP : chaque redirection écoute sur un port local et relaie le trafic vers un hôte:port
 * distant, dans les deux sens. Le sens `up` va du client vers l'équipement, `down` de l'équipement
 * vers le client.
 *
 * Défauts appliqués au trafic relayé, par redirection (modifiables à chaud) : latence et gigue
 * (l'ordre des envois est conservé), perte de datagrammes UDP, altération d'un bit d'un octet,
 * blocage (connexions refusées, données ignorées), coupure immédiate des connexions. Les défauts du
 * simulateur s'y ajoutent pour toutes les redirections : `delay` (params.ms), `noResponse` (données
 * ignorées) et `cut` (connexions coupées et refusées).
 *
 * Entrées du journal : { id, time, rule, name, conn?, remote?, dir: 'up' | 'down' | 'event', hex?,
 * size?, fault?: 'blocked' | 'lost' | 'corrupted', delay?, level?, text? } — `hex` limité à MAX_LOGGED
 * octets, `size` la taille réelle de l'envoi.
 */
export class ProxyEngine {
  /** Redirections démarrées : id → { config, server | socket, sessions, udp, counters }. */
  rules = new Map()
  /** Défauts actifs du simulateur. */
  simFaults = []
  /** Données relayées enregistrées dans le journal (sinon : événements seulement). */
  capture = true
  log = []
  nextId = 1
  nextConn = 1
  outbox = []
  emitTimer = null
  statusTimer = null

  constructor({ onStatus = () => {}, onLog = () => {} } = {}) {
    this.onStatus = onStatus
    this.onLog = onLog
  }

  get running() {
    return this.rules.size > 0
  }

  status() {
    const rules = [...this.rules.values()].map((rule) => this.ruleStatus(rule))
    return {
      running: this.running,
      // Résumé pour la barre latérale et la vue d'ensemble : premier point d'écoute, connexions.
      endpoint: rules[0]?.endpoint ?? null,
      sessions: rules.reduce((n, r) => n + r.connections.length, 0),
      capture: this.capture,
      simulatorFaults: [...new Set(this.simFaults.map((f) => f.type))],
      rules
    }
  }

  ruleStatus({ config, sessions, counters }) {
    return {
      id: config.id,
      config,
      endpoint: `${config.protocol}://${config.listenHost}:${config.listenPort}`,
      target: `${config.targetHost}:${config.targetPort}`,
      connections: [...sessions.values()].map(({ id, remote, since, up, down }) => ({ id, remote, since, up, down })),
      counters: { ...counters }
    }
  }

  emitStatus() {
    clearTimeout(this.statusTimer)
    this.statusTimer = null
    this.onStatus(this.status())
  }

  /** État envoyé à l'interface au plus toutes les STATUS_PERIOD ms (compteurs pendant le trafic). */
  touch() {
    this.statusTimer ??= setTimeout(() => this.emitStatus(), STATUS_PERIOD)
  }

  // --- Redirections -----------------------------------------------------------------------------

  async start(options) {
    const config = normalizeRule(options)
    if (this.rules.has(config.id)) throw new Error(t('proxy.errors.alreadyRunning', { name: config.name }))
    const rule = { config, server: null, socket: null, sessions: new Map(), udp: new Map(), counters: newCounters() }
    try {
      if (config.protocol === 'tcp') await this.listenTcp(rule)
      else await this.listenUdp(rule)
    } catch (err) {
      const params = { port: config.listenPort, host: config.listenHost }
      if (err.code === 'EACCES') throw new Error(t('proxy.errors.portPrivileged', params), { cause: err })
      if (err.code === 'EADDRINUSE') throw new Error(t('proxy.errors.portInUse', params), { cause: err })
      if (err.code === 'EADDRNOTAVAIL') throw new Error(t('proxy.errors.addressUnavailable', params), { cause: err })
      throw err
    }
    this.rules.set(config.id, rule)
    this.event(
      'info',
      rule,
      t('proxy.log.started', { endpoint: this.ruleStatus(rule).endpoint, target: this.target(rule) })
    )
    this.emitStatus()
    return this.status()
  }

  /** Démarre les redirections `list` qui ne le sont pas encore ; erreurs regroupées. */
  async startAll(list = []) {
    const errors = []
    for (const options of list) {
      if (this.rules.has(String(options?.id))) continue
      try {
        await this.start(options)
      } catch (err) {
        errors.push(`${options?.name || options?.id} : ${err.message}`)
      }
    }
    if (errors.length) throw new Error(errors.join('\n'))
    return this.status()
  }

  async stop(id) {
    const rule = this.rules.get(String(id))
    if (!rule) return this.status()
    this.rules.delete(rule.config.id)
    for (const session of [...rule.sessions.values()]) this.endSession(rule, session, 'stop', { silent: true })
    if (rule.server) {
      const server = rule.server
      await new Promise((resolve) => server.close(() => resolve()))
    }
    if (rule.socket) {
      const socket = rule.socket
      await new Promise((resolve) => socket.close(() => resolve()))
    }
    this.event('info', rule, t('proxy.log.stopped', { endpoint: this.ruleStatus(rule).endpoint }))
    this.emitStatus()
    return this.status()
  }

  async stopAll() {
    for (const id of [...this.rules.keys()]) await this.stop(id)
    return this.status()
  }

  /**
   * Redirection démarrée modifiée : nom et défauts appliqués aussitôt ; les adresses ne changent
   * qu'à l'arrêt.
   */
  update(options) {
    const config = normalizeRule(options)
    const rule = this.rules.get(config.id)
    if (!rule) return this.status()
    if (ADDRESS_FIELDS.some((key) => rule.config[key] !== config[key])) throw new Error(t('proxy.errors.stopToChange'))
    rule.config = config
    this.emitStatus()
    return this.status()
  }

  /** Coupe toutes les connexions (sessions UDP comprises) d'une redirection, ou de toutes. */
  cut(id = null) {
    const rules = id ? [this.rules.get(String(id))].filter(Boolean) : [...this.rules.values()]
    for (const rule of rules) {
      const count = rule.sessions.size
      for (const session of [...rule.sessions.values()]) this.endSession(rule, session, 'cut', { silent: true })
      this.event('warn', rule, t('proxy.log.cut', { count }))
    }
    this.emitStatus()
    return this.status()
  }

  /** Défauts actifs du simulateur ; une coupure qui commence coupe les connexions en cours. */
  setFaults(faults = []) {
    const cutting = this.simFaults.some((f) => f.type === 'cut')
    this.simFaults = Array.isArray(faults) ? faults : []
    if (!cutting && this.simFaults.some((f) => f.type === 'cut')) {
      for (const rule of this.rules.values()) {
        for (const session of [...rule.sessions.values()]) this.endSession(rule, session, 'cut', { silent: true })
        this.event('warn', rule, t('proxy.log.simulatorCut'))
      }
    }
    this.emitStatus()
  }

  setCapture(capture) {
    this.capture = !!capture
    this.emitStatus()
    return this.status()
  }

  target(rule) {
    return `${rule.config.targetHost}:${rule.config.targetPort}`
  }

  /** Défauts appliqués au sens `dir` d'une redirection : les siens, plus ceux du simulateur. */
  faultsFor(rule, dir) {
    const own = rule.config.faults
    const applies = own.direction === 'both' || own.direction === dir
    const delay = this.simFaults.filter((f) => f.type === 'delay').reduce((n, f) => n + (Number(f.params?.ms) || 0), 0)
    return {
      latency: (applies ? own.latency : 0) + delay,
      jitter: applies ? own.jitter : 0,
      loss: applies ? own.loss : 0,
      corrupt: applies ? own.corrupt : 0,
      block: (applies && own.block) || this.simFaults.some((f) => f.type === 'noResponse' || f.type === 'cut')
    }
  }

  /** Nouvelles connexions refusées : blocage dans les deux sens, ou coupure du simulateur. */
  refuses(rule) {
    const own = rule.config.faults
    return (own.block && own.direction === 'both') || this.simFaults.some((f) => f.type === 'cut')
  }

  // --- TCP ----------------------------------------------------------------------------------------

  async listenTcp(rule) {
    const { listenHost, listenPort } = rule.config
    const server = net.createServer((client) => this.acceptTcp(rule, client))
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(listenPort, listenHost, () => {
        server.off('error', reject)
        resolve()
      })
    })
    server.on('error', (err) => this.event('error', rule, t('proxy.log.error', { message: err.message })))
    rule.server = server
  }

  acceptTcp(rule, client) {
    const remote = remoteOf(client.remoteAddress, client.remotePort)
    client.on('error', () => {})
    if (this.refuses(rule)) {
      this.event('warn', rule, t('proxy.log.refused', { remote }))
      client.destroy()
      return
    }
    const session = this.newSession(rule, remote)
    session.client = client
    client.setNoDelay(true)
    // Données du client retenues jusqu'à la connexion à l'équipement.
    client.pause()
    const target = net.connect({ host: rule.config.targetHost, port: rule.config.targetPort })
    session.target = target
    target.setNoDelay(true)
    target.on('connect', () => client.resume())
    target.on('error', (err) => {
      session.error ??= err
    })
    client.on('data', (chunk) => this.relay(rule, session, 'up', chunk, (data) => target.write(data)))
    target.on('data', (chunk) => this.relay(rule, session, 'down', chunk, (data) => client.write(data)))
    client.on('close', () => this.endSession(rule, session, 'client'))
    target.on('close', () => this.endSession(rule, session, 'target'))
    this.event('info', rule, t('proxy.log.connected', { remote, target: this.target(rule) }), session)
  }

  // --- UDP ----------------------------------------------------------------------------------------

  async listenUdp(rule) {
    const { listenHost, listenPort } = rule.config
    const socket = dgram.createSocket(net.isIPv6(listenHost) ? 'udp6' : 'udp4')
    await new Promise((resolve, reject) => {
      socket.once('error', reject)
      socket.bind(listenPort, listenHost, () => {
        socket.off('error', reject)
        resolve()
      })
    })
    socket.on('error', (err) => this.event('error', rule, t('proxy.log.error', { message: err.message })))
    socket.on('message', (msg, rinfo) => this.receiveUdp(rule, msg, rinfo))
    rule.socket = socket
  }

  /** Datagramme d'un client : une session par adresse:port, avec son propre socket vers l'équipement. */
  receiveUdp(rule, msg, rinfo) {
    const remote = remoteOf(rinfo.address, rinfo.port)
    let session = rule.udp.get(remote)
    if (!session) {
      if (this.refuses(rule)) {
        rule.counters.dropped++
        this.data(rule, { id: null, remote }, 'up', msg, { fault: 'blocked' })
        this.touch()
        return
      }
      session = this.newSession(rule, remote)
      rule.udp.set(remote, session)
      const upstream = dgram.createSocket(net.isIPv6(rule.config.targetHost) ? 'udp6' : 'udp4')
      session.upstream = upstream
      upstream.on('error', (err) =>
        this.event(
          'error',
          rule,
          t('proxy.log.targetError', { target: this.target(rule), message: err.message }),
          session
        )
      )
      upstream.on('message', (data) => {
        this.keepAlive(rule, session)
        this.relay(rule, session, 'down', data, (out) => rule.socket?.send(out, rinfo.port, rinfo.address))
      })
      this.event('info', rule, t('proxy.log.udpSession', { remote, target: this.target(rule) }), session)
    }
    this.keepAlive(rule, session)
    this.relay(rule, session, 'up', msg, (out) =>
      session.upstream.send(out, rule.config.targetPort, rule.config.targetHost)
    )
  }

  /** Session UDP fermée après UDP_IDLE ms sans datagramme dans un sens ou dans l'autre. */
  keepAlive(rule, session) {
    clearTimeout(session.idleTimer)
    session.idleTimer = setTimeout(() => this.endSession(rule, session, 'idle'), UDP_IDLE)
  }

  // --- Sessions et relais ----------------------------------------------------------------------

  newSession(rule, remote) {
    const session = {
      id: this.nextConn++,
      remote,
      since: Date.now(),
      up: 0,
      down: 0,
      /** Envois retardés en attente, et heure du dernier envoi prévu par sens (ordre conservé). */
      timers: new Set(),
      next: { up: 0, down: 0 },
      closing: null,
      closed: false
    }
    rule.sessions.set(session.id, session)
    rule.counters.connections++
    this.touch()
    return session
  }

  /**
   * Relaie `chunk` dans le sens `dir` par `send(data)` après les défauts : blocage, perte (UDP),
   * altération, puis latence et gigue sans changer l'ordre des envois.
   */
  relay(rule, session, dir, chunk, send) {
    if (session.closed) return
    const faults = this.faultsFor(rule, dir)
    const counters = rule.counters
    this.touch()
    if (faults.block) {
      counters.dropped++
      this.data(rule, session, dir, chunk, { fault: 'blocked' })
      return
    }
    if (rule.config.protocol === 'udp' && faults.loss > 0 && Math.random() * 100 < faults.loss) {
      counters.dropped++
      this.data(rule, session, dir, chunk, { fault: 'lost' })
      return
    }
    let data = chunk
    let fault = null
    if (faults.corrupt > 0 && chunk.length && Math.random() * 100 < faults.corrupt) {
      data = Buffer.from(chunk)
      data[random(data.length)] ^= 1 << random(8)
      counters.corrupted++
      fault = 'corrupted'
    }
    const delay = faults.latency + (faults.jitter ? random(faults.jitter + 1) : 0)
    counters[dir] += data.length
    counters[`${dir}Packets`]++
    session[dir] += data.length
    this.data(rule, session, dir, data, { fault, delay })
    const now = Date.now()
    if (delay <= 0 && session.next[dir] <= now) {
      send(data)
      return
    }
    const at = Math.max(session.next[dir], now + delay)
    session.next[dir] = at
    const timer = setTimeout(() => {
      session.timers.delete(timer)
      if (!session.closed) send(data)
      // Fermeture demandée pendant l'attente : terminée une fois les envois retardés partis.
      if (session.closing && !session.timers.size) this.endSession(rule, session, session.closing)
    }, at - now)
    session.timers.add(timer)
  }

  /**
   * Fin d'une session : `by` vaut 'client', 'target', 'idle' (UDP), 'cut' ou 'stop'. Une fermeture
   * par le client ou l'équipement attend les envois retardés ; une coupure ou un arrêt les abandonne.
   */
  endSession(rule, session, by, { silent = false } = {}) {
    if (session.closed) return
    const forced = by === 'cut' || by === 'stop'
    if (!forced && session.timers.size) {
      session.closing ??= by
      return
    }
    session.closed = true
    for (const timer of session.timers) clearTimeout(timer)
    session.timers.clear()
    clearTimeout(session.idleTimer)
    session.client?.destroy()
    session.target?.destroy()
    try {
      session.upstream?.close()
    } catch {
      // socket déjà fermé
    }
    rule.sessions.delete(session.id)
    rule.udp.delete(session.remote)
    this.touch()
    if (silent) return
    const { remote, up, down } = session
    const err = session.error
    if (err?.code === 'ECONNREFUSED') {
      this.event('error', rule, t('proxy.log.targetRefused', { remote, target: this.target(rule) }), session)
    } else if (err && by === 'target') {
      this.event(
        'error',
        rule,
        t('proxy.log.targetError', { target: this.target(rule), message: err.message }),
        session
      )
    } else {
      this.event('info', rule, t('proxy.log.closed', { remote, by: t(`proxy.log.by.${by}`), up, down }), session)
    }
  }

  // --- Journal ------------------------------------------------------------------------------------

  /** Envoi relayé (ou bloqué, perdu) enregistré dans le journal si la capture est active. */
  data(rule, session, dir, bytes, { fault = null, delay = 0 } = {}) {
    if (!this.capture) return
    this.append({
      rule: rule.config.id,
      name: rule.config.name,
      conn: session.id,
      remote: session.remote,
      dir,
      size: bytes.length,
      hex: Buffer.from(bytes.subarray(0, MAX_LOGGED)).toString('hex'),
      ...(fault ? { fault } : {}),
      ...(delay > 0 ? { delay } : {})
    })
  }

  /** Message du journal (démarrage, connexion, erreur, coupure). */
  event(level, rule, text, session = null) {
    this.append({
      rule: rule?.config.id ?? null,
      name: rule?.config.name ?? null,
      ...(session ? { conn: session.id, remote: session.remote } : {}),
      dir: 'event',
      level,
      text
    })
  }

  append(entry) {
    const full = { id: this.nextId++, time: Date.now(), ...entry }
    this.log.push(full)
    if (this.log.length > MAX_LOG) this.log.splice(0, this.log.length - MAX_LOG)
    this.outbox.push(full)
    this.emitTimer ??= setTimeout(() => {
      this.emitTimer = null
      const batch = this.outbox
      this.outbox = []
      this.onLog(batch)
    }, EMIT_PERIOD)
  }

  clearLog() {
    this.log = []
    this.outbox = []
    return this.log
  }

  /** Journal en texte : une ligne par entrée (heure, redirection, connexion, sens, taille, octets). */
  exportText() {
    const lines = this.log.map((e) => {
      const time = new Date(e.time).toISOString()
      const where = [e.name, e.conn ? `#${e.conn}` : null, e.remote].filter(Boolean).join(' ')
      if (e.dir === 'event') return `${time} ${where} -- ${e.text}`
      const bytes = Buffer.from(e.hex, 'hex')
      const notes = [
        e.fault,
        e.delay ? `+${e.delay} ms` : null,
        e.size > bytes.length ? `${bytes.length}/${e.size}` : null
      ]
        .filter(Boolean)
        .join(', ')
      const dir = e.dir === 'up' ? 'C>S' : 'S>C'
      return `${time} ${where} ${dir} [${e.size}] ${toHex(bytes)} | ${escapedText(bytes)}${notes ? ` (${notes})` : ''}`
    })
    return lines.join('\n') + (lines.length ? '\n' : '')
  }

  /** Arrêt du module : redirections arrêtées, minuteries annulées. */
  async dispose() {
    await this.stopAll().catch(() => {})
    clearTimeout(this.emitTimer)
    clearTimeout(this.statusTimer)
    this.emitTimer = null
    this.statusTimer = null
  }
}
