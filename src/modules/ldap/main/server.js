import net from 'net'
import tls from 'tls'
import { createHash, randomUUID, timingSafeEqual } from 'crypto'
import { DEFAULT_SERVER_CONFIG, MAX_LOG } from '../shared/constants'
import { isUnder, normalizeDn, parentDn, parseLdif } from '../shared/ldif'
import {
  OID,
  ProtocolError,
  RESULT,
  decodeMessage,
  disconnectionMessage,
  elementLength,
  entryMessage,
  extendedMessage,
  filterToString,
  resultMessage
} from './protocol'
import { t } from '../shared/i18n'

const STATUS_EMIT_INTERVAL = 500
/** Taille maximale d'un message reçu (protection contre un client défaillant). */
const MAX_MESSAGE = 1024 * 1024
/** Attributs jamais renvoyés par une recherche. */
const HIDDEN = new Set(['userpassword'])

const HASHES = { SHA: 'sha1', SHA256: 'sha256', SHA512: 'sha512' }

/** Vérifie un mot de passe contre une valeur userPassword : clair, {SHA}, {SSHA}, {SHA256}, {SSHA512}… */
export function checkPassword(password, stored) {
  const value = String(stored)
  const match = value.match(/^\{(S?)(SHA|SHA256|SHA512|CLEARTEXT)\}(.*)$/i)
  const equal = (a, b) => a.length === b.length && timingSafeEqual(a, b)
  if (!match || match[2].toUpperCase() === 'CLEARTEXT') {
    return equal(Buffer.from(password, 'utf8'), Buffer.from(match ? match[3] : value, 'utf8'))
  }
  const algorithm = HASHES[match[2].toUpperCase()]
  const decoded = Buffer.from(match[3], 'base64')
  const size = createHash(algorithm).digest().length
  const salted = match[1] !== ''
  if (salted ? decoded.length <= size : decoded.length !== size) return false
  const salt = salted ? decoded.subarray(size) : Buffer.alloc(0)
  const digest = createHash(algorithm).update(password, 'utf8').update(salt).digest()
  return equal(digest, decoded.subarray(0, size))
}

/** Valeurs d'un attribut d'une entrée, sans tenir compte de la casse du nom. */
function values(entry, name) {
  const key = Object.keys(entry.attributes).find((k) => k.toLowerCase() === name.toLowerCase())
  return key ? entry.attributes[key] : null
}

const compare = (a, b) => {
  const x = Number(a)
  const y = Number(b)
  if (a !== '' && b !== '' && Number.isFinite(x) && Number.isFinite(y)) return x - y
  return a.toLowerCase().localeCompare(b.toLowerCase())
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Une entrée satisfait-elle un filtre ? (comparaisons insensibles à la casse) */
export function matches(entry, filter) {
  switch (filter.type) {
    case 'and':
      return filter.filters.every((f) => matches(entry, f))
    case 'or':
      return filter.filters.some((f) => matches(entry, f))
    case 'not':
      return !matches(entry, filter.filter)
    case 'present':
      return filter.attribute.toLowerCase() === 'objectclass' || !!values(entry, filter.attribute)?.length
    case 'equal':
    case 'approx':
      return !!values(entry, filter.attribute)?.some((v) => v.toLowerCase() === filter.value.toLowerCase())
    case 'ge':
      return !!values(entry, filter.attribute)?.some((v) => compare(v, filter.value) >= 0)
    case 'le':
      return !!values(entry, filter.attribute)?.some((v) => compare(v, filter.value) <= 0)
    case 'substrings': {
      const pattern = new RegExp(
        `^${escapeRegExp(filter.initial ?? '')}.*${filter.any.map(escapeRegExp).join('.*')}${filter.any.length ? '.*' : ''}${escapeRegExp(filter.final ?? '')}$`,
        'is'
      )
      return !!values(entry, filter.attribute)?.some((v) => pattern.test(v))
    }
    default:
      return false
  }
}

/**
 * Annuaire en mémoire construit depuis un texte LDIF : Map DN normalisé → entrée. L'attribut
 * memberOf est déduit des groupes (member, uniqueMember) quand l'entrée ne le porte pas.
 */
export function buildDirectory(ldif) {
  const { entries, errors } = parseLdif(ldif)
  if (errors.length) {
    const { line, message } = errors[0]
    throw new Error(t('ldap.errors.ldif', { line, problem: t(`ldap.ldif.${message}`) }))
  }
  const directory = new Map(entries.map((e) => [normalizeDn(e.dn), { ...e, attributes: { ...e.attributes } }]))
  const memberOf = new Map()
  for (const group of directory.values()) {
    for (const member of [...(values(group, 'member') ?? []), ...(values(group, 'uniqueMember') ?? [])]) {
      let key
      try {
        key = normalizeDn(member)
      } catch {
        continue
      }
      memberOf.set(key, [...(memberOf.get(key) ?? []), group.dn])
    }
  }
  for (const [key, groups] of memberOf) {
    const entry = directory.get(key)
    if (entry && !values(entry, 'memberOf')) entry.attributes.memberOf = groups
  }
  return directory
}

/**
 * Serveur LDAP v3 (LDAP, LDAPS ou StartTLS) sur un annuaire de test en lecture seule : liaison
 * simple, recherche (portées base / un niveau / sous-arbre, filtres RFC 4515), comparaison,
 * opérations étendues StartTLS et « Who am I ». Les écritures sont refusées (unwillingToPerform).
 */
export class LdapServer {
  server = null
  config = null
  directory = new Map()
  sessions = new Map()
  logEntries = []
  counters = { connections: 0, binds: 0, bindFailures: 0, searches: 0 }
  certificate = null
  faults = []
  seq = 0

  /** `getCertificate()` : { cert, key, info } du certificat du serveur (LDAPS, StartTLS). */
  constructor(getCertificate, { onStatus = () => {}, onLog = () => {} } = {}) {
    this.getCertificate = getCertificate
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
        ? `${this.config.security === 'ldaps' ? 'ldaps' : 'ldap'}://${this.config.host}:${this.config.port}`
        : null,
      config: this.config,
      entries: this.running ? this.directory.size : 0,
      counters: { ...this.counters },
      certificate: this.running && this.tlsContext ? this.certificate : null,
      sessions: [...this.sessions.values()].map((s) => ({
        id: s.id,
        remote: s.remote,
        since: s.since,
        tls: s.tls,
        bound: s.bound
      }))
    }
  }

  prepare(options) {
    const config = { ...DEFAULT_SERVER_CONFIG, ...options }
    const port = Number(config.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(t('ldap.errors.invalidPort'))
    const sizeLimit = Number(config.sizeLimit)
    if (!Number.isInteger(sizeLimit) || sizeLimit < 1) throw new Error(t('ldap.errors.invalidSizeLimit'))
    return { config: { ...config, port, sizeLimit }, directory: buildDirectory(config.ldif) }
  }

  async start(options) {
    if (this.running) throw new Error(t('errors.alreadyStarted'))
    const { config, directory } = this.prepare(options)
    this.tlsContext = null
    if (config.security === 'ldaps' || config.startTls) {
      const { cert, key, info } = await this.getCertificate()
      this.certificate = info
      this.credentials = { cert, key }
      this.tlsContext = tls.createSecureContext({ cert, key, minVersion: 'TLSv1.2' })
    }
    const server =
      config.security === 'ldaps'
        ? tls.createServer({ ...this.credentials, minVersion: 'TLSv1.2' }, (s) => this.open(s, true))
        : net.createServer((s) => this.open(s, false))
    server.on('tlsClientError', (err, socket) =>
      this.log('warn', socket?.remoteAddress ?? '?', t('ldap.log.tlsFailure', { message: err.message }))
    )
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(config.port, config.host || '0.0.0.0', () => {
          server.off('error', reject)
          resolve()
        })
      })
    } catch (err) {
      if (err.code === 'EACCES') throw new Error(t('ldap.errors.portPrivileged', { port: config.port }), { cause: err })
      if (err.code === 'EADDRINUSE') throw new Error(t('ldap.errors.portInUse', { port: config.port }), { cause: err })
      throw err
    }
    server.on('error', (err) => this.log('error', '', err.message))
    this.server = server
    this.config = config
    this.directory = directory
    this.counters = { connections: 0, binds: 0, bindFailures: 0, searches: 0 }
    this.statusTimer = setInterval(() => {
      const snapshot = JSON.stringify(this.counters)
      if (snapshot !== this.lastCounters) {
        this.lastCounters = snapshot
        this.onStatus(this.status())
      }
    }, STATUS_EMIT_INTERVAL)
    this.log('info', '', t('ldap.log.started', { endpoint: this.status().endpoint, count: directory.size }))
    this.onStatus(this.status())
    return this.status()
  }

  async stop() {
    clearInterval(this.statusTimer)
    const server = this.server
    for (const s of this.sessions.values()) s.socket.destroy()
    this.sessions.clear()
    this.server = null
    if (server) {
      await new Promise((resolve) => server.close(() => resolve()))
      this.log('info', '', t('ldap.log.stopped'))
    }
    this.onStatus(this.status())
    return this.status()
  }

  /** Annuaire, liaison anonyme et limite de taille modifiés serveur démarré. */
  update(options) {
    if (!this.running) throw new Error(t('errors.notStarted'))
    const { config, directory } = this.prepare({
      ...options,
      host: this.config.host,
      port: this.config.port,
      security: this.config.security,
      startTls: this.config.startTls
    })
    this.config = config
    this.directory = directory
    this.log('info', '', t('ldap.log.updated', { count: directory.size }))
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
    this.faults = faults
  }

  fault(type) {
    return this.faults.find((f) => f.type === type)
  }

  // --- Connexions ---------------------------------------------------------------------------

  open(socket, secure) {
    const session = {
      id: ++this.seq,
      socket,
      remote: `${socket.remoteAddress}:${socket.remotePort}`,
      since: new Date().toISOString(),
      tls: secure,
      bound: null,
      buffer: Buffer.alloc(0),
      queue: Promise.resolve()
    }
    this.counters.connections++
    this.sessions.set(session.id, session)
    this.attach(session, socket)
    socket.on('close', () => {
      if (this.sessions.delete(session.id)) this.onStatus(this.status())
    })
    this.onStatus(this.status())
  }

  attach(session, socket) {
    socket.on('error', () => {})
    socket.on('data', (chunk) => this.onData(session, chunk))
  }

  onData(session, chunk) {
    session.buffer = Buffer.concat([session.buffer, chunk])
    try {
      for (;;) {
        const size = elementLength(session.buffer)
        if (!size) {
          if (session.buffer.length > MAX_MESSAGE) throw new ProtocolError('message too large')
          break
        }
        const message = decodeMessage(session.buffer.subarray(0, size))
        session.buffer = session.buffer.subarray(size)
        // Traitement dans l'ordre de réception (StartTLS change la connexion en cours de route).
        session.queue = session.queue.then(() => this.handle(session, message)).catch(() => session.socket.destroy())
      }
    } catch (err) {
      this.log('warn', session.remote, t('ldap.log.protocolError', { message: err.message }))
      if (!session.socket.destroyed) session.socket.end(disconnectionMessage(RESULT.protocolError, err.message))
    }
  }

  send(session, ...messages) {
    if (!session.socket.destroyed) session.socket.write(Buffer.concat(messages))
  }

  async handle(session, msg) {
    if (msg.op === 'unbind') return session.socket.end()
    if (msg.op === 'abandon') return
    if (this.fault('noResponse')) return
    const delay = Number(this.fault('delay')?.params?.ms) || 0
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
    const forced = this.fault('exception')
    if (forced && msg.op !== 'extended') {
      const kind = msg.op === 'search' ? 'searchDone' : msg.op
      return this.send(session, resultMessage(msg.id, kind, Number(forced.params?.code) || RESULT.unavailable))
    }
    switch (msg.op) {
      case 'bind':
        return this.bind(session, msg)
      case 'search':
        return this.search(session, msg)
      case 'compare':
        return this.compare(session, msg)
      case 'extended':
        return this.extended(session, msg)
      case 'add':
      case 'modify':
      case 'delete':
      case 'modifyDn':
        this.log('info', session.remote, t('ldap.log.writeRefused', { op: msg.op, dn: msg.dn }))
        return this.send(
          session,
          resultMessage(msg.id, msg.op, RESULT.unwillingToPerform, { diagnostic: t('ldap.log.readOnly') })
        )
      default:
        this.log('warn', session.remote, t('ldap.log.unsupported', { tag: msg.tag?.toString(16) ?? '?' }))
        return session.socket.end(disconnectionMessage(RESULT.protocolError, 'unsupported operation'))
    }
  }

  bind(session, msg) {
    const reply = (code, diagnostic = '') => this.send(session, resultMessage(msg.id, 'bind', code, { diagnostic }))
    this.counters.binds++
    if (!msg.simple) {
      this.counters.bindFailures++
      return reply(RESULT.authMethodNotSupported, t('ldap.log.saslUnsupported'))
    }
    if (!msg.name && !msg.password) {
      if (!this.config.allowAnonymous) {
        this.counters.bindFailures++
        this.log('warn', session.remote, t('ldap.log.anonymousRefused'))
        return reply(RESULT.unwillingToPerform, t('ldap.log.anonymousDisabled'))
      }
      session.bound = ''
      this.log('info', session.remote, t('ldap.log.anonymousBind'))
      return reply(RESULT.success)
    }
    const fail = (reason) => {
      this.counters.bindFailures++
      session.bound = null
      this.log('warn', session.remote, t('ldap.log.bindFailed', { dn: msg.name || '—', reason }))
      return reply(RESULT.invalidCredentials)
    }
    if (!msg.password) return fail(t('ldap.log.emptyPassword'))
    let entry
    try {
      entry = this.directory.get(normalizeDn(msg.name))
    } catch {
      return fail(t('ldap.log.badDn'))
    }
    if (!entry) return fail(t('ldap.log.noEntry'))
    const passwords = values(entry, 'userPassword') ?? []
    if (!passwords.length) return fail(t('ldap.log.noPassword'))
    if (!passwords.some((p) => checkPassword(msg.password, p))) return fail(t('ldap.log.wrongPassword'))
    session.bound = entry.dn
    this.log('info', session.remote, t('ldap.log.bindOk', { dn: entry.dn }))
    this.onStatus(this.status())
    return reply(RESULT.success)
  }

  /** Recherche autorisée pour cette connexion (liée, ou liaison anonyme acceptée). */
  allowed(session) {
    return this.config.allowAnonymous || !!session.bound
  }

  rootDse() {
    const contexts = [...this.directory.values()].filter((e) => !this.directory.has(parentDn(normalizeDn(e.dn))))
    return {
      dn: '',
      attributes: {
        objectClass: ['top'],
        namingContexts: contexts.map((e) => e.dn),
        supportedLDAPVersion: ['3'],
        supportedExtension: [OID.startTls, OID.whoAmI],
        vendorName: ['Sulfur']
      }
    }
  }

  /** Attributs renvoyés : tous (« * » ou liste vide), aucun (« 1.1 »), ou ceux demandés. */
  select(entry, requested) {
    const wanted = requested.map((a) => a.toLowerCase())
    const all = !wanted.length || wanted.includes('*')
    const out = {}
    for (const [name, list] of Object.entries(entry.attributes)) {
      const key = name.toLowerCase()
      if (HIDDEN.has(key)) continue
      if (wanted.includes('1.1') && wanted.length === 1) continue
      if (all || wanted.includes(key)) out[name] = list
    }
    return out
  }

  search(session, msg) {
    this.counters.searches++
    const done = (code, options) => this.send(session, resultMessage(msg.id, 'searchDone', code, options))
    const filter = filterToString(msg.filter)
    if (!msg.base && msg.scope === 'base') {
      const root = this.rootDse()
      return this.send(
        session,
        entryMessage(msg.id, '', this.select(root, msg.attributes.length ? msg.attributes : ['*']), msg.typesOnly),
        resultMessage(msg.id, 'searchDone', RESULT.success)
      )
    }
    if (!this.allowed(session)) {
      this.log('warn', session.remote, t('ldap.log.searchRefused', { base: msg.base }))
      return done(RESULT.insufficientAccessRights, { diagnostic: t('ldap.log.bindRequired') })
    }
    let base
    try {
      base = normalizeDn(msg.base)
    } catch {
      return done(RESULT.invalidDNSyntax)
    }
    if (base && !this.directory.has(base)) {
      let matched = parentDn(base)
      while (matched && !this.directory.has(matched)) matched = parentDn(matched)
      this.log('info', session.remote, t('ldap.log.search', { base: msg.base, scope: msg.scope, filter, count: 0 }))
      return done(RESULT.noSuchObject, { matchedDn: matched ? this.directory.get(matched).dn : '' })
    }
    const limit = Math.min(this.config.sizeLimit, msg.sizeLimit > 0 ? msg.sizeLimit : Infinity)
    const found = []
    for (const [dn, entry] of this.directory) {
      const inScope =
        msg.scope === 'base' ? dn === base : msg.scope === 'one' ? parentDn(dn) === base : isUnder(dn, base)
      if (inScope && matches(entry, msg.filter)) found.push(entry)
    }
    const sent = found.slice(0, limit)
    this.log(
      'info',
      session.remote,
      t('ldap.log.search', { base: msg.base, scope: msg.scope, filter, count: sent.length })
    )
    this.send(
      session,
      ...sent.map((e) => entryMessage(msg.id, e.dn, this.select(e, msg.attributes), msg.typesOnly)),
      resultMessage(msg.id, 'searchDone', found.length > limit ? RESULT.sizeLimitExceeded : RESULT.success)
    )
  }

  compare(session, msg) {
    const reply = (code) => this.send(session, resultMessage(msg.id, 'compare', code))
    if (!this.allowed(session)) return reply(RESULT.insufficientAccessRights)
    if (HIDDEN.has(msg.attribute.toLowerCase())) return reply(RESULT.insufficientAccessRights)
    let entry
    try {
      entry = this.directory.get(normalizeDn(msg.dn))
    } catch {
      return reply(RESULT.invalidDNSyntax)
    }
    if (!entry) return reply(RESULT.noSuchObject)
    const list = values(entry, msg.attribute)
    if (!list) return reply(RESULT.noSuchAttribute)
    return reply(
      list.some((v) => v.toLowerCase() === msg.value.toLowerCase()) ? RESULT.compareTrue : RESULT.compareFalse
    )
  }

  extended(session, msg) {
    if (msg.name === OID.whoAmI) {
      return this.send(
        session,
        extendedMessage(msg.id, RESULT.success, { value: session.bound ? `dn:${session.bound}` : '' })
      )
    }
    if (msg.name === OID.startTls) {
      if (session.tls)
        return this.send(
          session,
          extendedMessage(msg.id, RESULT.operationsError, { diagnostic: t('ldap.log.alreadyTls') })
        )
      if (!this.config.startTls || !this.tlsContext)
        return this.send(
          session,
          extendedMessage(msg.id, RESULT.protocolError, { diagnostic: t('ldap.log.startTlsDisabled') })
        )
      this.send(session, extendedMessage(msg.id, RESULT.success, { name: OID.startTls }))
      // La suite de la connexion passe par TLS (RFC 4513 § 3).
      const raw = session.socket
      raw.removeAllListeners('data')
      const secure = new tls.TLSSocket(raw, { isServer: true, secureContext: this.tlsContext })
      session.socket = secure
      session.tls = true
      this.attach(session, secure)
      secure.on('secure', () => {
        this.log('info', session.remote, t('ldap.log.startTls', { protocol: secure.getProtocol() }))
        this.onStatus(this.status())
      })
      return undefined
    }
    return this.send(
      session,
      extendedMessage(msg.id, RESULT.protocolError, { diagnostic: t('ldap.log.unknownExtended', { name: msg.name }) })
    )
  }
}
