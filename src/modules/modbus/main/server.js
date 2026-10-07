import net from 'net'
import tls from 'tls'
import { randomUUID } from 'crypto'
import { simulate } from '@shared/simulator'
import { DATA_TYPES, DEFAULT_SERVER_SECURITY, TABLES } from '../shared/constants'
import { decodeValue, encodeValue, pointSize, toBoolean } from '../shared/codec'
import { DataStore } from './datastore'
import { EX, FrameReader, ModbusException, buildResponse, encodeFrame, exceptionPdu, parseRequest } from './protocol'
import { RateLimiter, buildAllowList, isAllowed, normalizeIp, resolveRole } from './security'
import { t } from '../shared/i18n'

const VALUES_EMIT_INTERVAL = 250
const MAX_LOG = 300
export const SERVER_COMMON_NAME = 'MODBUS@Sulfur'

/** Vérifie la cohérence d'un point (table, type, adresse) avec la taille de la mémoire. */
export function validatePoint(def, size) {
  if (!def.name?.trim()) throw new Error(t('modbus.errors.emptyPointName'))
  const table = TABLES[def.table]
  if (!table) throw new Error(t('modbus.errors.unknownTable', { table: def.table }))
  if (!(def.dataType in DATA_TYPES)) throw new Error(t('modbus.errors.unknownType', { type: def.dataType }))
  if (table.bit !== (def.dataType === 'Boolean')) {
    throw new Error(t('modbus.errors.incompatibleType', { name: def.name, type: def.dataType, table: table.label }))
  }
  const address = Number(def.address)
  if (!Number.isInteger(address) || address < 0 || address + pointSize(def.dataType) > size) {
    throw new Error(t('modbus.errors.addressOutOfRange', { name: def.name, max: size - pointSize(def.dataType) }))
  }
}

const overlaps = (a, b) =>
  a.table === b.table && a.address < b.address + pointSize(b.dataType) && b.address < a.address + pointSize(a.dataType)

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
  /** Défauts injectés par le simulateur : [{ id, type, params, points }] (points : ids de points). */
  faults = []

  constructor(pki, { onStatus, onValues, onLog }) {
    this.pki = pki
    this.onStatus = onStatus
    this.onValues = onValues
    this.onLog = onLog
  }

  status() {
    return {
      running: !!this.server,
      endpoint: this.server
        ? `${this.security.mode === 'tls' ? 'mbaps' : 'mbap'}://${this.config.host}:${this.config.port}`
        : null,
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
    if (this.server) throw new Error(t('errors.alreadyStarted'))
    const security = { ...DEFAULT_SERVER_SECURITY, ...config.security }
    const port = Number(config.port)
    const unitId = Number(config.unitId)
    const size = Number(config.size)
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(t('modbus.errors.invalidPort'))
    if (!Number.isInteger(unitId) || unitId < 0 || unitId > 255) throw new Error(t('modbus.errors.invalidUnitId'))
    if (!Number.isInteger(size) || size < 1 || size > 65536) throw new Error(t('modbus.errors.invalidSize'))
    if (security.mode === 'tls' && !(security.roles ?? []).length && !security.defaultRole) {
      throw new Error(t('modbus.errors.tlsNeedsRole'))
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

    const server =
      security.mode === 'tls' ? await this.createTlsServer(security) : net.createServer((s) => this.onPlainSocket(s))
    server.on('error', (err) => this.log('error', t('modbus.log.serverError', { message: err.message })))
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
      if (err.code === 'EACCES') throw new Error(t('modbus.errors.portPrivileged', { port }), { cause: err })
      if (err.code === 'EADDRINUSE') throw new Error(t('modbus.errors.portInUse', { port }), { cause: err })
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
      t('modbus.log.started', {
        address: `${config.host || '0.0.0.0'}:${port}`,
        transport:
          security.mode === 'tls'
            ? t('modbus.log.tlsTransport', { version: security.minTlsVersion })
            : t('modbus.log.plainTransport')
      })
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
      this.log('info', t('modbus.log.stopped'))
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
      this.log('warn', t('modbus.log.tlsFailure', { ip: normalizeIp(socket?.remoteAddress), message: err.message }))
    )
    return server
  }

  /** Contrôles communs à l'ouverture : liste blanche IP et nombre maximal de connexions. */
  admit(socket) {
    const ip = normalizeIp(socket.remoteAddress)
    if (this.fault('cut')) {
      this.log('warn', t('modbus.log.faultCut', { ip }))
      return false
    }
    if (!isAllowed(this.allowList, ip)) {
      this.log('warn', t('modbus.log.ipRefused', { ip }))
      return false
    }
    const max = Number(this.security.maxConnections) || 0
    if (max > 0 && this.sessions.size >= max) {
      this.log('warn', t('modbus.log.maxConnections', { ip, max }))
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
      this.log('warn', t('modbus.log.tlsRefused', { ip, reason }))
      socket.destroy()
    }
    try {
      const peer = socket.getPeerX509Certificate()
      let certRole = null
      let commonName = null
      if (!peer) {
        if (this.security.requireClientCertificate) return refuse(t('modbus.log.noClientCert'))
      } else {
        const check = await this.pki.checkPeer(peer, { autoAccept: !!this.security.autoAcceptCertificates })
        commonName = check.info.commonName
        if (!check.ok) return refuse(t('modbus.log.certNotTrusted', { name: commonName, reason: check.reason }))
        if (check.accepted) this.log('info', t('modbus.log.certAccepted', { name: commonName }))
        certRole = check.info.role
      }
      const role = resolveRole(this.security, certRole)
      if (!role) return refuse(certRole ? t('modbus.log.roleRefused', { role: certRole }) : t('modbus.log.noRole'))
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
      refuse(t('modbus.log.verifyError', { message: err.message }))
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
        this.log('info', t('modbus.log.disconnected', { remote: session.remote, count: session.requests }))
        this.onStatus(this.status())
      }
    })
    this.log(
      'info',
      tlsInfo
        ? t('modbus.log.connectedTls', {
            remote: session.remote,
            protocol: tlsInfo.protocol,
            name: tlsInfo.commonName ?? t('modbus.log.noCertificate'),
            role: tlsInfo.role
          })
        : t('modbus.log.connectedPlain', { remote: session.remote })
    )
    this.onStatus(this.status())
  }

  onData(session, chunk) {
    let frames
    try {
      frames = session.reader.push(chunk)
    } catch (err) {
      this.log('warn', t('modbus.log.invalidFrame', { remote: session.remote, message: err.message }))
      return session.socket.destroy()
    }
    for (const frame of frames) {
      const pdu = this.handle(session, frame)
      if (!pdu || this.fault('noResponse')) continue
      const send = () => {
        if (!session.socket.destroyed) session.socket.write(encodeFrame(frame.transactionId, frame.unitId, pdu))
      }
      const delay = Number(this.fault('delay')?.params?.ms) || 0
      if (delay > 0) setTimeout(send, delay)
      else send()
    }
  }

  deny(session, fc, code, message) {
    session.denied++
    if (message) this.log('warn', t('modbus.log.denied', { remote: session.remote, message }))
    return exceptionPdu(fc, code)
  }

  /** Traite une requête et retourne le PDU de réponse. */
  handle(session, { unitId, pdu }) {
    const fc = pdu[0]
    session.requests++

    if (session.limiter && !session.limiter.take()) {
      const now = Date.now()
      const message = now - session.lastThrottleLog > 1000 ? t('modbus.log.throttled') : null
      if (message) session.lastThrottleLog = now
      return this.deny(session, fc, EX.SERVER_DEVICE_BUSY, message)
    }
    if (!this.config.anyUnitId && unitId !== this.config.unitId) {
      return this.deny(
        session,
        fc,
        EX.GATEWAY_TARGET_FAILED,
        t('modbus.log.unknownUnit', { unitId, expected: this.config.unitId })
      )
    }

    let req
    try {
      req = parseRequest(pdu)
    } catch (err) {
      if (err instanceof ModbusException)
        return this.deny(session, fc, err.code, t('modbus.log.rejected', { message: err.message }))
      throw err
    }

    const forced = this.faults.find(
      (f) =>
        f.type === 'exception' &&
        (!f.params?.scope || f.params.scope === 'all' || (f.params.scope === 'write') === req.write)
    )
    if (forced) return this.deny(session, fc, Number(forced.params?.code) || EX.SERVER_DEVICE_FAILURE, null)

    if (req.write) {
      if (this.security.readOnly) return this.deny(session, fc, EX.ILLEGAL_FUNCTION, t('modbus.log.readOnly'))
      if (!session.permissions.write) {
        return this.deny(session, fc, EX.ILLEGAL_FUNCTION, t('modbus.log.noWrite', { role: session.tls?.role ?? '—' }))
      }
    } else if (!session.permissions.read) {
      return this.deny(session, fc, EX.ILLEGAL_FUNCTION, t('modbus.log.noRead', { role: session.tls?.role ?? '—' }))
    }
    if (!this.store.inRange(req.address, req.quantity)) {
      return this.deny(
        session,
        fc,
        EX.ILLEGAL_DATA_ADDRESS,
        t('modbus.log.outOfRange', { table: req.table, address: req.address, quantity: req.quantity })
      )
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
      return this.deny(session, fc, EX.ILLEGAL_DATA_ADDRESS, t('modbus.log.protectedPoint', { name: locked.def.name }))
    }
    this.store.write(req.table, req.address, req.values)
    for (const p of touched) p.value = this.readPoint(p.def)
    return buildResponse(req)
  }

  // --- Points simulés (modifiables à chaud) -----------------------------------

  checkUnique(points) {
    points.forEach((a, i) => {
      points.slice(i + 1).forEach((b) => {
        if (a.name === b.name) throw new Error(t('modbus.errors.pointExists', { name: a.name }))
        if (overlaps(a, b)) throw new Error(t('modbus.errors.pointsOverlap', { a: a.name, b: b.name }))
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
    return decodeValue(
      this.store.read(def.table, def.address, pointSize(def.dataType)),
      def.dataType,
      this.config.wordOrder
    )
  }

  syncConfig() {
    this.config = { ...this.config, points: [...this.points.values()].map((p) => p.def) }
  }

  requireRunning() {
    if (!this.server) throw new Error(t('errors.notStarted'))
  }

  upsertPoint(def) {
    this.requireRunning()
    const next = { ...def, address: Number(def.address) }
    validatePoint(next, this.config.size)
    this.checkUnique([...[...this.points.values()].map((p) => p.def).filter((d) => d.id !== next.id), next])
    const current = this.points.get(next.id)
    if (
      current &&
      current.def.table === next.table &&
      current.def.address === next.address &&
      current.def.dataType === next.dataType
    ) {
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
    if (!entry) throw new Error(t('modbus.errors.unknownPoint'))
    entry.value = TABLES[entry.def.table].bit ? toBoolean(raw) : Number(raw)
    if (!TABLES[entry.def.table].bit && !Number.isFinite(entry.value))
      throw new Error(t('errors.invalidNumber', { value: raw }))
    this.writePoint(entry)
    this.onValues(this.values())
    return entry.value
  }

  setUpdateRate(rate) {
    this.requireRunning()
    const n = Number(rate)
    if (!Number.isFinite(n) || n < 10) throw new Error(t('errors.minPeriod', { min: 10 }))
    this.config = { ...this.config, updateRate: n }
    this.startSimulation()
    this.onStatus(this.status())
    return this.status()
  }

  // --- Défauts injectés (module simulateur) ---------------------------------------

  /** Défaut actif d'un type donné, éventuellement limité à un point. */
  fault(type, pointId) {
    return this.faults.find(
      (f) => f.type === type && (pointId === undefined || !f.points?.length || f.points.includes(pointId))
    )
  }

  /** Remplace les défauts actifs ; une coupure ferme immédiatement les connexions ouvertes. */
  setFaults(faults = []) {
    const wasCut = !!this.fault('cut')
    this.faults = faults
    if (this.server && !wasCut && this.fault('cut')) {
      for (const s of this.sessions.values()) s.socket.destroy()
      this.log('warn', t('modbus.log.faultCutAll'))
    }
  }

  startSimulation() {
    clearInterval(this.simTimer)
    const dt = Number(this.config.updateRate) || 100
    this.simTimer = setInterval(() => {
      const elapsed = Date.now() - this.t0
      for (const entry of this.points.values()) {
        const { def } = entry
        if (def.simulation === 'none' || this.fault('freeze', def.id)) continue
        let v = simulate(def, entry.value, elapsed, dt)
        if (def.dataType === 'Boolean' && typeof v !== 'boolean') v = v >= (def.min + def.max) / 2
        entry.value = v
        this.writePoint(entry)
      }
    }, dt)
  }
}
