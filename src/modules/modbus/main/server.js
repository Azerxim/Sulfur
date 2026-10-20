import net from 'net'
import tls from 'tls'
import { randomUUID } from 'crypto'
import { simulate } from '@shared/simulator'
import {
  DATA_TYPES,
  DEFAULT_IDENTITY,
  DEFAULT_SERVER_SECURITY,
  IDENTITY_OBJECTS,
  MAX_SERIAL_UNIT_ID,
  MAX_UNIT_ID,
  TABLES,
  TRANSPORTS
} from '../shared/constants'
import { decodeValue, encodeValue, pointSize, toBoolean } from '../shared/codec'
import { normalizeServerConfig, unitLabel } from '../shared/units'
import { DataStore } from './datastore'
import {
  EX,
  FUNCTIONS,
  ModbusException,
  buildIdentificationResponse,
  buildResponse,
  exceptionPdu,
  parseRequest
} from './protocol'
import { createFramer, interFrameDelay, isSerialTransport } from './framing'
import { normalizeSerial, openSerialPort, serialLabel } from './serial'
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

/** Nombre maximal d'adresses lues d'un coup par l'explorateur de registres. */
export const MAX_EXPLORER_COUNT = 500

/** Unit ID d'un équipement : 0 à 255 en TCP, 1 à 247 sur une liaison série (0 = diffusion). */
function validateUnitId(value, transport = 'tcp') {
  const unitId = Number(value)
  const serial = isSerialTransport(transport) || transport === 'rtuOverTcp'
  const [min, max] = serial ? [1, MAX_SERIAL_UNIT_ID] : [0, MAX_UNIT_ID]
  if (!Number.isInteger(unitId) || unitId < min || unitId > max) {
    throw new Error(serial ? t('modbus.errors.invalidSerialUnitId') : t('modbus.errors.invalidUnitId'))
  }
  return unitId
}

/** Adresse de diffusion sur une liaison série : écriture dans tous les équipements, sans réponse. */
const BROADCAST = 0

/** Objets d'identification d'un équipement (fonction 43 / 14) : Map identifiant → texte. */
export function identityObjects(identity = {}) {
  const objects = new Map()
  IDENTITY_OBJECTS.forEach((key, id) => {
    const value = String(identity[key] ?? '').trim()
    // Objets basiques (0 à 2) obligatoires : valeur par défaut s'ils sont vides.
    if (id <= 2) objects.set(id, value || DEFAULT_IDENTITY[key])
    else if (value) objects.set(id, value)
  })
  return objects
}

const overlaps = (a, b) =>
  a.table === b.table && a.address < b.address + pointSize(b.dataType) && b.address < a.address + pointSize(a.dataType)

/**
 * Serveur Modbus TCP (port 502), Modbus/TCP Security (TLS, port 802), RTU over TCP, ou esclave
 * Modbus RTU / ASCII sur une liaison série.
 *
 * Sécurités appliquées :
 *  - TLS ≥ 1.2 avec authentification mutuelle et certificats épinglés (magasin approuvés / rejetés)
 *  - autorisation par rôle (extension 1.3.6.1.4.1.50316.802.1 du certificat client)
 *  - liste blanche d'adresses IP, nombre maximal de connexions, limite de requêtes par seconde
 *  - mode lecture seule global, points protégés en écriture, filtrage du Unit ID
 *  - rejet des trames invalides (connexion fermée)
 *
 * Le serveur porte un ou plusieurs équipements (passerelle) : chacun répond à son Unit ID avec sa
 * propre mémoire, ses points et son identification (fonction 43 / 14). Sur une liaison série (et en
 * RTU over TCP), une requête pour un autre Unit ID est ignorée, comme sur un bus partagé, et une
 * écriture en diffusion (Unit ID 0) est appliquée à tous les équipements sans réponse.
 */
export class ModbusServer {
  server = null
  config = null
  security = null
  allowList = null
  /** id de l'équipement -> { def (sans les points), store } */
  units = new Map()
  /** Unit ID -> équipement */
  byUnitId = new Map()
  /** id du point -> { def, value, unit } */
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

  /** `openSerial(options)` : ouverture d'un port série (remplaçable dans les tests). */
  constructor(pki, { onStatus, onValues, onLog, openSerial = openSerialPort }) {
    this.pki = pki
    this.onStatus = onStatus
    this.onValues = onValues
    this.onLog = onLog
    this.openSerial = openSerial
  }

  /** TLS : uniquement en Modbus TCP (en-tête MBAP). */
  get secure() {
    return this.config?.transport === 'tcp' && this.security?.mode === 'tls'
  }

  endpoint() {
    if (!this.server) return null
    const { transport, host, port, serial } = this.config
    if (isSerialTransport(transport)) return `${transport}://${serial.path} · ${serialLabel(serial)}`
    const scheme = transport === 'rtuOverTcp' ? 'rtu+tcp' : this.secure ? 'mbaps' : 'mbap'
    return `${scheme}://${host}:${port}`
  }

  status() {
    return {
      running: !!this.server,
      endpoint: this.endpoint(),
      config: this.config,
      certificate: this.server && this.secure ? this.certificate : null,
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
    config = normalizeServerConfig(config)
    const transport = config.transport ?? 'tcp'
    if (!TRANSPORTS.includes(transport)) throw new Error(t('modbus.errors.unknownTransport', { transport }))
    const serialLink = isSerialTransport(transport)
    const security = { ...DEFAULT_SERVER_SECURITY, ...config.security }
    if (transport !== 'tcp') security.mode = 'tcp'
    const port = Number(config.port)
    const size = Number(config.size)
    const serial = serialLink ? normalizeSerial(config.serial) : { ...config.serial }
    if (!serialLink && (!Number.isInteger(port) || port < 1 || port > 65535))
      throw new Error(t('modbus.errors.invalidPort'))
    if (!Number.isInteger(size) || size < 1 || size > 65536) throw new Error(t('modbus.errors.invalidSize'))
    if (!config.units?.length) throw new Error(t('modbus.errors.noUnit'))
    if (security.mode === 'tls' && !(security.roles ?? []).length && !security.defaultRole) {
      throw new Error(t('modbus.errors.tlsNeedsRole'))
    }
    const allowList = buildAllowList(security.allowedIps)
    const units = config.units.map((u) => ({
      ...u,
      id: u.id ?? randomUUID(),
      unitId: validateUnitId(u.unitId, transport),
      name: u.name ?? '',
      identity: { ...DEFAULT_IDENTITY, ...u.identity },
      points: (u.points ?? []).map((p) => ({ ...p, id: p.id ?? randomUUID(), address: Number(p.address) }))
    }))
    this.checkUnits(units)
    for (const unit of units) {
      unit.points.forEach((p) => validatePoint(p, size))
      this.checkUnique(unit.points)
    }
    const ids = units.flatMap((u) => u.points.map((p) => p.id))
    const duplicate = ids.find((id, i) => ids.indexOf(id) !== i)
    if (duplicate) throw new Error(t('modbus.errors.duplicatePointId', { id: duplicate }))

    this.config = { ...config, transport, port, size, serial, security, units }
    this.security = security
    this.allowList = allowList
    this.units.clear()
    this.byUnitId.clear()
    this.points.clear()
    for (const { points, ...def } of units) {
      const unit = this.addUnitRuntime(def)
      for (const point of points) this.addPoint(point, unit)
    }

    const server = serialLink ? await this.openSerialServer(serial) : await this.listen(security, port, config.host)

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
      serialLink
        ? t('modbus.log.startedSerial', {
            path: serial.path,
            settings: serialLabel(serial),
            transport: t(`modbus.transports.${transport}`)
          })
        : t('modbus.log.started', {
            address: `${config.host || '0.0.0.0'}:${port}`,
            transport:
              transport === 'rtuOverTcp'
                ? t('modbus.transports.rtuOverTcp')
                : security.mode === 'tls'
                  ? t('modbus.log.tlsTransport', { version: security.minTlsVersion })
                  : t('modbus.log.plainTransport')
          })
    )
    this.onStatus(this.status())
    return this.status()
  }

  /** Serveur TCP (ou TLS) à l'écoute. */
  async listen(security, port, host) {
    const server =
      security.mode === 'tls' ? await this.createTlsServer(security) : net.createServer((s) => this.onPlainSocket(s))
    server.on('error', (err) => this.log('error', t('modbus.log.serverError', { message: err.message })))
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, host || '0.0.0.0', () => {
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
    return server
  }

  /**
   * Esclave sur une liaison série : une seule « connexion », le port, ouverte pendant toute la
   * marche du serveur. Retourne un objet { close(cb) } à la manière d'un serveur TCP.
   */
  async openSerialServer(serial) {
    let port
    try {
      port = await this.openSerial(serial)
    } catch (err) {
      this.reset()
      throw err
    }
    const session = this.openSession(port, null, { read: true, write: true }, { remote: serial.path })
    port.on('error', (err) => this.log('error', t('modbus.log.serialError', { message: err.message })))
    port.on('close', () => {
      // Port retiré (adaptateur USB débranché) : le serveur s'arrête.
      if (this.server && this.sessions.has(session.id)) {
        this.log('error', t('modbus.log.serialClosed', { path: serial.path }))
        this.stop()
      }
    })
    return {
      close: (callback) => {
        if (!port.isOpen) return callback()
        port.close(() => callback())
      }
    }
  }

  async stop() {
    const server = this.server
    const serialLink = isSerialTransport(this.config?.transport)
    if (!serialLink) for (const s of this.sessions.values()) s.socket.destroy()
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
    for (const s of this.sessions.values()) clearTimeout(s.flushTimer)
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

  /** `remote` : libellé de la connexion (adresse IP et port, ou port série). */
  openSession(socket, tlsInfo, permissions, { remote } = {}) {
    const rate = Number(this.security.maxRequestsPerSecond) || 0
    const serialLink = isSerialTransport(this.config.transport)
    const session = {
      id: ++this.sessionSeq,
      socket,
      remote: remote ?? `${normalizeIp(socket.remoteAddress)}:${socket.remotePort}`,
      since: new Date().toISOString(),
      tls: tlsInfo,
      permissions,
      requests: 0,
      denied: 0,
      limiter: rate > 0 ? new RateLimiter(rate) : null,
      lastThrottleLog: 0,
      framer: createFramer(this.config.transport, 'request'),
      flushTimer: null,
      lastData: 0
    }
    this.sessions.set(session.id, session)
    socket.setNoDelay?.(true)
    socket.on('error', () => {})
    socket.on('data', (chunk) => this.onData(session, chunk))
    if (!serialLink) {
      socket.on('close', () => {
        clearTimeout(session.flushTimer)
        if (this.sessions.delete(session.id)) {
          this.log('info', t('modbus.log.disconnected', { remote: session.remote, count: session.requests }))
          this.onStatus(this.status())
        }
      })
    }
    this.log(
      'info',
      serialLink
        ? t('modbus.log.serialOpened', { path: session.remote })
        : tlsInfo
          ? t('modbus.log.connectedTls', {
              remote: session.remote,
              protocol: tlsInfo.protocol,
              name: tlsInfo.commonName ?? t('modbus.log.noCertificate'),
              role: tlsInfo.role
            })
          : t('modbus.log.connectedPlain', { remote: session.remote })
    )
    this.onStatus(this.status())
    return session
  }

  onData(session, chunk) {
    session.lastData = Date.now()
    const { reader } = session.framer
    const errors = reader.errors
    let frames
    try {
      frames = reader.push(chunk)
    } catch (err) {
      this.log('warn', t('modbus.log.invalidFrame', { remote: session.remote, message: err.message }))
      return session.socket.destroy()
    }
    if (reader.errors > errors) this.logDropped(session, reader.errors - errors)
    this.process(session, frames)
    this.scheduleFlush(session)
  }

  /**
   * Trames RTU sans longueur connue (fonction non prise en charge) : terminées par un silence sur la
   * ligne. Le lecteur décide s'il garde une trame incomplète (latence des adaptateurs USB).
   */
  scheduleFlush(session) {
    clearTimeout(session.flushTimer)
    if (!session.framer.reader.pending) return
    const gap = isSerialTransport(this.config.transport) ? Math.max(20, interFrameDelay(this.config.serial)) : 50
    session.flushTimer = setTimeout(() => {
      if (!this.sessions.has(session.id)) return
      const { reader } = session.framer
      const errors = reader.errors
      let frames
      try {
        frames = reader.flush(Date.now() - session.lastData)
      } catch (err) {
        this.log('warn', t('modbus.log.invalidFrame', { remote: session.remote, message: err.message }))
        return session.socket.destroy()
      }
      if (reader.errors > errors) this.logDropped(session, reader.errors - errors)
      this.process(session, frames)
      if (reader.pending) session.flushTimer = setTimeout(() => this.scheduleFlush(session), 250)
    }, gap)
  }

  logDropped(session, count) {
    const now = Date.now()
    if (now - (session.lastDropLog ?? 0) < 1000) return
    session.lastDropLog = now
    this.log('warn', t('modbus.log.droppedFrames', { remote: session.remote, count }))
  }

  process(session, frames) {
    for (const frame of frames) {
      const pdu = this.handle(session, frame)
      if (!pdu || this.fault('noResponse')) continue
      const send = () => {
        if (!session.socket.destroyed) session.socket.write(session.framer.encode({ ...frame, pdu }))
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

  /** Traite une requête et retourne le PDU de réponse (null : pas de réponse). */
  handle(session, { unitId, pdu }) {
    const fc = pdu[0]
    const bus = !session.framer.framed
    if (bus && unitId === BROADCAST) {
      // Diffusion : écriture appliquée à chaque équipement, lectures ignorées, jamais de réponse.
      session.requests++
      if (FUNCTIONS[fc]?.write) for (const unit of this.units.values()) this.execute(session, unit, pdu)
      return null
    }
    // Bus série : un autre esclave est interrogé, on se tait.
    if (bus && !this.byUnitId.has(unitId) && !this.config.anyUnitId) return null
    session.requests++

    if (session.limiter && !session.limiter.take()) {
      const now = Date.now()
      const message = now - session.lastThrottleLog > 1000 ? t('modbus.log.throttled') : null
      if (message) session.lastThrottleLog = now
      return this.deny(session, fc, EX.SERVER_DEVICE_BUSY, message)
    }
    const unit = this.byUnitId.get(unitId) ?? (this.config.anyUnitId ? this.units.values().next().value : null)
    if (!unit) {
      return this.deny(
        session,
        fc,
        EX.GATEWAY_TARGET_FAILED,
        t('modbus.log.unknownUnit', { unitId, expected: [...this.byUnitId.keys()].join(', ') })
      )
    }
    return this.execute(session, unit, pdu)
  }

  /** Exécute une requête sur un équipement et retourne le PDU de réponse (ou d'exception). */
  execute(session, unit, pdu) {
    const fc = pdu[0]
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

    if (req.identification) {
      if (!session.permissions.read) {
        return this.deny(session, fc, EX.ILLEGAL_FUNCTION, t('modbus.log.noRead', { role: session.tls?.role ?? '—' }))
      }
      try {
        return buildIdentificationResponse(req, identityObjects(unit.def.identity))
      } catch (err) {
        if (err instanceof ModbusException)
          return this.deny(session, fc, err.code, t('modbus.log.rejected', { message: err.message }))
        throw err
      }
    }

    if (req.write) {
      if (this.security.readOnly) return this.deny(session, fc, EX.ILLEGAL_FUNCTION, t('modbus.log.readOnly'))
      if (!session.permissions.write) {
        return this.deny(session, fc, EX.ILLEGAL_FUNCTION, t('modbus.log.noWrite', { role: session.tls?.role ?? '—' }))
      }
    }
    if ((!req.write || req.read) && !session.permissions.read) {
      return this.deny(session, fc, EX.ILLEGAL_FUNCTION, t('modbus.log.noRead', { role: session.tls?.role ?? '—' }))
    }
    const { store } = unit
    // Fonction 23 : plage écrite en plus de la plage lue (address / quantity).
    const writeAddress = req.writeAddress ?? req.address
    const writeQuantity = req.writeQuantity ?? req.quantity
    const ranges = [[req.address, req.quantity]]
    if (req.read) ranges.push([writeAddress, writeQuantity])
    for (const [address, quantity] of ranges) {
      if (!store.inRange(address, quantity)) {
        return this.deny(
          session,
          fc,
          EX.ILLEGAL_DATA_ADDRESS,
          t('modbus.log.outOfRange', { table: req.table, address, quantity })
        )
      }
    }

    if (!req.write) return buildResponse(req, store.read(req.table, req.address, req.quantity))

    const touched = this.touchedPoints(unit, req.table, writeAddress, writeQuantity)
    const locked = touched.find((p) => !p.def.writable)
    if (locked) {
      return this.deny(session, fc, EX.ILLEGAL_DATA_ADDRESS, t('modbus.log.protectedPoint', { name: locked.def.name }))
    }
    store.write(req.table, writeAddress, req.values)
    for (const p of touched) p.value = this.readPoint(p)
    return buildResponse(req, req.read ? store.read(req.table, req.address, req.quantity) : undefined)
  }

  /** Points d'un équipement qui occupent une partie de la plage [address, address + quantity[. */
  touchedPoints(unit, table, address, quantity) {
    return [...this.points.values()].filter(
      (p) =>
        p.unit === unit &&
        p.def.table === table &&
        p.def.address < address + quantity &&
        address < p.def.address + pointSize(p.def.dataType)
    )
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

  addPoint(def, unit) {
    const value = TABLES[def.table].bit ? toBoolean(def.initialValue) : Number(def.initialValue) || 0
    const entry = { def, value, unit }
    this.points.set(def.id, entry)
    this.writePoint(entry)
  }

  writePoint(entry) {
    const { def, unit } = entry
    if (TABLES[def.table].bit) unit.store.write(def.table, def.address, [toBoolean(entry.value)])
    else unit.store.write(def.table, def.address, encodeValue(entry.value, def.dataType, this.config.wordOrder))
    entry.value = this.readPoint(entry)
  }

  readPoint({ def, unit }) {
    if (TABLES[def.table].bit) return unit.store.read(def.table, def.address, 1)[0]
    return decodeValue(
      unit.store.read(def.table, def.address, pointSize(def.dataType)),
      def.dataType,
      this.config.wordOrder
    )
  }

  /** Reconstruit `config.units` à partir des équipements et points en mémoire. */
  syncConfig() {
    const units = [...this.units.values()].map((unit) => ({
      ...unit.def,
      points: [...this.points.values()].filter((p) => p.unit === unit).map((p) => p.def)
    }))
    this.config = { ...this.config, units }
  }

  // --- Équipements (Unit ID) ---------------------------------------------------------

  /** Unit ID uniques, identifiants d'équipements uniques. */
  checkUnits(units) {
    units.forEach((a, i) => {
      units.slice(i + 1).forEach((b) => {
        if (a.unitId === b.unitId) throw new Error(t('modbus.errors.unitExists', { unitId: a.unitId }))
        if (a.id === b.id) throw new Error(t('modbus.errors.unitExists', { unitId: a.unitId }))
      })
    })
  }

  addUnitRuntime(def) {
    const unit = { def, store: new DataStore(this.config.size) }
    this.units.set(def.id, unit)
    this.byUnitId.set(def.unitId, unit)
    return unit
  }

  unit(id) {
    const unit = this.units.get(id)
    if (!unit) throw new Error(t('modbus.errors.unknownUnit'))
    return unit
  }

  /** Ajoute un équipement (sans points) au serveur en marche. */
  addUnit(def) {
    this.requireRunning()
    const next = {
      id: def.id ?? randomUUID(),
      unitId: validateUnitId(def.unitId, this.config.transport),
      name: def.name ?? '',
      identity: { ...DEFAULT_IDENTITY, ...def.identity }
    }
    this.checkUnits([...[...this.units.values()].map((u) => u.def), next])
    this.addUnitRuntime(next)
    for (const point of def.points ?? []) this.upsertPoint(point, next.id, { silent: true })
    return this.changed(t('modbus.log.unitAdded', { unit: unitLabel(next) }))
  }

  /** Modifie le Unit ID, le nom ou l'identification d'un équipement. */
  updateUnit(def) {
    this.requireRunning()
    const unit = this.unit(def.id)
    const next = {
      ...unit.def,
      unitId: validateUnitId(def.unitId ?? unit.def.unitId, this.config.transport),
      name: def.name ?? unit.def.name,
      identity: { ...unit.def.identity, ...def.identity }
    }
    this.checkUnits([...[...this.units.values()].filter((u) => u !== unit).map((u) => u.def), next])
    this.byUnitId.delete(unit.def.unitId)
    unit.def = next
    this.byUnitId.set(next.unitId, unit)
    return this.changed()
  }

  /** Retire un équipement et ses points (le serveur en garde au moins un). */
  removeUnit(id) {
    this.requireRunning()
    const unit = this.unit(id)
    if (this.units.size <= 1) throw new Error(t('modbus.errors.lastUnit'))
    this.units.delete(id)
    this.byUnitId.delete(unit.def.unitId)
    for (const [pointId, p] of this.points) if (p.unit === unit) this.points.delete(pointId)
    return this.changed(t('modbus.log.unitRemoved', { unit: unitLabel(unit.def) }))
  }

  changed(message) {
    this.syncConfig()
    if (message) this.log('info', message)
    this.onStatus(this.status())
    return this.status()
  }

  // --- Explorateur de registres --------------------------------------------------------

  checkExplorerRange(unit, table, address, count) {
    if (!TABLES[table]) throw new Error(t('modbus.errors.unknownTable', { table }))
    if (!Number.isInteger(count) || count < 1 || count > MAX_EXPLORER_COUNT)
      throw new Error(t('modbus.errors.invalidQuantityRange', { max: MAX_EXPLORER_COUNT }))
    if (!unit.store.inRange(address, 1)) throw new Error(t('modbus.errors.invalidAddress'))
  }

  /** Contenu brut d'une table d'un équipement : booléens ou mots 16 bits (tronqué à la fin de la mémoire). */
  registers(unitKey, table, address, count) {
    this.requireRunning()
    const unit = this.unit(unitKey)
    address = Number(address)
    count = Number(count)
    this.checkExplorerRange(unit, table, address, count)
    return unit.store.read(table, address, Math.min(count, this.config.size - address))
  }

  /** Écrit une adresse de la mémoire d'un équipement (toutes tables) ; les points concernés suivent. */
  writeRegister(unitKey, table, address, raw) {
    this.requireRunning()
    const unit = this.unit(unitKey)
    address = Number(address)
    this.checkExplorerRange(unit, table, address, 1)
    let value
    if (TABLES[table].bit) value = toBoolean(raw)
    else {
      value = Number(raw)
      if (!Number.isInteger(value) || value < 0 || value > 0xffff)
        throw new Error(t('modbus.errors.invalidRegister', { value: raw }))
    }
    unit.store.write(table, address, [value])
    for (const p of this.touchedPoints(unit, table, address, 1)) p.value = this.readPoint(p)
    this.onValues(this.values())
    return unit.store.read(table, address, 1)[0]
  }

  requireRunning() {
    if (!this.server) throw new Error(t('errors.notStarted'))
  }

  /** Ajoute ou modifie un point de l'équipement `unitKey` (par défaut : celui qui le porte, sinon le premier). */
  upsertPoint(def, unitKey, { silent = false } = {}) {
    this.requireRunning()
    const current = this.points.get(def.id)
    const unit = unitKey ? this.unit(unitKey) : (current?.unit ?? this.units.values().next().value)
    const next = { ...def, id: def.id ?? randomUUID(), address: Number(def.address) }
    validatePoint(next, this.config.size)
    const siblings = [...this.points.values()].filter((p) => p.unit === unit && p.def.id !== next.id).map((p) => p.def)
    this.checkUnique([...siblings, next])
    if (
      current &&
      current.unit === unit &&
      current.def.table === next.table &&
      current.def.address === next.address &&
      current.def.dataType === next.dataType
    ) {
      current.def = next
    } else {
      this.points.delete(next.id)
      this.addPoint(next, unit)
    }
    if (silent) return null
    return this.changed()
  }

  removePoint(id) {
    this.requireRunning()
    this.points.delete(id)
    return this.changed()
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
