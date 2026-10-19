import net from 'net'
import { randomUUID } from 'crypto'
import snmp from 'net-snmp'
import { simulate } from '@shared/simulator'
import {
  AUTH_PROTOCOLS,
  DEFAULT_AGENT_CONFIG,
  MAX_LOG,
  MIN_KEY_LENGTH,
  NUMERIC_TYPES,
  OBJECT_TYPES,
  PRIV_PROTOCOLS,
  SECURITY_LEVELS,
  SYSTEM_OID
} from '../shared/constants'
import { t } from '../shared/i18n'
import { SNMP_TYPES, cleanOid, convertValue, isValidOid } from './values'

const STATUS_INTERVAL = 1000
const EMIT_INTERVAL = 200

const OPERATION_NAMES = {
  [snmp.PduType.GetRequest]: 'get',
  [snmp.PduType.GetNextRequest]: 'getNext',
  [snmp.PduType.GetBulkRequest]: 'getBulk',
  [snmp.PduType.SetRequest]: 'set'
}

const VERSION_NAMES = { [snmp.Version1]: 'v1', [snmp.Version2c]: 'v2c', [snmp.Version3]: 'v3' }

/** Vérifie la définition d'un objet simulé. */
export function validateObject(def, others = []) {
  const oid = cleanOid(def.oid)
  if (!isValidOid(oid)) throw new Error(t('snmp.errors.invalidOid', { oid: def.oid ?? '' }))
  if (oid === SYSTEM_OID || oid.startsWith(`${SYSTEM_OID}.`)) throw new Error(t('snmp.errors.systemOid', { oid }))
  for (const other of others) {
    if (other.id === def.id) continue
    const o = cleanOid(other.oid)
    if (o === oid || o.startsWith(`${oid}.`) || oid.startsWith(`${o}.`)) {
      throw new Error(t('snmp.errors.overlappingOid', { oid, other: o }))
    }
  }
  if (!OBJECT_TYPES.includes(def.type)) throw new Error(t('snmp.errors.invalidType'))
}

/** Vérifie un utilisateur SNMPv3 et le convertit au format de net-snmp. */
export function snmpUser(user) {
  const name = String(user?.name ?? '').trim()
  if (!name) throw new Error(t('snmp.errors.emptyUser'))
  if (!SECURITY_LEVELS.includes(user.level)) throw new Error(t('snmp.errors.invalidLevel'))
  const result = { name, level: snmp.SecurityLevel[user.level] }
  if (user.level !== 'noAuthNoPriv') {
    if (!AUTH_PROTOCOLS.includes(user.authProtocol)) throw new Error(t('snmp.errors.invalidAuthProtocol'))
    if (String(user.authKey ?? '').length < MIN_KEY_LENGTH) {
      throw new Error(t('snmp.errors.shortKey', { name, min: MIN_KEY_LENGTH }))
    }
    Object.assign(result, { authProtocol: snmp.AuthProtocols[user.authProtocol], authKey: user.authKey })
  }
  if (user.level === 'authPriv') {
    if (!PRIV_PROTOCOLS.includes(user.privProtocol)) throw new Error(t('snmp.errors.invalidPrivProtocol'))
    if (String(user.privKey ?? '').length < MIN_KEY_LENGTH) {
      throw new Error(t('snmp.errors.shortKey', { name, min: MIN_KEY_LENGTH }))
    }
    Object.assign(result, { privProtocol: snmp.PrivProtocols[user.privProtocol], privKey: user.privKey })
  }
  return result
}

const isHexEngineId = (id) => /^[0-9a-fA-F]{10,64}$/.test(id) && id.length % 2 === 0

/** Nom du fournisseur net-snmp d'un objet simulé. */
const providerName = (id) => `sulfur_${id}`

/**
 * Agent SNMP (net-snmp) v1 / v2c / v3 sur UDP :
 *  - groupe système de la MIB-II (sysDescr, sysUpTime…) et objets simulés (scalaires) modifiables
 *    par SetRequest s'ils sont déclarés en écriture ;
 *  - communautés en lecture seule et en lecture / écriture, utilisateurs SNMPv3 (USM) ;
 *  - envoi de notifications (traps v1 / v2c, informs) vers des destinataires ;
 *  - journal des requêtes, défauts injectés par le simulateur (délai, absence de réponse, erreur
 *    forcée, valeurs figées).
 */
export class SnmpAgent {
  agent = null
  config = null
  /** id -> { def, value } */
  variables = new Map()
  logEntries = []
  pending = []
  requests = 0
  trapsSent = 0
  faults = []
  timers = []
  simTimer = null
  t0 = Date.now()

  constructor({ onStatus = () => {}, onLog = () => {}, onValues = () => {} } = {}) {
    this.onStatus = onStatus
    this.onLog = onLog
    this.onValues = onValues
  }

  get running() {
    return !!this.agent
  }

  status() {
    return {
      running: this.running,
      endpoint: this.running ? `udp://${this.config.host || '0.0.0.0'}:${this.config.port}` : null,
      engineId: this.agent?.engine.engineID.toString('hex') ?? null,
      config: this.config,
      requests: this.requests,
      trapsSent: this.trapsSent
    }
  }

  values() {
    return Object.fromEntries([...this.variables].map(([id, v]) => [id, v.value]))
  }

  logs() {
    return this.logEntries
  }

  clearLogs() {
    this.logEntries = []
    return []
  }

  async start(input) {
    if (this.running) throw new Error(t('errors.alreadyStarted'))
    const config = {
      ...DEFAULT_AGENT_CONFIG,
      ...input,
      system: { ...DEFAULT_AGENT_CONFIG.system, ...input?.system },
      traps: { ...DEFAULT_AGENT_CONFIG.traps, ...input?.traps }
    }
    const port = Number(config.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(t('snmp.errors.invalidPort'))
    const rate = Number(config.updateRate)
    if (!Number.isFinite(rate) || rate < 10) throw new Error(t('errors.minPeriod', { min: 10 }))
    config.objects.forEach((def) => validateObject(def, config.objects))
    const users = (config.users ?? []).map(snmpUser)
    if (new Set(users.map((u) => u.name)).size !== users.length) throw new Error(t('snmp.errors.duplicateUser'))
    const engineId = String(config.engineId ?? '').trim()
    if (engineId && !isHexEngineId(engineId)) throw new Error(t('snmp.errors.invalidEngineId'))
    if (!isValidOid(cleanOid(config.system.objectId))) {
      throw new Error(t('snmp.errors.invalidOid', { oid: config.system.objectId }))
    }

    const host = config.host || '0.0.0.0'
    const agent = snmp.createAgent(
      {
        port,
        address: host === '0.0.0.0' ? null : host,
        transport: net.isIPv6(host) ? 'udp6' : 'udp4',
        accessControlModelType: snmp.AccessControlModelType.Simple,
        engineID: engineId || undefined
      },
      (error, data) => this.onAgentEvent(error, data)
    )
    try {
      await Promise.all(
        Object.values(agent.listener.sockets).map(
          (socket) =>
            new Promise((resolve, reject) => {
              socket.once('listening', resolve)
              socket.once('error', reject)
            })
        )
      )
    } catch (err) {
      agent.close()
      if (err.code === 'EACCES') throw new Error(t('snmp.errors.portPrivileged', { port }), { cause: err })
      if (err.code === 'EADDRINUSE') throw new Error(t('snmp.errors.portInUse', { port }), { cause: err })
      throw err
    }

    const authorizer = agent.getAuthorizer()
    const acm = authorizer.getAccessControlModel()
    if (config.readCommunity) {
      authorizer.addCommunity(config.readCommunity)
      acm.setCommunityAccess(config.readCommunity, snmp.AccessLevel.ReadOnly)
    }
    if (config.writeCommunity) {
      authorizer.addCommunity(config.writeCommunity)
      acm.setCommunityAccess(config.writeCommunity, snmp.AccessLevel.ReadWrite)
    }
    for (const user of users) {
      authorizer.addUser(user)
      acm.setUserAccess(user.name, snmp.AccessLevel.ReadWrite)
    }
    this.interceptResponses(agent)

    this.agent = agent
    this.config = { ...config, port, updateRate: rate, engineId }
    this.t0 = Date.now()
    this.requests = 0
    this.trapsSent = 0
    this.variables.clear()
    this.registerSystem()
    for (const def of config.objects) this.addObject(def)
    this.startSimulation()
    this.timers = [
      setInterval(() => this.flush(), EMIT_INTERVAL),
      setInterval(() => this.onStatus(this.status()), STATUS_INTERVAL),
      setInterval(() => this.onValues(this.values()), 250)
    ]
    this.onStatus(this.status())
    return this.status()
  }

  async stop() {
    clearInterval(this.simTimer)
    this.simTimer = null
    this.timers.forEach(clearInterval)
    this.timers = []
    const agent = this.agent
    this.agent = null
    if (agent) await new Promise((resolve) => agent.close(() => resolve()))
    this.flush()
    this.onStatus(this.status())
    return this.status()
  }

  requireRunning() {
    if (!this.running) throw new Error(t('errors.notStarted'))
  }

  // --- Requêtes -----------------------------------------------------------------------

  /** Erreurs signalées par net-snmp (communauté ou utilisateur inconnu, message invalide). */
  onAgentEvent(error) {
    if (!error || !this.agent) return
    const address = error.rinfo?.address?.replace(/^::ffff:/, '') ?? ''
    this.log({ level: 'warn', address, message: error.message })
  }

  /** Défauts et journal : chaque réponse de l'agent passe par `sendResponse`. */
  interceptResponses(agent) {
    const send = agent.sendResponse.bind(agent)
    agent.sendResponse = (socket, rinfo, request, response) => {
      this.requests++
      const operation = OPERATION_NAMES[request.pdu.type] ?? String(request.pdu.type)
      const forced = this.forcedError(operation)
      if (forced && operation !== 'set') {
        response.errorStatus = forced
        response.errorIndex = 1
      }
      const entry = {
        level: response.errorStatus ? 'warn' : 'info',
        address: rinfo.address.replace(/^::ffff:/, ''),
        version: VERSION_NAMES[request.version] ?? '',
        operation,
        oids: request.pdu.varbinds.map((vb) => vb.oid),
        errorStatus: response.errorStatus || 0
      }
      if (this.fault('noResponse')) return this.log({ ...entry, dropped: true })
      this.log(entry)
      const delay = Number(this.fault('delay')?.params?.ms) || 0
      if (delay > 0) setTimeout(() => this.agent && send(socket, rinfo, request, response), delay)
      else send(socket, rinfo, request, response)
    }
  }

  /** Code d'erreur forcé par le défaut « exception » pour cette opération (0 sinon). */
  forcedError(operation) {
    const fault = this.fault('exception')
    if (!fault) return 0
    const scope = fault.params?.scope ?? 'all'
    if (scope === 'read' && operation === 'set') return 0
    if (scope === 'write' && operation !== 'set') return 0
    return Number(fault.params?.code) || snmp.ErrorStatus.GeneralError
  }

  log(entry) {
    const full = { id: randomUUID(), time: new Date().toISOString(), ...entry }
    this.logEntries.push(full)
    if (this.logEntries.length > MAX_LOG) this.logEntries.splice(0, this.logEntries.length - MAX_LOG)
    this.pending.push(full)
  }

  flush() {
    if (!this.pending.length) return
    const batch = this.pending
    this.pending = []
    this.onLog(batch)
  }

  // --- MIB ----------------------------------------------------------------------------

  registerSystem() {
    const mib = this.agent.getMib()
    const system = this.config.system
    const scalar = (index, name, type, value, writable = false, handler) => {
      mib.registerProvider({
        name,
        type: snmp.MibProviderType.Scalar,
        oid: `${SYSTEM_OID}.${index}`,
        scalarType: type,
        maxAccess: snmp.MaxAccess[writable ? 'read-write' : 'read-only'],
        handler
      })
      mib.setScalarValue(name, value)
    }
    scalar(1, 'sysDescr', snmp.ObjectType.OctetString, system.descr)
    scalar(2, 'sysObjectID', snmp.ObjectType.OID, cleanOid(system.objectId))
    scalar(3, 'sysUpTime', snmp.ObjectType.TimeTicks, 0, false, (request) => {
      // Centièmes de seconde depuis le démarrage de l'agent.
      request.instanceNode.value = Math.floor((Date.now() - this.t0) / 10) % 4294967296
      request.done()
    })
    scalar(4, 'sysContact', snmp.ObjectType.OctetString, system.contact, true)
    scalar(5, 'sysName', snmp.ObjectType.OctetString, system.name, true)
    scalar(6, 'sysLocation', snmp.ObjectType.OctetString, system.location, true)
    // Services : application (couche 7) et transport (couche 4).
    scalar(7, 'sysServices', snmp.ObjectType.Integer, 72)
  }

  addObject(def) {
    let value
    try {
      value = convertValue(def.type, def.initialValue)
    } catch {
      value = NUMERIC_TYPES.includes(def.type)
        ? 0
        : def.type === 'IpAddress'
          ? '0.0.0.0'
          : def.type === 'OID'
            ? '0.0'
            : ''
    }
    const variable = { def: { ...def, oid: cleanOid(def.oid) }, value }
    this.variables.set(def.id, variable)
    const mib = this.agent.getMib()
    const name = providerName(def.id)
    mib.registerProvider({
      name,
      type: snmp.MibProviderType.Scalar,
      oid: variable.def.oid,
      scalarType: SNMP_TYPES[def.type],
      maxAccess: snmp.MaxAccess[def.writable ? 'read-write' : 'read-only'],
      handler: (request) => this.onObjectRequest(def.id, request)
    })
    mib.setScalarValue(name, value)
  }

  removeObject(id) {
    if (!this.variables.has(id)) return
    this.variables.delete(id)
    this.agent.getMib().unregisterProvider(providerName(id))
  }

  onObjectRequest(id, request) {
    const variable = this.variables.get(id)
    if (!variable) return request.done()
    if (request.operation === snmp.PduType.SetRequest) {
      const forced = this.forcedError('set')
      if (forced) return request.done({ errorStatus: forced })
      try {
        variable.value = convertValue(variable.def.type, request.setValue)
      } catch {
        return request.done({ errorStatus: snmp.ErrorStatus.WrongValue })
      }
      return request.done()
    }
    request.instanceNode.value = variable.value
    request.done()
  }

  /** Nouvelle valeur d'un objet simulé (interface, point). */
  setValue(id, raw) {
    this.requireRunning()
    const variable = this.variables.get(id)
    if (!variable) throw new Error(t('snmp.errors.unknownObject'))
    variable.value = convertValue(variable.def.type, raw)
    return variable.value
  }

  upsertObject(def) {
    this.requireRunning()
    const others = this.config.objects.filter((d) => d.id !== def.id)
    validateObject(def, others)
    const existing = this.variables.get(def.id)
    this.config = { ...this.config, objects: [...others, def] }
    const same =
      existing &&
      existing.def.oid === cleanOid(def.oid) &&
      existing.def.type === def.type &&
      !!existing.def.writable === !!def.writable
    if (same) existing.def = { ...def, oid: cleanOid(def.oid) }
    else {
      this.removeObject(def.id)
      this.addObject(def)
    }
    return this.status()
  }

  deleteObject(id) {
    this.requireRunning()
    this.removeObject(id)
    this.config = { ...this.config, objects: this.config.objects.filter((d) => d.id !== id) }
    return this.status()
  }

  setUpdateRate(rate) {
    this.requireRunning()
    const n = Number(rate)
    if (!Number.isFinite(n) || n < 10) throw new Error(t('errors.minPeriod', { min: 10 }))
    this.config = { ...this.config, updateRate: n }
    this.startSimulation()
    return this.status()
  }

  startSimulation() {
    clearInterval(this.simTimer)
    const dt = Number(this.config.updateRate) || 100
    this.simTimer = setInterval(() => {
      const elapsed = Date.now() - this.t0
      const frozen = this.fault('freeze')
      for (const [id, variable] of this.variables) {
        const { def } = variable
        if (def.simulation === 'none' || !NUMERIC_TYPES.includes(def.type)) continue
        if (frozen && (!frozen.points?.length || frozen.points.includes(id))) continue
        const spec = {
          ...def,
          min: Number(def.min),
          max: Number(def.max),
          period: Number(def.period) || 1000,
          dataType: 'Int32'
        }
        const value = simulate(spec, variable.value, elapsed, dt)
        const min = def.type === 'Integer' ? -2147483648 : 0
        variable.value = Math.min(
          Math.max(Math.round(Number(value)), min),
          def.type === 'Integer' ? 2147483647 : 4294967295
        )
      }
    }, dt)
  }

  // --- Notifications ------------------------------------------------------------------

  setTraps(traps) {
    this.requireRunning()
    this.config = { ...this.config, traps: { ...this.config.traps, ...traps } }
    return this.status()
  }

  /** Envoie la notification configurée à tous ses destinataires ; retourne le résultat de chacun. */
  async sendTrap() {
    this.requireRunning()
    const { traps } = this.config
    const oid = cleanOid(traps.oid)
    if (!isValidOid(oid)) throw new Error(t('snmp.errors.invalidOid', { oid: traps.oid }))
    if (!traps.targets?.length) throw new Error(t('snmp.errors.noTarget'))
    const varbinds = (traps.objects ?? [])
      .map((id) => this.variables.get(id))
      .filter(Boolean)
      .map((v) => ({ oid: `${v.def.oid}.0`, type: SNMP_TYPES[v.def.type], value: v.value }))

    const results = await Promise.all(
      traps.targets.map(async (target) => {
        const destination = `${target.host}:${target.port}`
        try {
          await this.notify(target, oid, varbinds)
          this.trapsSent++
          this.log({ level: 'info', operation: target.inform ? 'inform' : 'trap', address: destination, oids: [oid] })
          return { destination, ok: true }
        } catch (err) {
          this.log({ level: 'error', operation: 'trap', address: destination, message: err.message })
          return { destination, ok: false, error: err.message }
        }
      })
    )
    this.onStatus(this.status())
    return results
  }

  notify(target, oid, varbinds) {
    const port = Number(target.port)
    if (!String(target.host ?? '').trim() || !Number.isInteger(port) || port < 1 || port > 65535) {
      return Promise.reject(new Error(t('snmp.errors.invalidTarget')))
    }
    const session = snmp.createSession(target.host.trim(), target.community || 'public', {
      trapPort: port,
      port,
      version: target.version === 'v1' ? snmp.Version1 : snmp.Version2c,
      timeout: 2000,
      retries: 1
    })
    session.on('error', () => {})
    return new Promise((resolve, reject) => {
      const done = (err) => {
        session.close()
        if (err) reject(err)
        else resolve()
      }
      if (target.inform && target.version !== 'v1') session.inform(oid, varbinds, done)
      else session.trap(oid, varbinds, done)
    })
  }

  // --- Défauts ------------------------------------------------------------------------

  fault(type) {
    return this.faults.find((f) => f.type === type)
  }

  setFaults(faults = []) {
    this.faults = faults
  }
}
