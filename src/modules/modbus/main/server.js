import net from 'net'
import tls from 'tls'
import { randomUUID } from 'crypto'
import { simulate } from '@shared/simulator'
import { DATA_TYPES, DEFAULT_SERVER_SECURITY, TABLES } from '../shared/constants'
import { decodeValue, encodeValue, pointSize, toBoolean } from '../shared/codec'
import { DataStore } from './datastore'
import { EX, FrameReader, ModbusException, buildResponse, encodeFrame, exceptionPdu, parseRequest } from './protocol'
import { RateLimiter, buildAllowList, isAllowed, normalizeIp, resolveRole } from './security'

const VALUES_EMIT_INTERVAL = 250
const MAX_LOG = 300
export const SERVER_COMMON_NAME = 'MODBUS@Sulfur'

/** Vérifie la cohérence d'un point (table, type, adresse) avec la taille de la mémoire. */
export function validatePoint(def, size) {
  if (!def.name?.trim()) throw new Error('Le nom du point est vide')
  const table = TABLES[def.table]
  if (!table) throw new Error(`Table inconnue : ${def.table}`)
  if (!(def.dataType in DATA_TYPES)) throw new Error(`Type inconnu : ${def.dataType}`)
  if (table.bit !== (def.dataType === 'Boolean')) {
    throw new Error(`« ${def.name} » : le type ${def.dataType} n'est pas compatible avec la table ${table.label}`)
  }
  const address = Number(def.address)
  if (!Number.isInteger(address) || address < 0 || address + pointSize(def.dataType) > size) {
    throw new Error(`« ${def.name} » : adresse hors limites (0 à ${size - pointSize(def.dataType)})`)
  }
}

const overlaps = (a, b) =>
  a.table === b.table &&
  a.address < b.address + pointSize(b.dataType) &&
  b.address < a.address + pointSize(a.dataType)

/**
 * Serveur Modbus TCP (port 502) ou Modbus/TCP Security (TLS, port 802).
 *
 * Sécurités appliquées :
 *  - TLS ≥ 1.2 avec authentification mutuelle et certificats épinglés (magasin approuvés / rejetés)
 *  - autorisation par rôle (extension 1.3.6.1.4.1.50316.802.1 du certificat client)
 *  - liste blanche d'adresses IP, nombre maximal de connexions, limite de requêtes par seconde
 *  - mode lecture seule global, points protégés en écriture, filtrage du Unit ID
 *  - rejet des trames invalides (connexion fermée)
 */
export class ModbusServer {
  server = null
  config = null
  security = null
  store = null
  allowList = null
  /** id -> { def, value } */
  points = new Map()
  /** id -> session */
  sessions = new Map()
  logEntries = []
  certificate = null
  simTimer = null
  emitTimer = null
  sessionSeq = 0

  constructor(pki, { onStatus, onValues, onLog }) {
    this.pki = pki
    this.onStatus = onStatus
    this.onValues = onValues
    this.onLog = onLog
  }

  status() {
    return {
      running: !!this.server,
      endpoint: this.server ? `${this.security.mode === 'tls' ? 'mbaps' : 'mbap'}://${this.config.host}:${this.config.port}` : null,
      config: this.config,
      certificate: this.server && this.security.mode === 'tls' ? this.certificate : null,
      connections: [...this.sessions.values()].map((s) => ({
        id: s.id,
        remote: s.remote,
        since: s.since,
        requests: s.requests,
        denied: s.denied,
        tls: s.tls,
        permissions: s.permissions
      }))
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

  values() {
    return Object.fromEntries([...this.points].map(([id, p]) => [id, p.value]))
  }

  // --- Démarrage / arrêt --------------------------------------------------------

  async start(config) {
    if (this.server) throw new Error('Le serveur est déjà démarré')
    const security = { ...DEFAULT_SERVER_SECURITY, ...config.security }
    const port = Number(config.port)
    const unitId = Number(config.unitId)
    const size = Number(config.size)
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port invalide (1 à 65535)')
    if (!Number.isInteger(unitId) || unitId < 0 || unitId > 255) throw new Error('Unit ID invalide (0 à 255)')
    if (!Number.isInteger(size) || size < 1 || size > 65536) throw new Error('Taille mémoire invalide (1 à 65536)')
    if (security.mode === 'tls' && !(security.roles ?? []).length && !security.defaultRole) {
      throw new Error('Mode TLS : définissez au moins un rôle autorisé')
    }
    const allowList = buildAllowList(security.allowedIps)
    const points = config.points.map((p) => ({ ...p, id: p.id ?? randomUUID(), address: Number(p.address) }))
    points.forEach((p) => validatePoint(p, size))
    this.checkUnique(points)

    this.config = { ...config, port, unitId, size, security, points }
    this.security = security
    this.allowList = allowList
    this.store = new DataStore(size)
    this.points.clear()
    for (const def of points) this.addPoint(def)

    const server = security.mode === 'tls' ? await this.createTlsServer(security) : net.createServer((s) => this.onPlainSocket(s))
    server.on('error', (err) => this.log('error', `Erreur serveur : ${err.message}`))
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, config.host || '0.0.0.0', () => {
          server.off('error', reject)
          resolve()
        })
      })
    } catch (err) {
      this.reset()
      if (err.code === 'EACCES') throw new Error(`Port ${port} : droits administrateur requis pour les ports < 1024 (502 / 802)`)
      if (err.code === 'EADDRINUSE') throw new Error(`Le port ${port} est déjà utilisé`)
      throw err
    }

    this.server = server
    this.t0 = Date.now()
    this.startSimulation()
    this.emitTimer = setInterval(() => {
      this.onValues(this.values())
      // Rafraîchit les compteurs de requêtes / refus des clients connectés lorsqu'ils évoluent.
      const counters = [...this.sessions.values()].map((s) => `${s.id}:${s.requests}:${s.denied}`).join()
      if (counters !== this.lastCounters) {
        this.lastCounters = counters
        this.onStatus(this.status())
      }
    }, VALUES_EMIT_INTERVAL)
    this.log(
      'info',
      `Serveur démarré sur ${config.host || '0.0.0.0'}:${port} — ${
        security.mode === 'tls' ? `Modbus/TCP Security (≥ ${security.minTlsVersion})` : 'Modbus TCP non chiffré'
      }`
    )
    this.onStatus(this.status())
    return this.status()
  }

  async stop() {
    const server = this.server
    for (const s of this.sessions.values()) s.socket.destroy()
    this.reset()
    if (server) {
      await new Promise((resolve) => server.close(() => resolve()))
      this.log('info', 'Serveur arrêté')
    }
    this.onStatus(this.status())
    return this.status()
  }

  reset() {
    clearInterval(this.simTimer)
    clearInterval(this.emitTimer)
    this.simTimer = this.emitTimer = null
    this.server = null
    this.sessions.clear()
  }

  async createTlsServer(security) {
    const own = await this.pki.ensureOwn({ commonName: SERVER_COMMON_NAME })
    this.certificate = (await this.pki.list()).own[0] ?? null
    const server = tls.createServer({
      cert: own.cert,
      key: own.key,
      minVersion: security.minTlsVersion,
      requestCert: true,
      // La vérification est faite par épinglage dans le magasin (certificats auto-signés).
      rejectUnauthorized: false,
      handshakeTimeout: 10_000
    })
    // Filtrage (IP, nombre de connexions) avant même la négociation TLS.
    server.on('connection', (raw) => {
      if (!this.admit(raw)) raw.destroy()
    })
    server.on('secureConnection', (socket) => this.onTlsSocket(socket))
    server.on('tlsClientError', (err, socket) =>
      this.log('warn', `Échec de négociation TLS avec ${normalizeIp(socket?.remoteAddress)} : ${err.message}`)
    )
    return server
  }

  /** Contrôles communs à l'ouverture : liste blanche IP et nombre maximal de connexions. */
  admit(socket) {
    const ip = normalizeIp(socket.remoteAddress)
    if (!isAllowed(this.allowList, ip)) {
      this.log('warn', `Connexion refusée : ${ip} n'est pas dans la liste des adresses autorisées`)
      return false
    }
    const max = Number(this.security.maxConnections) || 0
    if (max > 0 && this.sessions.size >= max) {
      this.log('warn', `Connexion refusée : ${ip} — nombre maximal de connexions atteint (${max})`)
      return false
    }
    return true
  }

  onPlainSocket(socket) {
    if (!this.admit(socket)) return socket.destroy()
    this.openSession(socket, null, { read: true, write: true })
  }

  async onTlsSocket(socket) {
    socket.pause()
    socket.on('error', () => {})
    const ip = normalizeIp(socket.remoteAddress)
    const refuse = (reason) => {
      this.log('warn', `Connexion TLS refusée pour ${ip} : ${reason}`)
      socket.destroy()
    }
    try {
      const peer = socket.getPeerX509Certificate()
      let certRole = null
      let commonName = null
      if (!peer) {
        if (this.security.requireClientCertificate) return refuse('aucun certificat client présenté')
      } else {
        const check = await this.pki.checkPeer(peer, { autoAccept: !!this.security.autoAcceptCertificates })
        commonName = check.info.commonName
        if (!check.ok) return refuse(`certificat « ${commonName} » ${check.reason} (à approuver dans les certificats du serveur)`)
        if (check.accepted) this.log('info', `Certificat « ${commonName} » accepté automatiquement`)
        certRole = check.info.role
      }
      const role = resolveRole(this.security, certRole)
      if (!role) return refuse(certRole ? `rôle « ${certRole} » non autorisé` : 'certificat sans rôle Modbus et aucun rôle par défaut')
      if (!this.server || socket.destroyed) return socket.destroy()
      this.openSession(
        socket,
        {
          commonName,
          certRole,
          role: role.name,
          protocol: socket.getProtocol(),
          cipher: socket.getCipher()?.name
        },
        { read: !!role.read, write: !!role.write }
      )
      socket.resume()
    } catch (err) {
      refuse(`erreur de vérification (${err.message})`)
    }
  }

  openSession(socket, tlsInfo, permissions) {
    const ip = normalizeIp(socket.remoteAddress)
    const rate = Number(this.security.maxRequestsPerSecond) || 0
    const session = {
      id: ++this.sessionSeq,
      socket,
      remote: `${ip}:${socket.remotePort}`,
      since: new Date().toISOString(),
      tls: tlsInfo,
      permissions,
      requests: 0,
      denied: 0,
      limiter: rate > 0 ? new RateLimiter(rate) : null,
      lastThrottleLog: 0,
      reader: new FrameReader()
    }
    this.sessions.set(session.id, session)
    socket.setNoDelay(true)
    socket.on('error', () => {})
    socket.on('data', (chunk) => this.onData(session, chunk))
    socket.on('close', () => {
      if (this.sessions.delete(session.id)) {
        this.log('info', `Déconnexion de ${session.remote} (${session.requests} requête(s))`)
        this.onStatus(this.status())
      }
    })
    const who = tlsInfo
      ? `${tlsInfo.protocol}, certificat « ${tlsInfo.commonName ?? 'aucun'} », rôle ${tlsInfo.role}`
      : 'non chiffrée'
    this.log('info', `Connexion de ${session.remote} (${who})`)
    this.onStatus(this.status())
  }

  onData(session, chunk) {
    let frames
    try {
      frames = session.reader.push(chunk)
    } catch (err) {
      this.log('warn', `Trame invalide reçue de ${session.remote} : ${err.message} — connexion fermée`)
      return session.socket.destroy()
    }
    for (const frame of frames) {
      const pdu = this.handle(session, frame)
      if (pdu && !session.socket.destroyed) session.socket.write(encodeFrame(frame.transactionId, frame.unitId, pdu))
    }
  }

  deny(session, fc, code, message) {
    session.denied++
    if (message) this.log('warn', `${session.remote} : ${message}`)
    return exceptionPdu(fc, code)
  }

  /** Traite une requête et retourne le PDU de réponse. */
  handle(session, { unitId, pdu }) {
    const fc = pdu[0]
    session.requests++

    if (session.limiter && !session.limiter.take()) {
      const now = Date.now()
      const message = now - session.lastThrottleLog > 1000 ? 'limite de requêtes par seconde dépassée (exception 06)' : null
      if (message) session.lastThrottleLog = now
      return this.deny(session, fc, EX.SERVER_DEVICE_BUSY, message)
    }
    if (!this.config.anyUnitId && unitId !== this.config.unitId) {
      return this.deny(session, fc, EX.GATEWAY_TARGET_FAILED, `Unit ID ${unitId} inconnu (attendu ${this.config.unitId})`)
    }

    let req
    try {
      req = parseRequest(pdu)
    } catch (err) {
      if (err instanceof ModbusException) return this.deny(session, fc, err.code, `requête rejetée : ${err.message}`)
      throw err
    }

    if (req.write) {
      if (this.security.readOnly) return this.deny(session, fc, EX.ILLEGAL_FUNCTION, 'écriture refusée (serveur en lecture seule)')
      if (!session.permissions.write) {
        return this.deny(session, fc, EX.ILLEGAL_FUNCTION, `écriture refusée (rôle ${session.tls?.role ?? '—'} sans droit d'écriture)`)
      }
    } else if (!session.permissions.read) {
      return this.deny(session, fc, EX.ILLEGAL_FUNCTION, `lecture refusée (rôle ${session.tls?.role ?? '—'} sans droit de lecture)`)
    }
    if (!this.store.inRange(req.address, req.quantity)) {
      return this.deny(session, fc, EX.ILLEGAL_DATA_ADDRESS, `adresse hors limites (${req.table} ${req.address}+${req.quantity})`)
    }

    if (!req.write) return buildResponse(req, this.store.read(req.table, req.address, req.quantity))

    const touched = [...this.points.values()].filter(
      ({ def }) =>
        def.table === req.table &&
        def.address < req.address + req.quantity &&
        req.address < def.address + pointSize(def.dataType)
    )
    const locked = touched.find((p) => !p.def.writable)
    if (locked) {
      return this.deny(session, fc, EX.ILLEGAL_DATA_ADDRESS, `écriture refusée : le point « ${locked.def.name} » est protégé en écriture`)
    }
    this.store.write(req.table, req.address, req.values)
    for (const p of touched) p.value = this.readPoint(p.def)
    return buildResponse(req)
  }

  // --- Points simulés (modifiables à chaud) -----------------------------------

  checkUnique(points) {
    points.forEach((a, i) => {
      points.slice(i + 1).forEach((b) => {
        if (a.name === b.name) throw new Error(`Le point « ${a.name} » existe déjà`)
        if (overlaps(a, b)) throw new Error(`Les points « ${a.name} » et « ${b.name} » se chevauchent`)
      })
    })
  }

  addPoint(def) {
    const value = TABLES[def.table].bit ? toBoolean(def.initialValue) : Number(def.initialValue) || 0
    const entry = { def, value }
    this.points.set(def.id, entry)
    this.writePoint(entry)
  }

  writePoint(entry) {
    const { def } = entry
    if (TABLES[def.table].bit) this.store.write(def.table, def.address, [toBoolean(entry.value)])
    else this.store.write(def.table, def.address, encodeValue(entry.value, def.dataType, this.config.wordOrder))
    entry.value = this.readPoint(def)
  }

  readPoint(def) {
    if (TABLES[def.table].bit) return this.store.read(def.table, def.address, 1)[0]
    return decodeValue(this.store.read(def.table, def.address, pointSize(def.dataType)), def.dataType, this.config.wordOrder)
  }

  syncConfig() {
    this.config = { ...this.config, points: [...this.points.values()].map((p) => p.def) }
  }

  requireRunning() {
    if (!this.server) throw new Error('Le serveur n\'est pas démarré')
  }

  upsertPoint(def) {
    this.requireRunning()
    const next = { ...def, address: Number(def.address) }
    validatePoint(next, this.config.size)
    this.checkUnique([...[...this.points.values()].map((p) => p.def).filter((d) => d.id !== next.id), next])
    const current = this.points.get(next.id)
    if (current && current.def.table === next.table && current.def.address === next.address && current.def.dataType === next.dataType) {
      current.def = next
    } else {
      this.points.delete(next.id)
      this.addPoint(next)
    }
    this.syncConfig()
    this.onStatus(this.status())
    return this.status()
  }

  removePoint(id) {
    this.requireRunning()
    this.points.delete(id)
    this.syncConfig()
    this.onStatus(this.status())
    return this.status()
  }

  setValue(id, raw) {
    this.requireRunning()
    const entry = this.points.get(id)
    if (!entry) throw new Error('Point inconnu')
    entry.value = TABLES[entry.def.table].bit ? toBoolean(raw) : Number(raw)
    if (!TABLES[entry.def.table].bit && !Number.isFinite(entry.value)) throw new Error(`Valeur numérique invalide : ${raw}`)
    this.writePoint(entry)
    this.onValues(this.values())
    return entry.value
  }

  setUpdateRate(rate) {
    this.requireRunning()
    const n = Number(rate)
    if (!Number.isFinite(n) || n < 10) throw new Error('Période minimale : 10 ms')
    this.config = { ...this.config, updateRate: n }
    this.startSimulation()
    this.onStatus(this.status())
    return this.status()
  }

  startSimulation() {
    clearInterval(this.simTimer)
    const dt = Number(this.config.updateRate) || 100
    this.simTimer = setInterval(() => {
      const t = Date.now() - this.t0
      for (const entry of this.points.values()) {
        const { def } = entry
        if (def.simulation === 'none') continue
        let v = simulate(def, entry.value, t, dt)
        if (def.dataType === 'Boolean' && typeof v !== 'boolean') v = v >= (def.min + def.max) / 2
        entry.value = v
        this.writePoint(entry)
      }
    }, dt)
  }
}
