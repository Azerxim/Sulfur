import fs from 'fs/promises'
import { createReadStream, createWriteStream } from 'fs'
import net from 'net'
import tls from 'tls'
import path from 'path'
import { Transform } from 'stream'
import { pipeline } from 'stream/promises'
import { randomUUID } from 'crypto'
import { hashPassword, isPasswordHash, verifyPassword } from '@shared/passwords'
import { OutsideRoot, prepareRoot, resolveInside, virtualPath } from '@shared/files'
import { DEFAULT_SERVER_CONFIG, MAX_LOG, TLS_MODES } from '../shared/constants'
import { t } from '../shared/i18n'

const STATUS_EMIT_INTERVAL = 500
/** Attente de la connexion de données (mode passif ou actif). */
const DATA_TIMEOUT = 15_000
/** Fermeture d'une session inactive. */
const IDLE_TIMEOUT = 300_000
const ANONYMOUS = ['anonymous', 'ftp']
const SIX_MONTHS = 182 * 86_400_000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Commandes acceptées avant la connexion. */
const BEFORE_LOGIN = new Set(['USER', 'PASS', 'AUTH', 'PBSZ', 'PROT', 'FEAT', 'SYST', 'NOOP', 'QUIT', 'OPTS', 'HELP'])
/** Commandes de transfert (défaut « réponse forcée »). */
const TRANSFER_COMMANDS = new Set(['LIST', 'NLST', 'MLSD', 'RETR', 'STOR', 'APPE'])
/** Commandes d'écriture, refusées aux utilisateurs en lecture seule. */
const WRITE_COMMANDS = new Set(['STOR', 'APPE', 'DELE', 'MKD', 'XMKD', 'RMD', 'XRMD', 'RNFR', 'RNTO'])
const ALIASES = { XPWD: 'PWD', XCWD: 'CWD', XCUP: 'CDUP', XMKD: 'MKD', XRMD: 'RMD' }

/** Réponse d'erreur FTP (code à 3 chiffres). */
class Reply extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

/** Plage de ports « min-max » (ou port unique) ; null si vide. */
export function parsePortRange(text) {
  const value = String(text ?? '').trim()
  if (!value) return null
  const match = value.match(/^(\d+)\s*(?:-\s*(\d+))?$/)
  const min = Number(match?.[1])
  const max = Number(match?.[2] ?? match?.[1])
  if (!match || !(min >= 1024 && max <= 65535 && min <= max)) throw new Error(t('ftp.errors.invalidPassivePorts'))
  return { min, max }
}

const plainAddress = (address) => String(address ?? '').replace(/^::ffff:/, '')

/** Date « YYYYMMDDHHMMSS » (UTC) des commandes MDTM et MLSD. */
const timeval = (date) => date.toISOString().replace(/[-:T]/g, '').slice(0, 14)

/** Ligne de type « ls -l » (LIST). */
function listLine(name, stats) {
  const type = stats.isDirectory() ? 'd' : stats.isSymbolicLink() ? 'l' : '-'
  const perms = [6, 3, 0]
    .map((shift) => {
      const bits = (stats.mode >> shift) & 7
      return `${bits & 4 ? 'r' : '-'}${bits & 2 ? 'w' : '-'}${bits & 1 ? 'x' : '-'}`
    })
    .join('')
  const date = stats.mtime
  const day = `${MONTHS[date.getMonth()]} ${String(date.getDate()).padStart(2, ' ')}`
  const when =
    Math.abs(Date.now() - date.getTime()) < SIX_MONTHS
      ? `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
      : ` ${date.getFullYear()}`
  return `${type}${perms} 1 ftp ftp ${String(stats.size).padStart(12)} ${day} ${when} ${name}`
}

/** Faits MLSD / MLST d'une entrée (RFC 3659). */
function facts(name, stats, writable, type) {
  const kind = type ?? (stats.isDirectory() ? 'dir' : stats.isSymbolicLink() ? 'OS.unix=symlink' : 'file')
  const perm = stats.isDirectory() ? (writable ? 'elcmp' : 'el') : writable ? 'radfw' : 'r'
  const size = stats.isDirectory() ? '' : `size=${stats.size};`
  return `type=${kind};${size}modify=${timeval(stats.mtime)};perm=${perm}; ${name}`
}

/** Conversion des fins de ligne en CR LF (envoi en mode ASCII). */
function toCrlf() {
  let lastCr = false
  return new Transform({
    transform(chunk, _encoding, done) {
      const out = []
      for (const byte of chunk) {
        if (byte === 0x0a && !lastCr) out.push(0x0d)
        out.push(byte)
        lastCr = byte === 0x0d
      }
      done(null, Buffer.from(out))
    }
  })
}

/** Conversion des fins de ligne CR LF en LF (réception en mode ASCII). */
function fromCrlf() {
  let pendingCr = false
  return new Transform({
    transform(chunk, _encoding, done) {
      const out = []
      for (const byte of chunk) {
        if (pendingCr && byte !== 0x0a) out.push(0x0d)
        pendingCr = byte === 0x0d
        if (!pendingCr) out.push(byte)
      }
      done(null, Buffer.from(out))
    },
    flush(done) {
      done(null, pendingCr ? Buffer.from([0x0d]) : null)
    }
  })
}

/** Compte les octets transférés. */
function counter(onBytes) {
  return new Transform({
    transform(chunk, _encoding, done) {
      onBytes(chunk.length)
      done(null, chunk)
    }
  })
}

/**
 * Serveur FTP (RFC 959, 2428, 3659) servant un dossier, avec FTPS explicite (AUTH TLS, RFC 4217)
 * ou implicite : utilisateurs avec mot de passe, connexion anonyme facultative en lecture seule,
 * modes passif et actif. Les chemins sont confinés au dossier servi.
 */
export class FtpServer {
  server = null
  config = null
  users = new Map()
  sessions = new Map()
  /** Toutes les connexions de commande, y compris celles refusées (fermées à l'arrêt). */
  connections = new Set()
  logEntries = []
  counters = { logins: 0, failures: 0, uploads: 0, downloads: 0, bytesIn: 0, bytesOut: 0 }
  faults = []
  seq = 0

  /** `getCertificate()` : { cert, key, info } du certificat du serveur (FTPS). */
  constructor(getCertificate, defaultRoot, { onStatus = () => {}, onLog = () => {} } = {}) {
    this.getCertificate = getCertificate
    this.defaultRoot = defaultRoot
    this.onStatus = onStatus
    this.onLog = onLog
  }

  get running() {
    return !!this.server
  }

  status() {
    return {
      running: this.running,
      endpoint: this.running
        ? `${this.config.tls === 'implicit' ? 'ftps' : 'ftp'}://${this.config.host}:${this.config.port}`
        : null,
      config: this.config,
      root: this.running ? this.root : null,
      certificate: this.running ? (this.certificate ?? null) : null,
      counters: { ...this.counters },
      sessions: [...this.sessions.values()].map((s) => ({
        id: s.id,
        remote: s.remote,
        username: s.user?.username ?? null,
        secure: s.secure,
        since: s.since
      }))
    }
  }

  /** Utilisateurs : mot de passe saisi (`password`) haché, empreinte existante conservée. */
  async prepareUsers(users = [], anonymous = false) {
    const prepared = new Map()
    for (const u of users) {
      const username = String(u.username ?? '').trim()
      if (!username) throw new Error(t('ftp.errors.emptyUsername'))
      if (ANONYMOUS.includes(username.toLowerCase())) throw new Error(t('ftp.errors.reservedUser', { name: username }))
      if (prepared.has(username)) throw new Error(t('ftp.errors.duplicateUser', { name: username }))
      const passwordHash = isPasswordHash(u.passwordHash)
        ? u.passwordHash
        : u.password
          ? await hashPassword(u.password)
          : null
      if (!passwordHash) throw new Error(t('ftp.errors.noPassword', { name: username }))
      prepared.set(username, { username, passwordHash, readOnly: !!u.readOnly })
    }
    if (!prepared.size && !anonymous) throw new Error(t('ftp.errors.noUser'))
    return prepared
  }

  /** Configuration conservée : mots de passe remplacés par leur empreinte. */
  storedUsers(users, prepared) {
    return users.map(({ password: _password, ...u }) => ({
      ...u,
      passwordHash: prepared.get(String(u.username).trim())?.passwordHash ?? ''
    }))
  }

  async start(options) {
    if (this.running) throw new Error(t('errors.alreadyStarted'))
    const config = { ...DEFAULT_SERVER_CONFIG, ...options }
    const port = Number(config.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(t('ftp.errors.invalidPort'))
    if (!TLS_MODES.includes(config.tls)) throw new Error(t('ftp.errors.invalidTls'))
    const passiveRange = parsePortRange(config.passivePorts)
    const passiveAddress = String(config.passiveAddress ?? '').trim()
    if (passiveAddress && !net.isIPv4(passiveAddress)) throw new Error(t('ftp.errors.invalidPassiveAddress'))
    const users = await this.prepareUsers(config.users, config.anonymous)
    const prepared = await prepareRoot(String(config.root ?? '').trim() || this.defaultRoot)
    if (!prepared) throw new Error(t('ftp.errors.invalidRoot', { path: config.root }))

    this.tlsContext = null
    this.certificate = null
    let credentials = null
    if (config.tls !== 'none') {
      const { cert, key, info } = await this.getCertificate()
      credentials = { cert, key, minVersion: 'TLSv1.2' }
      this.tlsContext = tls.createSecureContext(credentials)
      this.certificate = info
    }
    const server =
      config.tls === 'implicit'
        ? tls.createServer(credentials, (socket) => this.onConnection(socket, true))
        : net.createServer((socket) => this.onConnection(socket, false))
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, config.host || '0.0.0.0', () => {
          server.off('error', reject)
          resolve()
        })
      })
    } catch (err) {
      if (err.code === 'EACCES') throw new Error(t('ftp.errors.portPrivileged', { port }), { cause: err })
      if (err.code === 'EADDRINUSE') throw new Error(t('ftp.errors.portInUse', { port }), { cause: err })
      throw err
    }
    server.on('error', (err) => this.log('error', '', err.message))
    // Échec de la négociation TLS implicite : connexion fermée, signalée dans le journal.
    server.on('tlsClientError', (err, socket) =>
      this.log(
        'warn',
        `${socket?.remoteAddress ?? ''}:${socket?.remotePort ?? ''}`,
        t('ftp.log.tlsFailed', { message: err.message })
      )
    )
    this.server = server
    this.root = prepared.root
    this.realRoot = prepared.realRoot
    this.users = users
    this.passiveRange = passiveRange
    this.config = { ...config, port, passiveAddress, users: this.storedUsers(config.users, users) }
    this.counters = { logins: 0, failures: 0, uploads: 0, downloads: 0, bytesIn: 0, bytesOut: 0 }
    this.statusTimer = setInterval(() => {
      const snapshot = JSON.stringify(this.counters)
      if (snapshot !== this.lastCounters) {
        this.lastCounters = snapshot
        this.onStatus(this.status())
      }
    }, STATUS_EMIT_INTERVAL)
    this.log('info', '', t('ftp.log.started', { endpoint: this.status().endpoint, root: this.root }))
    this.onStatus(this.status())
    return this.status()
  }

  async stop() {
    clearInterval(this.statusTimer)
    const server = this.server
    for (const session of this.sessions.values()) session.close()
    for (const socket of this.connections) socket.destroy()
    this.sessions.clear()
    this.connections.clear()
    this.server = null
    if (server) {
      await new Promise((resolve) => server.close(() => resolve()))
      this.log('info', '', t('ftp.log.stopped'))
    }
    this.onStatus(this.status())
    return this.status()
  }

  /**
   * Utilisateurs, connexion anonyme, mode actif, bannière et journal des commandes modifiés serveur
   * démarré (les sessions ouvertes gardent leurs droits).
   */
  async update(options) {
    if (!this.running) throw new Error(t('errors.notStarted'))
    const config = { ...this.config, ...options }
    const users = config.users ?? []
    const prepared = await this.prepareUsers(users, config.anonymous)
    this.users = prepared
    this.config = {
      ...this.config,
      anonymous: !!config.anonymous,
      allowActive: !!config.allowActive,
      logCommands: !!config.logCommands,
      banner: String(config.banner ?? ''),
      users: this.storedUsers(users, prepared)
    }
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
    if (this.logEntries.length > MAX_LOG) this.logEntries.splice(0, this.logEntries.length - MAX_LOG)
    this.onLog(entry)
  }

  setFaults(faults = []) {
    const wasCut = !!this.fault('cut')
    this.faults = faults
    if (this.running && !wasCut && this.fault('cut')) {
      for (const session of this.sessions.values()) session.close()
      this.log('warn', '', t('ftp.log.faultCutAll'))
    }
  }

  fault(type) {
    return this.faults.find((f) => f.type === type)
  }

  onConnection(socket, secure) {
    const remote = `${plainAddress(socket.remoteAddress)}:${socket.remotePort}`
    socket.on('error', () => {})
    this.connections.add(socket)
    socket.on('close', () => this.connections.delete(socket))
    if (this.fault('cut')) {
      this.log('warn', remote, t('ftp.log.faultCut'))
      socket.end('421 Service not available, closing control connection.\r\n')
      return
    }
    const session = new Session(this, socket, secure, remote, ++this.seq)
    this.sessions.set(session.id, session)
    socket.on('close', () => {
      session.closeData()
      if (this.sessions.delete(session.id)) {
        if (session.user) this.log('info', remote, t('ftp.log.disconnected', { name: session.user.username }))
        this.onStatus(this.status())
      }
    })
    this.onStatus(this.status())
    session.greet()
  }
}

/** Session FTP : canal de commande, état de connexion et connexion de données. */
class Session {
  buffer = ''
  queue = Promise.resolve()
  user = null
  pendingUser = null
  cwd = '/'
  type = 'A'
  rest = 0
  renameFrom = null
  prot = 'C'
  passive = null
  active = null
  epsvAll = false
  transfer = null

  constructor(server, socket, secure, remote, id) {
    this.server = server
    this.socket = socket
    this.secure = secure
    this.remote = remote
    this.id = id
    this.since = new Date().toISOString()
    this.attach(socket)
  }

  get config() {
    return this.server.config
  }

  attach(socket) {
    socket.setTimeout(IDLE_TIMEOUT, () => {
      this.write('421 Timeout, closing control connection.')
      this.close()
    })
    socket.on('data', (chunk) => this.onData(chunk))
  }

  greet() {
    if (this.server.fault('noResponse')) return
    this.reply(220, this.config.banner || 'FTP server ready')
  }

  close() {
    this.closeData()
    this.socket.destroy()
  }

  write(text) {
    if (!this.socket.destroyed) this.socket.write(`${text}\r\n`)
  }

  /** Réponse FTP ; plusieurs lignes : « code-… » puis « code texte final ». */
  async reply(code, text, lines = []) {
    const ms = Number(this.server.fault('delay')?.params?.ms) || 0
    if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms))
    if (lines.length) this.write([`${code}-${text}`, ...lines.map((l) => ` ${l}`), `${code} End`].join('\r\n'))
    else this.write(`${code} ${text}`)
  }

  onData(chunk) {
    this.buffer += chunk.toString('utf8')
    if (this.buffer.length > 8192 && !this.buffer.includes('\n')) {
      this.buffer = ''
      this.reply(500, 'Command line too long')
      return
    }
    let index
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      // Séquences Telnet (IAC) ignorées.
      const line = this.buffer
        .slice(0, index)
        .replace(/\r$/, '')
        .replace(/\xff[\xf0-\xfe]./g, '')
      this.buffer = this.buffer.slice(index + 1)
      const space = line.indexOf(' ')
      const verb = (space < 0 ? line : line.slice(0, space)).toUpperCase()
      const arg = space < 0 ? '' : line.slice(space + 1)
      // ABOR et STAT pendant un transfert : traités sans attendre la fin de la commande en cours.
      if (verb === 'ABOR' && this.transfer) {
        this.abort()
        continue
      }
      this.queue = this.queue.then(() => this.handle(verb, arg)).catch(() => {})
    }
  }

  async handle(rawVerb, arg) {
    if (this.socket.destroyed || this.server.fault('noResponse')) return
    const verb = ALIASES[rawVerb] ?? rawVerb
    if (this.config.logCommands) {
      const shown = verb === 'PASS' ? '****' : arg
      this.server.log('info', this.remote, `> ${rawVerb}${shown ? ` ${shown}` : ''}`)
    }
    try {
      const handler = this[`cmd${verb}`]
      if (!/^[A-Z]{3,4}$/.test(verb) || !handler) throw new Reply(502, 'Command not implemented')
      if (!this.user && !BEFORE_LOGIN.has(verb)) throw new Reply(530, 'Please login with USER and PASS')
      if (WRITE_COMMANDS.has(verb) && this.user?.readOnly) throw new Reply(550, 'Permission denied')
      const forced = this.server.fault('exception')
      if (forced && TRANSFER_COMMANDS.has(verb)) {
        const code = Number(forced.params?.code) || 451
        this.closeData()
        await this.reply(
          code,
          code === 421 ? 'Service not available, closing control connection' : 'Requested action aborted'
        )
        this.server.log('warn', this.remote, t('ftp.log.faultReply', { command: verb, code }))
        if (code === 421) this.close()
        return
      }
      // RNFR ne vaut que pour la commande RNTO qui suit (REST : consommé par le transfert suivant).
      if (verb !== 'RNFR' && verb !== 'RNTO') this.renameFrom = null
      await handler.call(this, arg)
    } catch (err) {
      if (err instanceof Reply) await this.reply(err.code, err.message)
      else if (err instanceof OutsideRoot) {
        this.server.log(
          'warn',
          this.remote,
          t('ftp.log.outside', { name: this.user?.username ?? '', path: err.message })
        )
        await this.reply(550, 'Permission denied')
      } else if (err.code === 'ENOENT') await this.reply(550, 'No such file or directory')
      else if (err.code === 'EEXIST') await this.reply(550, 'File exists')
      else if (err.code === 'ENOTEMPTY') await this.reply(550, 'Directory not empty')
      else if (err.code === 'EACCES' || err.code === 'EPERM') await this.reply(550, 'Permission denied')
      else await this.reply(451, `Local error: ${err.message}`)
    }
  }

  /** Chemin réel d'un argument (relatif au dossier courant), confiné au dossier servi. */
  async path(arg, options) {
    const virtual = virtualPath(arg || '.', this.cwd)
    const { real, target } = await resolveInside(this.server.root, this.server.realRoot, virtual, options)
    return { real, target, virtual }
  }

  writable() {
    return !this.user?.readOnly
  }

  // --- Connexion ------------------------------------------------------------------------------

  async cmdUSER(arg) {
    const username = arg.trim()
    if (!username) throw new Reply(501, 'Syntax error in parameters')
    if (this.config.tls === 'explicit' && this.config.requireTls && !this.secure)
      throw new Reply(530, 'TLS required: use AUTH TLS first')
    this.user = null
    this.pendingUser = username
    const anonymous = ANONYMOUS.includes(username.toLowerCase())
    await this.reply(331, anonymous ? 'Anonymous login ok, send your e-mail address as password' : 'Password required')
  }

  async cmdPASS(arg) {
    const username = this.pendingUser
    if (!username) throw new Reply(503, 'Login with USER first')
    this.pendingUser = null
    const fail = async (reason) => {
      this.server.counters.failures++
      this.server.log('warn', this.remote, t('ftp.log.loginFailed', { name: username, reason }))
      // Réponse différée : ralentit les essais de mots de passe.
      await new Promise((resolve) => setTimeout(resolve, 300))
      throw new Reply(530, 'Login incorrect')
    }
    let user
    if (ANONYMOUS.includes(username.toLowerCase())) {
      if (!this.config.anonymous) return fail(t('ftp.log.anonymousDisabled'))
      user = { username: 'anonymous', readOnly: true }
    } else {
      const known = this.server.users.get(username)
      if (!known) return fail(t('ftp.log.unknownUser'))
      if (!(await verifyPassword(arg, known.passwordHash))) return fail(t('ftp.log.wrongPassword'))
      user = { username: known.username, readOnly: known.readOnly }
    }
    this.user = user
    this.cwd = '/'
    this.server.counters.logins++
    this.server.log(
      'info',
      this.remote,
      t('ftp.log.loggedIn', { name: user.username, secure: this.secure ? 'TLS' : t('ftp.log.plain') })
    )
    this.server.onStatus(this.server.status())
    await this.reply(230, 'Login successful')
  }

  async cmdQUIT() {
    await this.reply(221, 'Goodbye')
    this.socket.end()
  }

  async cmdNOOP() {
    await this.reply(200, 'NOOP ok')
  }

  async cmdSYST() {
    await this.reply(215, 'UNIX Type: L8')
  }

  async cmdFEAT() {
    const features = ['UTF8', 'EPSV', 'EPRT', 'PASV', 'SIZE', 'MDTM', 'REST STREAM', 'MLST type*;size*;modify*;perm*;']
    if (this.config.tls === 'explicit') features.push('AUTH TLS')
    if (this.config.tls !== 'none') features.push('PBSZ', 'PROT')
    await this.reply(211, 'Features:', features)
  }

  async cmdOPTS(arg) {
    const [name] = arg.trim().toUpperCase().split(/\s+/)
    if (name === 'UTF8' || name === 'MLST') return this.reply(200, 'OK')
    throw new Reply(501, 'Option not understood')
  }

  async cmdHELP() {
    const commands = Object.getOwnPropertyNames(Session.prototype)
      .filter((name) => name.startsWith('cmd'))
      .map((name) => name.slice(3))
    await this.reply(214, 'The following commands are recognized:', [commands.join(' ')])
  }

  async cmdSTAT() {
    await this.reply(211, 'Sulfur FTP server status:', [
      `Connected from ${this.remote}`,
      `Logged in as ${this.user.username}`,
      `TYPE: ${this.type === 'A' ? 'ASCII' : 'BINARY'}, control ${this.secure ? 'TLS' : 'plain'}, data ${this.prot === 'P' ? 'TLS' : 'plain'}`
    ])
  }

  // --- TLS (RFC 4217) -------------------------------------------------------------------------

  async cmdAUTH(arg) {
    const mechanism = arg.trim().toUpperCase()
    if (this.config.tls !== 'explicit') throw new Reply(502, 'TLS not available')
    if (this.secure) throw new Reply(503, 'TLS already active')
    if (mechanism !== 'TLS' && mechanism !== 'SSL' && mechanism !== 'TLS-C')
      throw new Reply(504, 'Unsupported security mechanism')
    await this.reply(234, `AUTH ${mechanism} successful`)
    // La suite de la connexion passe par TLS ; l'état de connexion repart de zéro.
    const raw = this.socket
    raw.removeAllListeners('data')
    raw.removeAllListeners('timeout')
    const secure = new tls.TLSSocket(raw, { isServer: true, secureContext: this.server.tlsContext })
    secure.on('error', (err) => {
      this.server.log('warn', this.remote, t('ftp.log.tlsFailed', { message: err.message }))
      raw.destroy()
    })
    this.socket = secure
    this.secure = true
    this.user = null
    this.pendingUser = null
    this.buffer = ''
    this.attach(secure)
    secure.on('secure', () => {
      this.server.log('info', this.remote, t('ftp.log.tls', { protocol: secure.getProtocol() }))
      this.server.onStatus(this.server.status())
    })
  }

  async cmdPBSZ() {
    if (!this.secure) throw new Reply(503, 'PBSZ requires AUTH first')
    await this.reply(200, 'PBSZ=0')
  }

  async cmdPROT(arg) {
    if (!this.secure) throw new Reply(503, 'PROT requires AUTH first')
    const level = arg.trim().toUpperCase()
    if (level !== 'C' && level !== 'P') throw new Reply(504, 'Protection level not supported')
    this.prot = level
    await this.reply(200, `Protection level set to ${level}`)
  }

  // --- Navigation -----------------------------------------------------------------------------

  async cmdPWD() {
    await this.reply(257, `"${this.cwd.replaceAll('"', '""')}" is the current directory`)
  }

  async cmdCWD(arg) {
    const { real, virtual } = await this.path(arg, { mustExist: true })
    if (!(await fs.stat(real)).isDirectory()) throw new Reply(550, 'Not a directory')
    this.cwd = virtual
    await this.reply(250, `Directory changed to ${virtual}`)
  }

  async cmdCDUP() {
    return this.cmdCWD('..')
  }

  async cmdTYPE(arg) {
    const type = arg.trim().toUpperCase()
    if (type === 'A' || type === 'A N') this.type = 'A'
    else if (type === 'I' || type === 'L 8') this.type = 'I'
    else throw new Reply(504, 'Type not supported')
    await this.reply(200, `Type set to ${this.type}`)
  }

  async cmdMODE(arg) {
    if (arg.trim().toUpperCase() !== 'S') throw new Reply(504, 'Only stream mode is supported')
    await this.reply(200, 'Mode set to S')
  }

  async cmdSTRU(arg) {
    if (arg.trim().toUpperCase() !== 'F') throw new Reply(504, 'Only file structure is supported')
    await this.reply(200, 'Structure set to F')
  }

  async cmdALLO() {
    await this.reply(202, 'No storage allocation necessary')
  }

  async cmdSIZE(arg) {
    const { real } = await this.path(arg, { mustExist: true })
    const stats = await fs.stat(real)
    if (!stats.isFile()) throw new Reply(550, 'Not a regular file')
    await this.reply(213, String(stats.size))
  }

  async cmdMDTM(arg) {
    const { real } = await this.path(arg, { mustExist: true })
    await this.reply(213, timeval((await fs.stat(real)).mtime))
  }

  async cmdMLST(arg) {
    const { real, virtual } = await this.path(arg, { mustExist: true })
    const stats = await fs.stat(real)
    await this.reply(250, 'Listing', [facts(virtual, stats, this.writable())])
  }

  // --- Modifications --------------------------------------------------------------------------

  async cmdMKD(arg) {
    if (!arg.trim()) throw new Reply(501, 'Syntax error in parameters')
    const { real, virtual } = await this.path(arg)
    await fs.mkdir(real)
    this.server.log('info', this.remote, t('ftp.log.mkdir', { name: this.user.username, path: virtual }))
    await this.reply(257, `"${virtual.replaceAll('"', '""')}" created`)
  }

  async cmdRMD(arg) {
    const { real, virtual } = await this.path(arg, { mustExist: true })
    if (real === this.server.realRoot) throw new Reply(550, 'Permission denied')
    await fs.rmdir(real)
    this.server.log('info', this.remote, t('ftp.log.remove', { name: this.user.username, path: virtual }))
    await this.reply(250, 'Directory removed')
  }

  async cmdDELE(arg) {
    const { real, target, virtual } = await this.path(arg, { mustExist: true })
    if ((await fs.stat(real)).isDirectory()) throw new Reply(550, 'Is a directory')
    // Le lien lui-même est supprimé, pas sa cible.
    await fs.unlink(target)
    this.server.log('info', this.remote, t('ftp.log.remove', { name: this.user.username, path: virtual }))
    await this.reply(250, 'File deleted')
  }

  async cmdRNFR(arg) {
    const source = await this.path(arg, { mustExist: true })
    this.renameFrom = source
    await this.reply(350, 'Ready for RNTO')
  }

  async cmdRNTO(arg) {
    const source = this.renameFrom
    this.renameFrom = null
    if (!source) throw new Reply(503, 'Use RNFR first')
    const target = await this.path(arg)
    if (
      await fs.lstat(target.real).then(
        () => true,
        () => false
      )
    )
      throw new Reply(550, 'Target already exists')
    await fs.rename(source.real, target.real)
    this.server.log(
      'info',
      this.remote,
      t('ftp.log.rename', { name: this.user.username, from: source.virtual, to: target.virtual })
    )
    await this.reply(250, 'Rename successful')
  }

  async cmdSITE(arg) {
    // Droits Unix : acceptés sans effet (dossier de test).
    if (/^CHMOD\s/i.test(arg.trim())) {
      if (!this.writable()) throw new Reply(550, 'Permission denied')
      return this.reply(200, 'SITE CHMOD command ok')
    }
    throw new Reply(502, 'SITE command not implemented')
  }

  async cmdREST(arg) {
    const offset = Number(arg.trim())
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Reply(501, 'Invalid restart position')
    this.rest = offset
    await this.reply(350, `Restarting at ${offset}`)
  }

  // --- Connexion de données -------------------------------------------------------------------

  closeData() {
    this.passive?.server.close()
    this.passive?.socket?.destroy()
    this.passive = null
    this.active = null
  }

  /** Ouvre un port passif sur l'adresse locale du canal de commande (plage configurée). */
  async listenPassive() {
    this.closeData()
    const host = plainAddress(this.socket.localAddress)
    const range = this.server.passiveRange
    const candidates = range
      ? Array.from({ length: range.max - range.min + 1 }, (_, i) => range.min + i).sort(() => Math.random() - 0.5)
      : [0]
    for (const port of candidates) {
      const server = net.createServer()
      const ok = await new Promise((resolve) => {
        server.once('error', () => resolve(false))
        server.listen(port, host, () => resolve(true))
      })
      if (!ok) continue
      const passive = { server, socket: null, waiting: null }
      server.on('connection', (socket) => {
        socket.on('error', () => {})
        // Connexion de données acceptée depuis l'adresse du client uniquement.
        if (plainAddress(socket.remoteAddress) !== plainAddress(this.socket.remoteAddress) || passive.socket) {
          this.server.log(
            'warn',
            this.remote,
            t('ftp.log.foreignData', { address: plainAddress(socket.remoteAddress) })
          )
          socket.destroy()
          return
        }
        passive.socket = socket
        server.close()
        passive.waiting?.(socket)
      })
      this.passive = passive
      return server.address().port
    }
    throw new Reply(425, 'No passive port available')
  }

  async cmdPASV() {
    if (this.epsvAll) throw new Reply(503, 'EPSV ALL in effect')
    const address = this.config.passiveAddress || plainAddress(this.socket.localAddress)
    if (!net.isIPv4(address)) throw new Reply(425, 'Use EPSV on IPv6')
    const port = await this.listenPassive()
    await this.reply(227, `Entering Passive Mode (${address.replaceAll('.', ',')},${port >> 8},${port & 255})`)
  }

  async cmdEPSV(arg) {
    if (arg.trim().toUpperCase() === 'ALL') {
      this.epsvAll = true
      return this.reply(200, 'EPSV ALL ok')
    }
    const port = await this.listenPassive()
    return this.reply(229, `Entering Extended Passive Mode (|||${port}|)`)
  }

  /** Mode actif : connexion vers le client, à sa propre adresse uniquement (pas de rebond FTP). */
  setActive(host, port) {
    if (!this.config.allowActive) throw new Reply(502, 'Active mode disabled, use PASV')
    if (this.epsvAll) throw new Reply(503, 'EPSV ALL in effect')
    if (!(port >= 1024 && port <= 65535) || plainAddress(host) !== plainAddress(this.socket.remoteAddress)) {
      this.server.log('warn', this.remote, t('ftp.log.badPort', { target: `${host}:${port}` }))
      throw new Reply(500, 'Illegal PORT command')
    }
    this.closeData()
    this.active = { host: plainAddress(host), port }
  }

  async cmdPORT(arg) {
    const parts = arg.trim().split(',').map(Number)
    if (parts.length !== 6 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
      throw new Reply(501, 'Syntax error in parameters')
    this.setActive(parts.slice(0, 4).join('.'), parts[4] * 256 + parts[5])
    await this.reply(200, 'PORT command successful')
  }

  async cmdEPRT(arg) {
    const [, proto, host, port] = arg.trim().split(arg.trim()[0] ?? '|')
    if (!['1', '2'].includes(proto) || !host || !port) throw new Reply(501, 'Syntax error in parameters')
    this.setActive(host, Number(port))
    await this.reply(200, 'EPRT command successful')
  }

  /** Connexion de données prête (chiffrée si PROT P). */
  async openData() {
    if (this.config.requireTls && this.config.tls === 'explicit' && this.prot !== 'P')
      throw new Reply(521, 'Data connections must be encrypted (PROT P)')
    let socket
    if (this.passive) {
      const passive = this.passive
      socket =
        passive.socket ??
        (await new Promise((resolve) => {
          const timer = setTimeout(() => resolve(null), DATA_TIMEOUT)
          passive.waiting = (s) => {
            clearTimeout(timer)
            resolve(s)
          }
        }))
      this.passive = null
      passive.server.close()
    } else if (this.active) {
      const { host, port } = this.active
      this.active = null
      socket = await new Promise((resolve) => {
        const s = net.connect({ host, port, timeout: DATA_TIMEOUT })
        s.once('connect', () => resolve(s))
        s.once('error', () => resolve(null))
        s.once('timeout', () => {
          s.destroy()
          resolve(null)
        })
      })
    } else throw new Reply(425, 'Use PORT or PASV first')
    if (!socket) throw new Reply(425, "Can't open data connection")
    socket.on('error', () => {})
    socket.setTimeout(0)
    if (this.prot === 'P' && this.server.tlsContext) {
      const secure = new tls.TLSSocket(socket, { isServer: true, secureContext: this.server.tlsContext })
      secure.on('error', () => {})
      socket = secure
    }
    return socket
  }

  /** Transfert sur la connexion de données : 150, `run(socket)`, puis 226 (426 si interrompu). */
  async withData(message, run) {
    const socket = await this.openData()
    await this.reply(150, message)
    this.transfer = { socket, aborted: false }
    try {
      const result = await run(socket)
      if (this.transfer.aborted) return null
      await this.reply(226, 'Transfer complete')
      return result
    } catch (err) {
      socket.destroy()
      if (!this.transfer.aborted) await this.reply(426, `Connection closed; transfer aborted (${err.message})`)
      return null
    } finally {
      this.transfer = null
    }
  }

  abort() {
    const transfer = this.transfer
    transfer.aborted = true
    transfer.socket.destroy()
    this.write('426 Transfer aborted')
    this.write('226 Abort successful')
  }

  async cmdABOR() {
    this.closeData()
    await this.reply(225, 'No transfer to abort')
  }

  // --- Listes et transferts -------------------------------------------------------------------

  /** Entrées d'un dossier (ou le fichier seul) : [{ name, stats }]. */
  async entries(arg) {
    // Options de « ls » (-a, -la…) ignorées.
    const target = arg.replace(/^(-\S+\s*)+/, '').trim()
    const { real } = await this.path(target, { mustExist: true })
    const stats = await fs.stat(real)
    if (!stats.isDirectory()) return { directory: false, list: [{ name: path.basename(real), stats }] }
    const names = await fs.readdir(real)
    const list = []
    for (const name of names) {
      const entry = await fs.lstat(path.join(real, name)).catch(() => null)
      if (entry) list.push({ name, stats: entry })
    }
    return { directory: true, list, stats }
  }

  async sendListing(lines) {
    await this.withData('Here comes the directory listing', async (socket) => {
      const text = lines.length ? `${lines.join('\r\n')}\r\n` : ''
      await new Promise((resolve, reject) => {
        socket.once('error', reject)
        socket.end(text, resolve)
      })
    })
  }

  async cmdLIST(arg) {
    const { list } = await this.entries(arg)
    await this.sendListing(list.map(({ name, stats }) => listLine(name, stats)))
  }

  async cmdNLST(arg) {
    const { list } = await this.entries(arg)
    await this.sendListing(list.map(({ name }) => name))
  }

  async cmdMLSD(arg) {
    const { directory, list, stats } = await this.entries(arg)
    if (!directory) throw new Reply(501, 'Not a directory')
    const writable = this.writable()
    await this.sendListing([
      facts('.', stats, writable, 'cdir'),
      ...list.map(({ name, stats: s }) => facts(name, s, writable))
    ])
  }

  async cmdRETR(arg) {
    const { real, virtual } = await this.path(arg, { mustExist: true })
    const stats = await fs.stat(real)
    if (!stats.isFile()) throw new Reply(550, 'Not a regular file')
    const start = this.rest
    this.rest = 0
    let bytes = 0
    const ascii = this.type === 'A'
    const done = await this.withData(
      `Opening ${ascii ? 'ASCII' : 'BINARY'} mode data connection for ${path.basename(real)} (${stats.size} bytes)`,
      async (socket) => {
        const source = createReadStream(real, { start })
        const steps = [source, ...(ascii ? [toCrlf()] : [])]
        steps.push(
          counter((n) => {
            bytes += n
            this.server.counters.bytesOut += n
          }),
          socket
        )
        try {
          await pipeline(steps)
        } catch (err) {
          // Client qui ferme la connexion dès la dernière donnée reçue (taille connue par SIZE).
          const sent = source.bytesRead >= stats.size - start
          if (!(sent && err.code === 'ERR_STREAM_PREMATURE_CLOSE')) throw err
        }
        return true
      }
    )
    if (done) {
      this.server.counters.downloads++
      this.server.log('info', this.remote, t('ftp.log.download', { name: this.user.username, path: virtual, bytes }))
    }
  }

  async store(arg, append) {
    if (!arg.trim()) throw new Reply(501, 'Syntax error in parameters')
    const { real, virtual } = await this.path(arg)
    const existing = await fs.stat(real).catch(() => null)
    if (existing?.isDirectory()) throw new Reply(550, 'Is a directory')
    const start = append ? 0 : this.rest
    this.rest = 0
    let bytes = 0
    const flags = append ? 'a' : start > 0 && existing ? 'r+' : 'w'
    const done = await this.withData(`Ok to send data for ${path.basename(real)}`, async (socket) => {
      const file = createWriteStream(real, { flags, start: flags === 'r+' ? start : undefined })
      await pipeline([
        socket,
        counter((n) => {
          bytes += n
          this.server.counters.bytesIn += n
        }),
        ...(this.type === 'A' ? [fromCrlf()] : []),
        file
      ])
      return true
    })
    if (done) {
      this.server.counters.uploads++
      this.server.log('info', this.remote, t('ftp.log.upload', { name: this.user.username, path: virtual, bytes }))
    }
  }

  cmdSTOR(arg) {
    return this.store(arg, false)
  }

  cmdAPPE(arg) {
    return this.store(arg, true)
  }
}
