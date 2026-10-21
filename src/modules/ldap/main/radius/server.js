import dgram from 'dgram'
import { randomUUID } from 'crypto'
import { ipToInt, isIPv4 } from '@shared/networks'
import {
  CODES,
  DEFAULT_RADIUS_SERVER_CONFIG,
  MAX_RADIUS_LOG,
  attributeName,
  formatAttribute,
  requireAttributes
} from '../../shared/radius'
import { checkPassword } from '../server'
import {
  ATTR,
  CODE,
  ProtocolError,
  attribute,
  buildResponse,
  checkAccountingRequest,
  checkChap,
  checkMessageAuthenticator,
  decodePacket,
  encodeAttribute,
  revealPassword
} from './protocol'
import { t } from '../../shared/i18n'

const STATUS_EMIT_INTERVAL = 500
/** Durée pendant laquelle une requête répétée (même source, identifiant et authentificateur) reçoit la même réponse. */
const DUPLICATE_WINDOW = 5000
/** Sessions d'accounting conservées au plus. */
const MAX_SESSIONS = 1000

/** Adresse IPv4 d'une source UDP (forme IPv6 « ::ffff:a.b.c.d » acceptée). */
const plainAddress = (address) => String(address).replace(/^::ffff:/i, '')

/** Une adresse appartient-elle à « a.b.c.d », « a.b.c.d/n » (ou à une adresse IPv6 identique) ? */
export function addressMatches(address, pattern) {
  const ip = plainAddress(address)
  const [network, bits] = String(pattern).trim().split('/')
  if (bits === undefined) return ip === network
  const prefix = Number(bits)
  if (!isIPv4(ip) || !isIPv4(network) || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false
  const size = 2 ** (32 - prefix)
  return Math.floor(ipToInt(ip) / size) === Math.floor(ipToInt(network) / size)
}

/** Mot de passe en clair d'une valeur userPassword (null si elle est hachée : CHAP impossible). */
function cleartext(stored) {
  const m = String(stored).match(/^\{([^}]*)\}(.*)$/s)
  if (!m) return String(stored)
  return m[1].toUpperCase() === 'CLEARTEXT' ? m[2] : null
}

const validPort = (value) => Number.isInteger(value) && value >= 1 && value <= 65535

/** Valeurs d'un attribut d'une entrée d'annuaire, sans tenir compte de la casse du nom. */
const entryValues = (entry, name) =>
  entry.attributes[Object.keys(entry.attributes).find((k) => k.toLowerCase() === name.toLowerCase())] ?? []

/**
 * Serveur RADIUS (RFC 2865, 2866, 3579, 5997) : authentification PAP et CHAP des comptes locaux et de
 * l'annuaire LDAP du module, accounting (sessions ouvertes par Start, fermées par Stop), Status-Server.
 * Seuls les équipements déclarés (adresse ou réseau, secret partagé) reçoivent une réponse.
 *
 * `getDirectory()` : annuaire du serveur LDAP (Map DN → entrée, voir buildDirectory), ou null.
 */
export class RadiusServer {
  sockets = []
  config = null
  prepared = null
  logEntries = []
  counters = { requests: 0, accepts: 0, rejects: 0, dropped: 0, accounting: 0 }
  sessions = new Map()
  recent = new Map()
  faults = []

  constructor(getDirectory = () => null, { onStatus = () => {}, onLog = () => {} } = {}) {
    this.getDirectory = getDirectory
    this.onStatus = onStatus
    this.onLog = onLog
  }

  get running() {
    return this.sockets.length > 0
  }

  status() {
    const { host, authPort, acctPort, accounting } = this.config ?? {}
    return {
      running: this.running,
      config: this.config,
      endpoints: this.running
        ? [`udp://${host}:${authPort}`, ...(accounting ? [`udp://${host}:${acctPort}`] : [])]
        : [],
      counters: { ...this.counters },
      sessions: [...this.sessions.values()]
    }
  }

  /** Configuration validée : clients, comptes et attributs de réponse lus. */
  prepare(options) {
    const config = { ...DEFAULT_RADIUS_SERVER_CONFIG, ...options }
    const authPort = Number(config.authPort)
    const acctPort = Number(config.acctPort)
    if (!validPort(authPort) || (config.accounting && !validPort(acctPort))) {
      throw new Error(t('radius.errors.invalidPort'))
    }
    if (config.accounting && authPort === acctPort) throw new Error(t('radius.errors.samePort'))
    const clients = (config.clients ?? []).map((c) => {
      const address = String(c.address ?? '').trim()
      const [network, bits] = address.split('/')
      const valid = bits === undefined ? !!network : isIPv4(network) && /^\d+$/.test(bits) && Number(bits) <= 32
      if (!valid) throw new Error(t('radius.errors.invalidClient', { address: address || '—' }))
      if (!c.secret) throw new Error(t('radius.errors.missingSecret', { name: c.name || address }))
      return { name: c.name || address, address, secret: String(c.secret) }
    })
    if (!clients.length) throw new Error(t('radius.errors.noClient'))
    const users = new Map()
    for (const u of config.users ?? []) {
      const username = String(u.username ?? '').trim()
      if (!username) continue
      const attributes = this.replyAttributes(u.attributes, username)
      users.set(username.toLowerCase(), { username, password: String(u.password ?? ''), attributes })
    }
    const directory = { ...DEFAULT_RADIUS_SERVER_CONFIG.directory, ...config.directory }
    const directoryAttributes = this.replyAttributes(directory.attributes, t('radius.server.directoryUsers'))
    return {
      config: { ...config, authPort, acctPort, directory },
      clients,
      users,
      directoryAttributes
    }
  }

  /** Attributs de réponse codés d'un compte (erreur traduite si la saisie est invalide). */
  replyAttributes(text, owner) {
    try {
      return requireAttributes(text).map((a) => ({ ...a, encoded: encodeAttribute(a) }))
    } catch (err) {
      throw new Error(t('radius.errors.userAttributes', { name: owner, message: err.message }), { cause: err })
    }
  }

  async start(options) {
    if (this.running) throw new Error(t('errors.alreadyStarted'))
    const prepared = this.prepare(options)
    const { config } = prepared
    const host = config.host || '0.0.0.0'
    const ports = [['auth', config.authPort], ...(config.accounting ? [['acct', config.acctPort]] : [])]
    const sockets = []
    try {
      for (const [kind, port] of ports) sockets.push(await this.bind(kind, host, port))
    } catch (err) {
      for (const socket of sockets) socket.close()
      throw err
    }
    this.sockets = sockets
    this.config = { ...config, host }
    this.prepared = prepared
    this.counters = { requests: 0, accepts: 0, rejects: 0, dropped: 0, accounting: 0 }
    this.sessions.clear()
    this.recent.clear()
    this.statusTimer = setInterval(() => {
      const snapshot = JSON.stringify([this.counters, this.sessions.size])
      if (snapshot !== this.lastSnapshot) {
        this.lastSnapshot = snapshot
        this.onStatus(this.status())
      }
      const now = Date.now()
      for (const [key, entry] of this.recent) if (now - entry.time > DUPLICATE_WINDOW) this.recent.delete(key)
    }, STATUS_EMIT_INTERVAL)
    this.log('info', '', t('radius.log.started', { endpoints: this.status().endpoints.join(', ') }))
    this.onStatus(this.status())
    return this.status()
  }

  bind(kind, host, port) {
    const socket = dgram.createSocket(host.includes(':') ? 'udp6' : 'udp4')
    return new Promise((resolve, reject) => {
      socket.once('error', (err) => {
        if (err.code === 'EACCES') reject(new Error(t('radius.errors.portPrivileged', { port }), { cause: err }))
        else if (err.code === 'EADDRINUSE') reject(new Error(t('radius.errors.portInUse', { port }), { cause: err }))
        else reject(err)
      })
      socket.bind(port, host, () => {
        socket.removeAllListeners('error')
        socket.on('error', (err) => this.log('error', '', err.message))
        socket.on('message', (msg, rinfo) =>
          this.receive(kind, socket, msg, rinfo).catch((err) => this.log('error', rinfo.address, err.message))
        )
        resolve(socket)
      })
    })
  }

  async stop() {
    clearInterval(this.statusTimer)
    const sockets = this.sockets
    this.sockets = []
    if (sockets.length) {
      await Promise.all(sockets.map((s) => new Promise((resolve) => s.close(() => resolve()))))
      this.log('info', '', t('radius.log.stopped'))
    }
    this.onStatus(this.status())
    return this.status()
  }

  /** Clients, comptes et annuaire modifiés serveur démarré (ports et adresse inchangés). */
  update(options) {
    if (!this.running) throw new Error(t('errors.notStarted'))
    const { host, authPort, acctPort, accounting } = this.config
    const prepared = this.prepare({ ...options, host, authPort, acctPort, accounting })
    this.prepared = prepared
    this.config = { ...prepared.config, host }
    this.log('info', '', t('radius.log.updated', { clients: prepared.clients.length, users: prepared.users.size }))
    this.onStatus(this.status())
    return this.status()
  }

  logs() {
    return this.logEntries
  }

  clearLogs() {
    this.logEntries = []
    return []
  }

  log(level, remote, message) {
    const entry = { id: randomUUID(), time: new Date().toISOString(), level, remote, message }
    this.logEntries.push(entry)
    if (this.logEntries.length > MAX_RADIUS_LOG) this.logEntries.splice(0, this.logEntries.length - MAX_RADIUS_LOG)
    this.onLog(entry)
  }

  setFaults(faults = []) {
    this.faults = faults
  }

  fault(type) {
    return this.faults.find((f) => f.type === type)
  }

  // --- Requêtes -----------------------------------------------------------------------------

  async receive(kind, socket, msg, rinfo) {
    const remote = `${plainAddress(rinfo.address)}:${rinfo.port}`
    const drop = (message) => {
      this.counters.dropped++
      this.log('warn', remote, message)
    }
    const client = this.prepared.clients.find((c) => addressMatches(rinfo.address, c.address))
    if (!client) return drop(t('radius.log.unknownClient'))
    let packet
    try {
      packet = decodePacket(msg)
    } catch (err) {
      if (err instanceof ProtocolError) return drop(t('radius.log.malformed', { message: err.message }))
      throw err
    }
    // Requête répétée par le client (réponse perdue) : même réponse, sans nouveau traitement.
    const key = `${remote}/${kind}/${packet.id}/${packet.authenticator.toString('hex')}`
    const previous = this.recent.get(key)
    if (previous) {
      if (previous.response) socket.send(previous.response, rinfo.port, rinfo.address)
      return
    }
    const pending = { time: Date.now(), response: null }
    this.recent.set(key, pending)

    if (this.fault('noResponse')) return
    const delay = Number(this.fault('delay')?.params?.ms) || 0
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))

    const reply = (code, attributes, options) => {
      const proxyStates = packet.attributes.filter((a) => a.type === ATTR.proxyState)
      const response = buildResponse(
        code,
        packet,
        [...attributes, ...proxyStates.map((a) => encodeAttribute({ type: a.type, value: a.data }))],
        client.secret,
        options
      )
      pending.response = response
      if (this.running) socket.send(response, rinfo.port, rinfo.address)
    }

    if (kind === 'acct') return this.accounting(packet, client, remote, reply, drop)
    if (packet.code === CODE.statusServer) {
      if (checkMessageAuthenticator(packet.raw, client.secret) !== true) {
        return drop(t('radius.log.badMessageAuthenticator', { client: client.name }))
      }
      this.log('info', remote, t('radius.log.statusServer', { client: client.name }))
      return reply(CODE.accessAccept, [encodeAttribute({ type: ATTR.replyMessage, value: 'Sulfur RADIUS server' })], {
        messageAuthenticator: true
      })
    }
    if (packet.code !== CODE.accessRequest) {
      return drop(t('radius.log.unexpectedCode', { code: CODES[packet.code] ?? packet.code }))
    }
    return this.authenticate(packet, client, remote, reply, drop)
  }

  authenticate(packet, client, remote, reply, drop) {
    const ma = checkMessageAuthenticator(packet.raw, client.secret)
    if (ma === false) return drop(t('radius.log.badMessageAuthenticator', { client: client.name }))
    if (ma === null && this.config.requireMessageAuthenticator) {
      return drop(t('radius.log.missingMessageAuthenticator', { client: client.name }))
    }
    this.counters.requests++
    // Message-Authenticator toujours renvoyé (recommandation RFC 3579 et protection Blast-RADIUS).
    const options = { messageAuthenticator: true }
    const username = attribute(packet, ATTR.userName)?.toString('utf8') ?? ''
    const reject = (reason, method = '') => {
      this.counters.rejects++
      this.log('warn', remote, t('radius.log.reject', { user: username || '—', method, reason }))
      return reply(CODE.accessReject, [], options)
    }

    const forced = this.fault('exception')
    if (forced) return reject(t('radius.log.forced'))
    if (!username) return reject(t('radius.log.noUserName'))

    const userPassword = attribute(packet, ATTR.userPassword)
    const chapPassword = attribute(packet, ATTR.chapPassword)
    let method
    let check
    if (userPassword) {
      method = 'PAP'
      const password = revealPassword(userPassword, client.secret, packet.authenticator)
      if (password === null) return reject(t('radius.log.badPassword'), method)
      check = (account) => account.verify(password)
    } else if (chapPassword) {
      method = 'CHAP'
      const challenge = attribute(packet, ATTR.chapChallenge) ?? packet.authenticator
      check = (account) => {
        const clear = account.cleartext()
        if (clear === null) return 'chapNeedsCleartext'
        return clear.some((p) => checkChap(chapPassword, p, challenge))
      }
    } else {
      return reject(t(attribute(packet, ATTR.eapMessage) ? 'radius.log.eapUnsupported' : 'radius.log.noPassword'))
    }

    const account = this.findAccount(username)
    if (!account) return reject(t('radius.log.unknownUser'), method)
    const result = check(account)
    if (result === 'chapNeedsCleartext') return reject(t('radius.log.chapNeedsCleartext'), method)
    if (!result) return reject(t('radius.log.wrongPassword'), method)

    this.counters.accepts++
    const summary = account.attributes.map((a) => `${attributeName(a)}=${formatAttribute(a)}`).join(', ')
    this.log(
      'info',
      remote,
      t('radius.log.accept', { user: username, method, source: account.source, attributes: summary || '—' })
    )
    return reply(
      CODE.accessAccept,
      account.attributes.map((a) => a.encoded),
      options
    )
  }

  /**
   * Compte d'un nom d'utilisateur : local d'abord, puis annuaire LDAP. Retourne { source, attributes,
   * verify(password), cleartext() } ou null.
   */
  findAccount(username) {
    const local = this.prepared.users.get(username.toLowerCase())
    if (local) {
      return {
        source: t('radius.log.sourceLocal'),
        attributes: local.attributes,
        verify: (password) => password === local.password,
        cleartext: () => [local.password]
      }
    }
    const { directory: settings } = this.config
    if (!settings.enabled) return null
    const directory = this.getDirectory()
    if (!directory) return null
    const name = username.toLowerCase()
    const entry = [...directory.values()].find((e) =>
      entryValues(e, settings.attribute || 'uid').some((v) => v.toLowerCase() === name)
    )
    const passwords = entry ? entryValues(entry, 'userPassword') : []
    if (!passwords.length) return null
    return {
      source: entry.dn,
      attributes: this.prepared.directoryAttributes,
      verify: (password) => passwords.some((p) => checkPassword(password, p)),
      cleartext: () => {
        const clear = passwords.map(cleartext).filter((p) => p !== null)
        return clear.length ? clear : null
      }
    }
  }

  accounting(packet, client, remote, reply, drop) {
    if (packet.code === CODE.statusServer) {
      if (checkMessageAuthenticator(packet.raw, client.secret) !== true) {
        return drop(t('radius.log.badMessageAuthenticator', { client: client.name }))
      }
      return reply(CODE.accountingResponse, [], { messageAuthenticator: true })
    }
    if (packet.code !== CODE.accountingRequest) {
      return drop(t('radius.log.unexpectedCode', { code: CODES[packet.code] ?? packet.code }))
    }
    if (!checkAccountingRequest(packet.raw, client.secret)) {
      return drop(t('radius.log.badAccountingAuthenticator', { client: client.name }))
    }
    this.counters.accounting++
    const value = (type) => packet.attributes.find((a) => a.type === type)?.value
    const statusType = value(ATTR.acctStatusType)
    const sessionId = value(ATTR.acctSessionId) ?? ''
    const user = value(ATTR.userName) ?? ''
    const key = `${client.name}/${sessionId}`
    const label = { 1: 'Start', 2: 'Stop', 3: 'Interim-Update', 7: 'Accounting-On', 8: 'Accounting-Off' }[statusType]
    if (statusType === 1) {
      if (this.sessions.size < MAX_SESSIONS || this.sessions.has(key)) {
        this.sessions.set(key, { key, sessionId, user, client: client.name, remote, since: new Date().toISOString() })
      }
    } else if (statusType === 2) {
      this.sessions.delete(key)
    } else if (statusType === 3) {
      const session = this.sessions.get(key)
      if (session) session.updated = new Date().toISOString()
    } else if (statusType === 7 || statusType === 8) {
      // Redémarrage de l'équipement : ses sessions sont closes.
      for (const [k, s] of this.sessions) if (s.client === client.name) this.sessions.delete(k)
    }
    const time = value(ATTR.acctSessionTime)
    this.log(
      'info',
      remote,
      t('radius.log.accounting', {
        type: label ?? statusType ?? '?',
        user: user || '—',
        session: sessionId || '—',
        time: time === undefined ? '—' : `${time} s`
      })
    )
    return reply(CODE.accountingResponse, [])
  }
}
