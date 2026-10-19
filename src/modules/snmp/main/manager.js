import net from 'net'
import { randomUUID } from 'crypto'
import snmp from 'net-snmp'
import { DEFAULT_MANAGER_CONFIG, MAX_TRAPS, MAX_WALK, OBJECT_TYPES, OPERATIONS, VERSIONS } from '../shared/constants'
import { t } from '../shared/i18n'
import { snmpUser } from './agent'
import { SNMP_TYPES, cleanOid, convertValue, isValidOid, readVarbind } from './values'

const EMIT_INTERVAL = 200

const NOTIFICATION_NAMES = {
  [snmp.PduType.Trap]: 'trap',
  [snmp.PduType.TrapV2]: 'trap',
  [snmp.PduType.InformRequest]: 'inform'
}

/** snmpTrapOID.0 et sysUpTime.0 dans une notification v2c / v3. */
const TRAP_OID = '1.3.6.1.6.3.1.1.4.1.0'
const UPTIME_OID = '1.3.6.1.2.1.1.3.0'

/** Message d'erreur lisible d'une requête. */
function requestError(err) {
  if (err instanceof snmp.RequestTimedOutError) return t('snmp.errors.timeout')
  if (err instanceof snmp.RequestFailedError && Number.isInteger(err.status)) {
    return t('snmp.errors.errorStatus', { status: snmp.ErrorStatus[err.status] ?? err.status })
  }
  return err?.message ?? String(err)
}

function normalizeTarget(input) {
  const config = { ...DEFAULT_MANAGER_CONFIG, ...input, user: { ...DEFAULT_MANAGER_CONFIG.user, ...input?.user } }
  const host = String(config.host ?? '').trim()
  if (!host) throw new Error(t('snmp.errors.missingHost'))
  const port = Number(config.port)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(t('snmp.errors.invalidPort'))
  if (!VERSIONS.includes(config.version)) throw new Error(t('snmp.errors.invalidVersion'))
  return { ...config, host, port }
}

/**
 * Manager SNMP (net-snmp) : requêtes Get, GetNext, GetBulk, Set et parcours (walk) en v1 / v2c / v3,
 * surveillance périodique d'OID (points), récepteur de notifications (traps, informs).
 */
export class SnmpManager {
  pollTimer = null
  pollConfig = null
  /** id de surveillance -> { oid, type, value, error, time } */
  last = new Map()
  receiver = null
  receiverConfig = null
  traps = []
  pendingTraps = []
  trapCount = 0
  timer = null

  constructor({ onStatus = () => {}, onPoll = () => {}, onTraps = () => {} } = {}) {
    this.onStatus = onStatus
    this.onPoll = onPoll
    this.onTraps = onTraps
  }

  status() {
    return {
      polling: !!this.pollTimer,
      pollInterval: this.pollConfig?.pollInterval ?? null,
      receiving: !!this.receiver,
      receiverEndpoint: this.receiver
        ? `udp://${this.receiverConfig.host || '0.0.0.0'}:${this.receiverConfig.port}`
        : null,
      traps: this.trapCount
    }
  }

  changed() {
    this.onStatus(this.status())
    return this.status()
  }

  /** Session vers l'agent (fermée par l'appelant). */
  session(config) {
    const options = {
      port: config.port,
      timeout: Number(config.timeout) || 2000,
      retries: Number.isInteger(Number(config.retries)) ? Number(config.retries) : 1,
      transport: net.isIPv6(config.host) ? 'udp6' : 'udp4'
    }
    const session =
      config.version === 'v3'
        ? snmp.createV3Session(config.host, snmpUser(config.user), { ...options, version: snmp.Version3 })
        : snmp.createSession(config.host, config.community || 'public', {
            ...options,
            version: config.version === 'v1' ? snmp.Version1 : snmp.Version2c
          })
    session.on('error', () => {})
    return session
  }

  /** Exécute une requête ; retourne { varbinds: [{ oid, type, value, error? }], truncated? }. */
  async request(input, request = {}) {
    const config = normalizeTarget(input)
    const { operation = 'get', type, value } = request
    if (!OPERATIONS.includes(operation)) throw new Error(t('snmp.errors.invalidOperation'))
    const oids = String(request.oid ?? '')
      .split(/[\s,;]+/)
      .map(cleanOid)
      .filter(Boolean)
    if (!oids.length) throw new Error(t('snmp.errors.missingOid'))
    const bad = oids.find((oid) => !isValidOid(oid))
    if (bad) throw new Error(t('snmp.errors.invalidOid', { oid: bad }))
    if (operation === 'getBulk' && config.version === 'v1') throw new Error(t('snmp.errors.bulkV1'))

    let varbinds
    if (operation === 'set') {
      if (!OBJECT_TYPES.includes(type)) throw new Error(t('snmp.errors.invalidType'))
      const converted = convertValue(type, value)
      varbinds = oids.map((oid) => ({ oid, type: SNMP_TYPES[type], value: converted }))
    }
    const session = this.session(config)
    const maxRepetitions = Math.max(1, Math.min(Number(request.maxRepetitions) || 10, 100))
    try {
      if (operation === 'walk') return await this.walk(session, oids[0], config.version === 'v1' ? 1 : maxRepetitions)
      const result = await new Promise((resolve, reject) => {
        const done = (err, list) => (err ? reject(err) : resolve(list))
        if (operation === 'get') session.get(oids, done)
        else if (operation === 'getNext') session.getNext(oids, done)
        else if (operation === 'getBulk') session.getBulk(oids, 0, maxRepetitions, done)
        else session.set(varbinds, done)
      })
      // GetBulk : une liste de varbinds par OID demandé (nonRepeaters = 0).
      return { varbinds: result.flat().map(readVarbind) }
    } catch (err) {
      throw new Error(requestError(err), { cause: err })
    } finally {
      session.close()
    }
  }

  walk(session, oid, maxRepetitions) {
    const varbinds = []
    let truncated = false
    return new Promise((resolve, reject) => {
      session.subtree(
        oid,
        maxRepetitions,
        (list) => {
          for (const vb of list) {
            if (varbinds.length >= MAX_WALK) {
              truncated = true
              return true
            }
            varbinds.push(readVarbind(vb))
          }
          return false
        },
        (err) => (err ? reject(err) : resolve({ varbinds, truncated }))
      )
    })
  }

  // --- Surveillance -------------------------------------------------------------------

  /** Lit ensemble les OID surveillés ; les valeurs alimentent les points `client:<id>`. */
  async poll(config) {
    const monitors = (config.monitors ?? []).filter((m) => isValidOid(cleanOid(m.oid)))
    if (!monitors.length) return {}
    const time = new Date().toISOString()
    try {
      const { varbinds } = await this.request(config, { operation: 'get', oid: monitors.map((m) => m.oid).join(' ') })
      monitors.forEach((m, i) => this.last.set(m.id, { ...varbinds[i], time }))
    } catch (err) {
      for (const m of monitors) this.last.set(m.id, { oid: cleanOid(m.oid), value: null, error: err.message, time })
    }
    const values = Object.fromEntries(this.last)
    this.onPoll(values)
    return values
  }

  async startPolling(input) {
    const config = normalizeTarget(input)
    const interval = Number(config.pollInterval)
    if (!Number.isFinite(interval) || interval < 0.5) throw new Error(t('snmp.errors.minPoll'))
    this.stopPolling()
    this.pollConfig = config
    this.pollTimer = setInterval(() => this.poll(config), interval * 1000)
    this.changed()
    await this.poll(config)
    return this.status()
  }

  stopPolling() {
    clearInterval(this.pollTimer)
    this.pollTimer = null
    this.pollConfig = null
    return this.changed()
  }

  /** Écrit un OID surveillé (point), avec le type de sa dernière lecture. */
  async writeMonitor(id, value) {
    const config = this.pollConfig
    const monitor = config?.monitors?.find((m) => m.id === id)
    if (!monitor) throw new Error(t('snmp.errors.notPolling'))
    const type = this.last.get(id)?.type
    if (!OBJECT_TYPES.includes(type)) throw new Error(t('snmp.errors.unknownMonitorType'))
    await this.request(config, { operation: 'set', oid: monitor.oid, type, value })
    await this.poll(config)
  }

  // --- Notifications ------------------------------------------------------------------

  async startReceiver(input) {
    if (this.receiver) throw new Error(t('snmp.errors.receiverRunning'))
    const config = { ...DEFAULT_MANAGER_CONFIG.receiver, ...input?.receiver }
    const port = Number(config.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(t('snmp.errors.invalidPort'))
    const host = config.host || '0.0.0.0'
    const receiver = snmp.createReceiver(
      {
        port,
        address: host === '0.0.0.0' ? null : host,
        transport: net.isIPv6(host) ? 'udp6' : 'udp4',
        // Toutes les communautés sont acceptées en v1 / v2c ; en v3, l'utilisateur du manager.
        disableAuthorization: true,
        includeAuthentication: true
      },
      (error, notification) => {
        if (!error) this.onNotification(notification)
      }
    )
    try {
      await Promise.all(
        Object.values(receiver.listener.sockets).map(
          (socket) =>
            new Promise((resolve, reject) => {
              socket.once('listening', resolve)
              socket.once('error', reject)
            })
        )
      )
    } catch (err) {
      receiver.close()
      if (err.code === 'EACCES') throw new Error(t('snmp.errors.portPrivileged', { port }), { cause: err })
      if (err.code === 'EADDRINUSE') throw new Error(t('snmp.errors.portInUse', { port }), { cause: err })
      throw err
    }
    if (input?.version === 'v3') {
      try {
        receiver.getAuthorizer().addUser(snmpUser({ ...DEFAULT_MANAGER_CONFIG.user, ...input.user }))
      } catch {
        // utilisateur incomplet : seules les notifications v1 / v2c sont reçues
      }
    }
    this.receiver = receiver
    this.receiverConfig = { host, port }
    this.timer = setInterval(() => this.flush(), EMIT_INTERVAL)
    return this.changed()
  }

  async stopReceiver() {
    clearInterval(this.timer)
    this.timer = null
    const receiver = this.receiver
    this.receiver = null
    if (receiver) await new Promise((resolve) => receiver.close(() => resolve()))
    this.flush()
    return this.changed()
  }

  onNotification({ pdu, rinfo }) {
    const varbinds = pdu.varbinds.map(readVarbind)
    const trapOid =
      pdu.type === snmp.PduType.Trap
        ? `${pdu.enterprise ?? ''} · ${pdu.generic ?? ''}/${pdu.specific ?? ''}`
        : (varbinds.find((vb) => vb.oid === TRAP_OID)?.value ?? '')
    const entry = {
      id: randomUUID(),
      time: new Date().toISOString(),
      address: rinfo.address.replace(/^::ffff:/, ''),
      type: NOTIFICATION_NAMES[pdu.type] ?? String(pdu.type),
      version: pdu.type === snmp.PduType.Trap ? 'v1' : pdu.scoped ? 'v3' : 'v2c',
      community: pdu.community ?? rinfo.community ?? '',
      user: pdu.user ?? '',
      trapOid,
      varbinds: varbinds.filter((vb) => vb.oid !== TRAP_OID && vb.oid !== UPTIME_OID)
    }
    this.trapCount++
    this.traps.push(entry)
    if (this.traps.length > MAX_TRAPS) this.traps.splice(0, this.traps.length - MAX_TRAPS)
    this.pendingTraps.push(entry)
  }

  flush() {
    if (!this.pendingTraps.length) return
    const batch = this.pendingTraps
    this.pendingTraps = []
    this.onTraps(batch)
    this.changed()
  }

  clearTraps() {
    this.traps = []
    return []
  }

  async close() {
    this.stopPolling()
    await this.stopReceiver()
  }
}
