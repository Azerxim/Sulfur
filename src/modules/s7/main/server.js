import net from 'net'
import { simulate } from '@azerxim/sulfur-sdk'
import { AREAS, AREA_BY_CODE, DEFAULT_IDENTITY, PDU_SIZES, RETURN_CODES } from '../shared/constants'
import { formatAddress } from '../shared/address'
import { validateMemory, validatePoint } from '../shared/memory'
import { decodeValue, encodeValue, isNumericType, parseInput, toBoolean } from '../shared/codec'
import { t } from '../shared/i18n'
import {
  COTP_TYPES,
  FUNCTIONS,
  FrameReader,
  ROSCTR,
  TRANSPORT,
  connectConfirm,
  dataFrame,
  formatTsap,
  parseCotp,
  parseDataItems,
  parsePiService,
  parseS7,
  parseSetup,
  parseUserdata,
  parseVarParams,
  readResponseData,
  s7Pdu,
  setupParams,
  szlResponse
} from './protocol'

const VALUES_EMIT_INTERVAL = 250
const MAX_LOG = 300
/** Nombre maximal d'octets lus d'un coup par l'explorateur de mémoire. */
export const MAX_EXPLORER_COUNT = 1024

/** Erreurs d'en-tête renvoyées par le serveur (classe, code). */
const HEADER_ERRORS = { NOT_SUPPORTED: [0x81, 0x04], PDU_TOO_LARGE: [0x85, 0x00] }
/** Codes d'erreur userdata : liste d'état système inconnue. */
const SZL_UNKNOWN = 0xd401

/** Octets par élément selon la taille de transport demandée (BYTE, CHAR, WORD, INT, DWORD, DINT, REAL). */
const TRANSPORT_SIZES = { 0x02: 1, 0x03: 1, 0x04: 2, 0x05: 2, 0x06: 4, 0x07: 4, 0x08: 4 }

const normalizeIp = (ip) => String(ip ?? '').replace(/^::ffff:/, '')

/** Champ texte de longueur fixe (SZL), complété par des espaces. */
function fixedText(text, length, fill = 0x20) {
  const buf = Buffer.alloc(length, fill)
  buf.write(String(text ?? '').slice(0, length), 'latin1')
  return buf
}

/**
 * Automate S7 simulé (S7comm sur ISO-on-TCP).
 *
 * Mémoire : entrées (I), sorties (Q), mémentos (M) et blocs de données configurés. Les points
 * simulés écrivent leur valeur dans cette mémoire ; les écritures des clients mettent à jour les
 * points concernés. Le serveur répond aussi aux listes d'état système (identification, état de la
 * CPU) et aux demandes de démarrage / arrêt : en STOP, la simulation des points est suspendue.
 */
export class S7Server {
  server = null
  config = null
  /** Zone ('I', 'Q', 'M') ou numéro de DB -> Buffer */
  memory = { I: null, Q: null, M: null, dbs: new Map() }
  /** id du point -> { def, address, value } */
  points = new Map()
  sessions = new Map()
  logEntries = []
  cpuState = 'run'
  simTimer = null
  emitTimer = null
  sessionSeq = 0
  logSeq = 0
  faults = []
  valuesDirty = false

  constructor({ onStatus = () => {}, onValues = () => {}, onLog = () => {} } = {}) {
    this.onStatus = onStatus
    this.onValues = onValues
    this.onLog = onLog
  }

  status() {
    return {
      running: !!this.server,
      endpoint: this.server ? `${this.config.host}:${this.config.port}` : null,
      config: this.config,
      cpuState: this.server ? this.cpuState : null,
      connections: [...this.sessions.values()].map((s) => ({
        id: s.id,
        remote: s.remote,
        since: s.since,
        tsap: s.tsap,
        pduSize: s.pduSize,
        requests: s.requests
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
    const entry = { id: ++this.logSeq, time: new Date().toISOString(), level, message }
    this.logEntries.push(entry)
    if (this.logEntries.length > MAX_LOG) this.logEntries.splice(0, this.logEntries.length - MAX_LOG)
    this.onLog(entry)
  }

  async start(options) {
    if (this.server) throw new Error(t('errors.alreadyStarted'))
    const config = {
      ...options,
      identity: { ...DEFAULT_IDENTITY, ...options?.identity },
      points: options?.points ?? []
    }
    const port = Number(config.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(t('s7.errors.invalidPort'))
    config.port = port
    config.pduSize = PDU_SIZES.includes(Number(config.pduSize)) ? Number(config.pduSize) : 480
    const { sizes, dbs } = validateMemory(config)
    const memory = {
      I: Buffer.alloc(sizes.I),
      Q: Buffer.alloc(sizes.Q),
      M: Buffer.alloc(sizes.M),
      dbs: new Map([...dbs].map(([number, size]) => [number, Buffer.alloc(size)]))
    }
    const shape = { sizes, dbs }
    const points = new Map()
    for (const def of config.points) points.set(def.id, { def, address: validatePoint(def, shape), value: null })

    const server = net.createServer((socket) => this.onConnection(socket))
    await new Promise((resolve, reject) => {
      server.once('error', (err) =>
        reject(new Error(err.code === 'EADDRINUSE' ? t('s7.errors.portInUse', { port }) : err.message))
      )
      server.listen(port, config.host || '0.0.0.0', resolve)
    })
    server.on('error', (err) => this.log('error', err.message))

    this.server = server
    this.config = config
    this.memory = memory
    this.shape = shape
    this.points = points
    this.cpuState = 'run'
    for (const entry of points.values()) {
      entry.value = this.coerce(entry.def, entry.def.initialValue)
      this.writePoint(entry)
    }
    this.t0 = Date.now()
    this.startSimulation()
    this.emitTimer = setInterval(() => {
      if (!this.valuesDirty) return
      this.valuesDirty = false
      this.onValues(this.values())
    }, VALUES_EMIT_INTERVAL)
    this.log('info', t('s7.log.started', { endpoint: `${config.host}:${port}` }))
    this.onStatus(this.status())
    return this.status()
  }

  async stop() {
    if (!this.server) return this.status()
    clearInterval(this.simTimer)
    clearInterval(this.emitTimer)
    for (const s of this.sessions.values()) s.socket.destroy()
    this.sessions.clear()
    const server = this.server
    this.server = null
    await new Promise((resolve) => server.close(() => resolve()))
    this.log('info', t('s7.log.stopped'))
    this.onStatus(this.status())
    return this.status()
  }

  requireRunning() {
    if (!this.server) throw new Error(t('errors.notStarted'))
  }

  // --- Connexions ------------------------------------------------------------------------

  onConnection(socket) {
    const ip = normalizeIp(socket.remoteAddress)
    if (this.fault('cut')) {
      this.log('warn', t('s7.log.faultCut', { ip }))
      socket.destroy()
      return
    }
    const session = {
      id: ++this.sessionSeq,
      socket,
      remote: `${ip}:${socket.remotePort}`,
      since: new Date().toISOString(),
      tsap: null,
      pduSize: null,
      requests: 0
    }
    this.sessions.set(session.id, session)
    socket.setNoDelay(true)
    const reader = new FrameReader()
    socket.on('data', (chunk) => {
      try {
        for (const frame of reader.push(chunk)) this.onFrame(session, frame)
      } catch (err) {
        this.log('warn', t('s7.log.invalidFrame', { remote: session.remote, message: err.message }))
        socket.destroy()
      }
    })
    socket.on('error', () => {})
    socket.on('close', () => {
      if (!this.sessions.delete(session.id)) return
      this.log('info', t('s7.log.disconnected', { remote: session.remote }))
      this.onStatus(this.status())
    })
    this.log('info', t('s7.log.connected', { remote: session.remote }))
    this.onStatus(this.status())
  }

  send(session, frame) {
    if (this.fault('noResponse')) return
    const write = () => !session.socket.destroyed && session.socket.write(frame)
    const delay = Number(this.fault('delay')?.params?.ms) || 0
    if (delay > 0) setTimeout(write, delay)
    else write()
  }

  onFrame(session, frame) {
    const cotp = parseCotp(frame)
    if (cotp.type === COTP_TYPES.CR) {
      const local = cotp.params[0xc1]
      const remote = cotp.params[0xc2]
      session.tsap = {
        local: local?.length === 2 ? formatTsap(local.readUInt16BE(0)) : '—',
        remote: remote?.length === 2 ? formatTsap(remote.readUInt16BE(0)) : '—'
      }
      this.send(session, connectConfirm(cotp))
      this.onStatus(this.status())
      return
    }
    if (cotp.type === COTP_TYPES.DR) {
      session.socket.end()
      return
    }
    if (cotp.type !== COTP_TYPES.DT) return
    const req = parseS7(cotp.payload)
    session.requests++
    const reply = (pdu) => this.send(session, dataFrame(s7Pdu({ ref: req.ref, ...pdu })))
    if (req.rosctr === ROSCTR.USERDATA) return reply({ rosctr: ROSCTR.USERDATA, ...this.userdata(req) })
    if (req.rosctr !== ROSCTR.JOB) return

    const fn = req.params[0]
    switch (fn) {
      case FUNCTIONS.SETUP: {
        const { amqCaller, pduSize } = parseSetup(req.params)
        session.pduSize = Math.max(240, Math.min(pduSize, this.config.pduSize))
        this.onStatus(this.status())
        return reply({ rosctr: ROSCTR.ACK_DATA, params: setupParams(session.pduSize, Math.min(amqCaller, 8) || 1) })
      }
      case FUNCTIONS.READ:
        return reply(this.readVar(session, req))
      case FUNCTIONS.WRITE:
        return reply(this.writeVar(session, req))
      case FUNCTIONS.START:
      case FUNCTIONS.STOP:
        return reply(this.control(session, req))
      default: {
        const [errorClass, errorCode] = HEADER_ERRORS.NOT_SUPPORTED
        return reply({ rosctr: ROSCTR.ACK_DATA, errorClass, errorCode, params: Buffer.from([fn]) })
      }
    }
  }

  /** Mémoire d'une zone (Buffer), ou null si elle n'existe pas. */
  area(areaCode, db) {
    const area = AREA_BY_CODE[areaCode]
    if (area === 'DB') return this.memory.dbs.get(db) ?? null
    return area ? this.memory[area] : null
  }

  /** Code d'exception forcé par un défaut actif (lecture ou écriture). */
  forcedCode(write) {
    const fault = this.faults.find(
      (f) =>
        f.type === 'exception' &&
        (!f.params?.scope || f.params.scope === 'all' || (f.params.scope === 'write') === write)
    )
    return fault ? Number(fault.params?.code) || RETURN_CODES.HARDWARE_FAULT : null
  }

  readVar(session, req) {
    const { items } = parseVarParams(req.params)
    const forced = this.forcedCode(false)
    const results = items.map((item) => {
      if (forced) return { code: forced }
      const mem = this.area(item.areaCode, item.db)
      if (!mem) return { code: RETURN_CODES.NOT_AVAILABLE }
      if (item.transport === TRANSPORT.BIT) {
        if (item.offset >= mem.length) return { code: RETURN_CODES.OUT_OF_RANGE }
        return { code: RETURN_CODES.SUCCESS, bit: true, data: Buffer.from([(mem[item.offset] >> item.bit) & 1]) }
      }
      const unit = TRANSPORT_SIZES[item.transport]
      if (!unit) return { code: RETURN_CODES.TYPE_NOT_SUPPORTED }
      const size = item.count * unit
      if (item.offset + size > mem.length) return { code: RETURN_CODES.OUT_OF_RANGE }
      return { code: RETURN_CODES.SUCCESS, data: Buffer.from(mem.subarray(item.offset, item.offset + size)) }
    })
    const data = readResponseData(results)
    if (12 + 2 + data.length > (session.pduSize ?? this.config.pduSize)) {
      const [errorClass, errorCode] = HEADER_ERRORS.PDU_TOO_LARGE
      return { rosctr: ROSCTR.ACK_DATA, errorClass, errorCode, params: Buffer.from([FUNCTIONS.READ, 0]) }
    }
    return { rosctr: ROSCTR.ACK_DATA, params: Buffer.from([FUNCTIONS.READ, items.length]), data }
  }

  writeVar(session, req) {
    const { items } = parseVarParams(req.params)
    const values = parseDataItems(req.data, items.length)
    const forced = this.forcedCode(true)
    const touched = []
    const codes = items.map((item, i) => {
      if (forced) return forced
      if (this.config.readOnly) return RETURN_CODES.ACCESS_DENIED
      const mem = this.area(item.areaCode, item.db)
      if (!mem) return RETURN_CODES.NOT_AVAILABLE
      const data = values[i]?.data ?? Buffer.alloc(0)
      if (item.transport === TRANSPORT.BIT) {
        if (item.offset >= mem.length || !data.length) return RETURN_CODES.OUT_OF_RANGE
        if (data[0] & 1) mem[item.offset] |= 1 << item.bit
        else mem[item.offset] &= ~(1 << item.bit)
        touched.push({ item, size: 1 })
        return RETURN_CODES.SUCCESS
      }
      if (item.offset + data.length > mem.length) return RETURN_CODES.OUT_OF_RANGE
      data.copy(mem, item.offset)
      touched.push({ item, size: data.length })
      return RETURN_CODES.SUCCESS
    })
    for (const { item, size } of touched) {
      const area = AREA_BY_CODE[item.areaCode]
      this.refreshPoints(area, item.db, item.offset, size)
      const text = formatAddress(
        { area, db: item.db, offset: item.offset, bit: item.bit },
        item.transport === TRANSPORT.BIT ? 'Bool' : 'Byte'
      )
      this.log('info', t('s7.log.write', { remote: session.remote, address: text, count: size }))
    }
    const refused = codes.filter((c) => c !== RETURN_CODES.SUCCESS).length
    if (refused && !forced) this.log('warn', t('s7.log.writeRefused', { remote: session.remote, count: refused }))
    return { rosctr: ROSCTR.ACK_DATA, params: Buffer.from([FUNCTIONS.WRITE, items.length]), data: Buffer.from(codes) }
  }

  /** Démarrage / arrêt de la CPU demandé par un client (services PI « P_PROGRAM »). */
  control(session, req) {
    const { fn, service } = parsePiService(req.params)
    if (service !== 'P_PROGRAM') {
      const [errorClass, errorCode] = HEADER_ERRORS.NOT_SUPPORTED
      return { rosctr: ROSCTR.ACK_DATA, errorClass, errorCode, params: Buffer.from([fn]) }
    }
    if (this.config.readOnly) {
      this.log('warn', t('s7.log.controlRefused', { remote: session.remote }))
      return { rosctr: ROSCTR.ACK_DATA, errorClass: 0xd6, errorCode: 0x02, params: Buffer.from([fn]) }
    }
    this.setCpuState(fn === FUNCTIONS.STOP ? 'stop' : 'run', session.remote)
    return { rosctr: ROSCTR.ACK_DATA, params: Buffer.from([fn]) }
  }

  // --- Listes d'état système ------------------------------------------------------------------

  userdata(req) {
    const info = parseUserdata(req.params, req.data)
    if (info.group !== 4 || info.subfunction !== 1 || info.szlId === undefined) {
      return szlResponse({ sequence: info.sequence, errorCode: SZL_UNKNOWN })
    }
    const list = this.szl(info.szlId, info.szlIndex)
    if (!list) return szlResponse({ sequence: info.sequence, errorCode: SZL_UNKNOWN })
    return szlResponse({ sequence: info.sequence, szlId: info.szlId, szlIndex: info.szlIndex, ...list })
  }

  /** Enregistrements d'une liste d'état système : { recordLength, records }, null si inconnue. */
  szl(id, index) {
    const identity = this.config.identity
    switch (id) {
      case 0x0000:
        return {
          recordLength: 2,
          records: [0x0000, 0x0011, 0x001c, 0x0424].map((n) => Buffer.from([n >> 8, n & 0xff]))
        }
      case 0x0011:
      case 0x0111: {
        // Identification du module : référence (index 1), matériel (6), firmware (7).
        const [major = 0, minor = 0, patch = 0] = String(identity.version ?? '')
          .replace(/^V/i, '')
          .split('.')
          .map((n) => Number(n) || 0)
        const record = (i, mlfb, version) => {
          const buf = Buffer.alloc(28)
          buf.writeUInt16BE(i, 0)
          fixedText(mlfb, 20).copy(buf, 2)
          buf.set(version, 24)
          return buf
        }
        const records = [
          record(1, identity.orderCode, [0, 0, 0, 1]),
          record(6, identity.orderCode, [0, 0, 0, 1]),
          record(7, '', [0x56, major, minor, patch])
        ]
        return {
          recordLength: 28,
          records: id === 0x0111 ? records.filter((r) => r.readUInt16BE(0) === index) : records
        }
      }
      case 0x001c:
      case 0x011c: {
        const fields = [
          [1, identity.plantId],
          [2, identity.moduleName],
          [3, identity.plantId],
          [4, identity.copyright],
          [5, identity.serialNumber],
          [7, identity.moduleType]
        ]
        const records = fields.map(([i, text]) => {
          const buf = Buffer.alloc(34)
          buf.writeUInt16BE(i, 0)
          fixedText(text, 32, 0).copy(buf, 2)
          return buf
        })
        return {
          recordLength: 34,
          records: id === 0x011c ? records.filter((r) => r.readUInt16BE(0) === index) : records
        }
      }
      case 0x0424: {
        // État de fonctionnement : octet 3 = 0x08 (RUN) ou 0x04 (STOP).
        const buf = Buffer.alloc(20)
        buf.set([0x51, 0x44, 0xff, this.cpuState === 'run' ? 0x08 : 0x04])
        return { recordLength: 20, records: [buf] }
      }
      default:
        return null
    }
  }

  // --- Points et mémoire --------------------------------------------------------------------

  coerce(def, raw) {
    try {
      return parseInput(raw ?? (def.dataType === 'Bool' ? false : isNumericType(def.dataType) ? 0 : ''), def.dataType)
    } catch {
      return def.dataType === 'Bool' ? false : isNumericType(def.dataType) ? 0 : ''
    }
  }

  /** Écrit la valeur d'un point dans la mémoire. */
  writePoint(entry) {
    const { address } = entry
    const mem = address.area === 'DB' ? this.memory.dbs.get(address.db) : this.memory[address.area]
    if (!mem) return
    if (address.dataType === 'Bool') {
      if (toBoolean(entry.value)) mem[address.offset] |= 1 << address.bit
      else mem[address.offset] &= ~(1 << address.bit)
    } else {
      Buffer.from(encodeValue(entry.value, address.dataType, address.length)).copy(mem, address.offset)
    }
    this.valuesDirty = true
  }

  /** Relit depuis la mémoire les points qui chevauchent une plage écrite par un client. */
  refreshPoints(area, db, offset, size) {
    for (const entry of this.points.values()) {
      const a = entry.address
      if (a.area !== area || (area === 'DB' && a.db !== db)) continue
      if (a.offset >= offset + size || offset >= a.offset + a.size) continue
      const mem = area === 'DB' ? this.memory.dbs.get(db) : this.memory[area]
      entry.value = decodeValue(mem.subarray(a.offset, a.offset + a.size), a.dataType, {
        bit: a.bit ?? 0,
        length: a.length
      })
      this.valuesDirty = true
    }
  }

  values() {
    return Object.fromEntries([...this.points].map(([id, entry]) => [id, entry.value]))
  }

  /** Ajoute ou remplace un point pendant que le serveur tourne. */
  upsertPoint(def) {
    this.requireRunning()
    const address = validatePoint(def, this.shape)
    const previous = this.points.get(def.id)
    const sameAddress = previous && previous.address.text === address.text && previous.def.dataType === def.dataType
    const entry = { def, address, value: sameAddress ? previous.value : this.coerce(def, def.initialValue) }
    this.points.set(def.id, entry)
    this.config = {
      ...this.config,
      points: previous ? this.config.points.map((p) => (p.id === def.id ? def : p)) : [...this.config.points, def]
    }
    this.writePoint(entry)
    this.onValues(this.values())
    return this.status()
  }

  removePoint(id) {
    this.requireRunning()
    this.points.delete(id)
    this.config = { ...this.config, points: this.config.points.filter((p) => p.id !== id) }
    this.onValues(this.values())
    return this.status()
  }

  setValue(id, raw) {
    this.requireRunning()
    const entry = this.points.get(id)
    if (!entry) throw new Error(t('s7.errors.unknownPoint'))
    entry.value = parseInput(raw, entry.def.dataType)
    this.writePoint(entry)
    this.onValues(this.values())
    return entry.value
  }

  setCpuState(state, by) {
    this.requireRunning()
    if (!['run', 'stop'].includes(state)) throw new Error(t('s7.errors.invalidCpuState'))
    if (state !== this.cpuState) {
      this.cpuState = state
      if (state === 'run') this.t0 = Date.now()
      this.log('info', by ? t(`s7.log.cpu.${state}By`, { remote: by }) : t(`s7.log.cpu.${state}`))
      this.onStatus(this.status())
    }
    return this.status()
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

  setReadOnly(readOnly) {
    this.requireRunning()
    this.config = { ...this.config, readOnly: !!readOnly }
    this.onStatus(this.status())
    return this.status()
  }

  /** Mémoire brute (explorateur) : `count` octets à partir de `start`. */
  readMemory(area, db, start, count) {
    this.requireRunning()
    const mem = area === 'DB' ? this.memory.dbs.get(Number(db)) : this.memory[area]
    if (!mem || !AREAS[area]) throw new Error(t('s7.errors.unknownArea', { area }))
    start = Math.max(0, Number(start) || 0)
    count = Math.min(MAX_EXPLORER_COUNT, Math.max(1, Number(count) || 1))
    return { size: mem.length, start, bytes: [...mem.subarray(start, Math.min(mem.length, start + count))] }
  }

  /** Écrit un octet de la mémoire (explorateur) et met à jour les points concernés. */
  writeMemory(area, db, offset, value) {
    this.requireRunning()
    const mem = area === 'DB' ? this.memory.dbs.get(Number(db)) : this.memory[area]
    if (!mem || !AREAS[area]) throw new Error(t('s7.errors.unknownArea', { area }))
    offset = Number(offset)
    const byte = Number(value)
    if (!Number.isInteger(offset) || offset < 0 || offset >= mem.length) throw new Error(t('s7.errors.invalidRange'))
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) throw new Error(t('s7.errors.invalidByte', { value }))
    mem[offset] = byte
    this.refreshPoints(area, Number(db), offset, 1)
    return byte
  }

  // --- Défauts injectés et simulation ---------------------------------------------------------

  fault(type, pointId) {
    return this.faults.find(
      (f) => f.type === type && (pointId === undefined || !f.points?.length || f.points.includes(pointId))
    )
  }

  setFaults(faults = []) {
    const wasCut = !!this.fault('cut')
    this.faults = faults
    if (this.server && !wasCut && this.fault('cut')) {
      for (const s of this.sessions.values()) s.socket.destroy()
      this.log('warn', t('s7.log.faultCutAll'))
    }
  }

  startSimulation() {
    clearInterval(this.simTimer)
    const dt = Number(this.config.updateRate) || 100
    this.simTimer = setInterval(() => {
      if (this.cpuState !== 'run') return
      const elapsed = Date.now() - this.t0
      for (const entry of this.points.values()) {
        const { def } = entry
        if (!def.simulation || def.simulation === 'none' || !isNumericType(def.dataType)) continue
        if (this.fault('freeze', def.id)) continue
        const variable = { ...def, min: Number(def.min), max: Number(def.max), period: Number(def.period) || 1000 }
        let v = simulate(
          {
            ...variable,
            dataType: def.dataType === 'Bool' ? 'Boolean' : integerType(def.dataType) ? 'Int32' : 'Double'
          },
          entry.value,
          elapsed,
          dt
        )
        if (def.dataType === 'Bool' && typeof v !== 'boolean') v = v >= (variable.min + variable.max) / 2
        entry.value = def.dataType === 'Bool' ? v : parseInput(v, def.dataType)
        this.writePoint(entry)
      }
    }, dt)
  }
}

const integerType = (dataType) => !['Real', 'LReal'].includes(dataType)
