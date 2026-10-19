import net from 'net'
import { randomUUID } from 'crypto'
import { AREAS, CONNECTION_TYPES, DEFAULT_CLIENT_CONFIG, RETURN_CODES } from '../shared/constants'
import { resolveAddress } from '../shared/address'
import { decodeValue, encodeValue, parseInput } from '../shared/codec'
import { t } from '../shared/i18n'
import {
  COTP_TYPES,
  FrameReader,
  MAX_ITEMS,
  ROSCTR,
  TRANSPORT,
  connectRequest,
  dataFrame,
  formatTsap,
  parseCotp,
  parseDataItems,
  parseS7,
  parseSetup,
  parseSzlResponse,
  parseTsap,
  readParams,
  remoteTsap,
  s7Pdu,
  setupParams,
  splitSzl,
  startParams,
  stopParams,
  szlNextRequest,
  szlRequest,
  writeData,
  writeParams
} from './protocol'

/** Octets d'en-tête à retrancher de la taille de PDU : réponse de lecture, requête d'écriture. */
const READ_OVERHEAD = 18
const WRITE_OVERHEAD = 35

/** Message traduit d'un code de retour d'élément. */
export const describeReturnCode = (code) =>
  t('s7.returnCodes.format', {
    code: `0x${code.toString(16).toUpperCase().padStart(2, '0')}`,
    message: t(`s7.returnCodes.${code}`, null, t('s7.returnCodes.unknown'))
  })

/** Message traduit d'une erreur d'en-tête S7 (classe / code). */
function headerError(res) {
  const code = (res.errorClass << 8) | res.errorCode
  return new Error(
    t('s7.errors.header', {
      code: `0x${code.toString(16).toUpperCase().padStart(4, '0')}`,
      message: t(`s7.headerErrors.${code}`, null, t('s7.returnCodes.unknown'))
    })
  )
}

/** Texte d'un champ SZL (caractères ASCII, sans les octets nuls ni les espaces de fin). */
const szlText = (buf) => buf.toString('latin1').replace(/\0.*$/s, '').trim()

/**
 * Client S7comm (S7-300 / 400 / 1200 / 1500, ou serveur S7 de Sulfur).
 * Les S7-1200 / 1500 doivent autoriser l'accès PUT/GET, et les DB lus être à accès standard
 * (non optimisé).
 */
export class S7Client {
  socket = null
  config = null
  pduSize = 0
  ref = 0
  pending = new Map()
  /** Requêtes envoyées l'une après l'autre (les CPU ne traitent qu'un petit nombre de requêtes à la fois). */
  queue = Promise.resolve()
  watches = new Map()
  /** Dernière lecture par surveillance : id -> { value, error, time } */
  last = new Map()
  pollTimer = null
  polling = false
  identity = null
  cpuState = null

  /** `onWatches(watches)` : liste des surveillances modifiée (enregistrée par le module). */
  constructor({ onStatus = () => {}, onData = () => {}, onWatches = () => {} } = {}) {
    this.onStatus = onStatus
    this.onData = onData
    this.onWatches = onWatches
  }

  status() {
    return {
      connected: !!this.socket,
      endpoint: this.socket ? `${this.config.host}:${this.config.port}` : null,
      tsap: this.socket ? { local: formatTsap(this.config.local), remote: formatTsap(this.config.remote) } : null,
      pduSize: this.socket ? this.pduSize : null,
      identity: this.identity,
      cpuState: this.cpuState,
      pollInterval: this.config?.pollInterval ?? DEFAULT_CLIENT_CONFIG.pollInterval,
      watches: [...this.watches.values()]
    }
  }

  /** Configuration vérifiée : TSAP calculés depuis le rack et l'emplacement, ou saisis. */
  static normalize(options) {
    const config = { ...DEFAULT_CLIENT_CONFIG, ...options }
    const port = Number(config.port)
    if (!config.host?.trim()) throw new Error(t('s7.errors.missingHost'))
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(t('s7.errors.invalidPort'))
    config.host = config.host.trim()
    config.port = port
    config.timeout = Math.max(200, Number(config.timeout) || 3000)
    config.pduSize = Math.min(960, Math.max(240, Number(config.pduSize) || 960))
    if (config.addressing === 'tsap') {
      config.local = parseTsap(config.localTsap)
      config.remote = parseTsap(config.remoteTsap)
      if (!Number.isInteger(config.local) || !Number.isInteger(config.remote))
        throw new Error(t('s7.errors.invalidTsap'))
    } else {
      const rack = Number(config.rack)
      const slot = Number(config.slot)
      if (!Number.isInteger(rack) || rack < 0 || rack > 7) throw new Error(t('s7.errors.invalidRack'))
      if (!Number.isInteger(slot) || slot < 0 || slot > 31) throw new Error(t('s7.errors.invalidSlot'))
      config.local = 0x0100
      config.remote = remoteTsap(CONNECTION_TYPES[config.connectionType] ?? 1, rack, slot)
    }
    return config
  }

  async connect(options) {
    if (this.socket) await this.disconnect()
    const config = S7Client.normalize(options)
    const socket = await this.open(config)
    const reader = new FrameReader()
    const frames = []
    let waiting = null
    socket.on('data', (chunk) => {
      try {
        for (const frame of reader.push(chunk)) {
          if (this.socket === socket) this.onFrame(frame)
          else if (waiting) waiting(frame)
          else frames.push(frame)
        }
      } catch (err) {
        socket.destroy(err)
      }
    })
    const nextFrame = () =>
      new Promise((resolve, reject) => {
        if (frames.length) return resolve(frames.shift())
        const onClose = () => {
          clearTimeout(timer)
          waiting = null
          reject(new Error(t('s7.errors.closedDuringHandshake')))
        }
        const timer = setTimeout(() => {
          socket.off('close', onClose)
          waiting = null
          reject(new Error(t('s7.errors.responseTimeout', { timeout: config.timeout })))
        }, config.timeout)
        socket.once('close', onClose)
        waiting = (frame) => {
          clearTimeout(timer)
          socket.off('close', onClose)
          waiting = null
          resolve(frame)
        }
      })

    try {
      // Connexion ISO (COTP) : le TSAP distant désigne la CPU (rack / emplacement).
      socket.write(connectRequest(config.local, config.remote))
      const cc = parseCotp(await nextFrame())
      if (cc.type !== COTP_TYPES.CC) throw new Error(t('s7.errors.isoRefused', { tsap: formatTsap(config.remote) }))

      // Négociation de la taille de PDU.
      socket.write(dataFrame(s7Pdu({ rosctr: ROSCTR.JOB, ref: 0, params: setupParams(config.pduSize) })))
      const setup = parseS7(parseCotp(await nextFrame()).payload)
      if (setup.errorClass) throw headerError(setup)
      this.pduSize = parseSetup(setup.params).pduSize
    } catch (err) {
      socket.destroy()
      throw err
    }

    socket.on('close', () => {
      if (this.socket !== socket) return
      this.cleanup(new Error(t('s7.errors.closed')))
      this.onStatus({ ...this.status(), lost: true })
    })
    this.socket = socket
    this.config = config
    this.identity = null
    this.cpuState = null
    // Identification et état de la CPU : facultatifs (certaines CPU refusent la lecture des SZL).
    await this.readIdentity().catch(() => null)
    await this.readCpuState().catch(() => null)
    this.startPolling()
    this.onStatus(this.status())
    return this.status()
  }

  open(config) {
    return new Promise((resolve, reject) => {
      const socket = net.connect({ host: config.host, port: config.port })
      const timer = setTimeout(
        () => socket.destroy(new Error(t('s7.errors.connectTimeout', { timeout: config.timeout }))),
        config.timeout
      )
      socket.once('connect', () => {
        clearTimeout(timer)
        socket.setNoDelay(true)
        socket.off('error', onError)
        socket.on('error', () => {})
        resolve(socket)
      })
      const onError = (err) => {
        clearTimeout(timer)
        reject(
          new Error(
            err.code === 'ECONNREFUSED'
              ? t('s7.errors.connectionRefused', { host: config.host, port: config.port })
              : err.message
          )
        )
      }
      socket.once('error', onError)
    })
  }

  async disconnect() {
    const socket = this.socket
    this.cleanup(new Error(t('s7.errors.disconnected')))
    if (socket) socket.destroy()
    this.onStatus(this.status())
    return this.status()
  }

  cleanup(error) {
    clearInterval(this.pollTimer)
    this.pollTimer = null
    this.socket = null
    this.last.clear()
    for (const p of this.pending.values()) {
      clearTimeout(p.timer)
      p.reject(error)
    }
    this.pending.clear()
  }

  onFrame(frame) {
    const cotp = parseCotp(frame)
    if (cotp.type !== COTP_TYPES.DT) return
    const res = parseS7(cotp.payload)
    const pending = this.pending.get(res.ref)
    if (!pending) return
    this.pending.delete(res.ref)
    clearTimeout(pending.timer)
    pending.resolve(res)
  }

  /** Envoie un PDU et attend la réponse de même référence (requêtes sérialisées). */
  request(rosctr, params, data) {
    const run = () => {
      if (!this.socket) return Promise.reject(new Error(t('errors.notConnected')))
      this.ref = (this.ref % 0xffff) + 1
      const ref = this.ref
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(ref)
          reject(new Error(t('s7.errors.responseTimeout', { timeout: this.config.timeout })))
        }, this.config.timeout)
        this.pending.set(ref, { resolve, reject, timer })
        this.socket.write(dataFrame(s7Pdu({ rosctr, ref, params, data })))
      })
    }
    const result = this.queue.then(run, run)
    this.queue = result.catch(() => {})
    return result
  }

  // --- Lecture / écriture -------------------------------------------------------------

  /** Élément de requête pour une adresse résolue (voir resolveAddress). */
  static item(address) {
    const bit = address.dataType === 'Bool'
    return {
      areaCode: AREAS[address.area].code,
      db: address.db,
      offset: address.offset,
      bit: address.bit ?? 0,
      transport: bit ? TRANSPORT.BIT : TRANSPORT.BYTE,
      count: bit ? 1 : address.size
    }
  }

  /** Lecture de plusieurs éléments en une requête : [{ code, data }]. */
  async readItems(items) {
    const res = await this.request(ROSCTR.JOB, readParams(items))
    if (res.errorClass) throw headerError(res)
    return parseDataItems(res.data, res.params[1])
  }

  /** Écriture de plusieurs éléments en une requête : codes de retour. */
  async writeItems(items, values) {
    const res = await this.request(ROSCTR.JOB, writeParams(items), writeData(items, values))
    if (res.errorClass) throw headerError(res)
    return [...res.data.subarray(0, res.params[1])]
  }

  /** Lecture brute de `count` octets d'une zone, découpée selon la taille de PDU. */
  async readArea(area, db, start, count) {
    const { code } = AREAS[area] ?? {}
    start = Number(start)
    count = Number(count)
    db = Number(db) || 0
    if (!code) throw new Error(t('s7.errors.unknownArea', { area }))
    if (!Number.isInteger(start) || start < 0 || !Number.isInteger(count) || count < 1 || count > 65536)
      throw new Error(t('s7.errors.invalidRange'))
    const chunk = this.pduSize - READ_OVERHEAD
    const out = []
    for (let offset = 0; offset < count; offset += chunk) {
      const n = Math.min(chunk, count - offset)
      const [item] = await this.readItems([
        { areaCode: code, db, offset: start + offset, transport: TRANSPORT.BYTE, count: n }
      ])
      if (item.code !== RETURN_CODES.SUCCESS) throw new Error(describeReturnCode(item.code))
      out.push(...item.data)
    }
    return out
  }

  /** Écriture brute d'octets dans une zone, découpée selon la taille de PDU. */
  async writeArea(area, db, start, bytes) {
    const { code } = AREAS[area] ?? {}
    if (!code) throw new Error(t('s7.errors.unknownArea', { area }))
    const values = bytes.map((b) => {
      const n = Number(b)
      if (!Number.isInteger(n) || n < 0 || n > 255) throw new Error(t('s7.errors.invalidByte', { value: b }))
      return n
    })
    if (!values.length) throw new Error(t('s7.errors.noValues'))
    const chunk = this.pduSize - WRITE_OVERHEAD
    for (let offset = 0; offset < values.length; offset += chunk) {
      const part = values.slice(offset, offset + chunk)
      const item = {
        areaCode: code,
        db: Number(db) || 0,
        offset: Number(start) + offset,
        transport: TRANSPORT.BYTE,
        count: part.length
      }
      const [result] = await this.writeItems([item], [part])
      if (result !== RETURN_CODES.SUCCESS) throw new Error(describeReturnCode(result))
    }
    return { count: values.length }
  }

  /** Lit une valeur typée à une adresse (`DB1.DBD4`, `MW10`, `I0.1`…). */
  async readValue(text, dataType, length) {
    const [result] = await this.readValues([resolveAddress(text, dataType, length)])
    if (result.error) throw new Error(result.error)
    return result.value
  }

  /**
   * Lit plusieurs adresses résolues, regroupées en requêtes selon la taille de PDU.
   * Retourne [{ value, error }] dans l'ordre des adresses.
   */
  async readValues(addresses) {
    const results = new Array(addresses.length)
    const max = this.pduSize - READ_OVERHEAD
    let batch = []
    let size = 0
    const flush = async () => {
      if (!batch.length) return
      const current = batch
      batch = []
      size = 0
      const items = await this.readItems(current.map(({ address }) => S7Client.item(address)))
      current.forEach(({ address, index }, i) => {
        const item = items[i]
        if (!item || item.code !== RETURN_CODES.SUCCESS) {
          results[index] = { value: null, error: describeReturnCode(item?.code ?? 0) }
          return
        }
        try {
          const value =
            address.dataType === 'Bool'
              ? (item.data[0] & 1) === 1
              : decodeValue(item.data, address.dataType, { length: address.length })
          results[index] = { value, error: null }
        } catch (err) {
          results[index] = { value: null, error: err.message }
        }
      })
    }
    for (const [index, address] of addresses.entries()) {
      // Élément trop grand pour une requête groupée : lecture brute découpée.
      if (address.size + 5 > max) {
        await flush()
        try {
          const bytes = await this.readArea(address.area, address.db, address.offset, address.size)
          results[index] = { value: decodeValue(bytes, address.dataType, { length: address.length }), error: null }
        } catch (err) {
          results[index] = { value: null, error: err.message }
        }
        continue
      }
      const itemSize = 4 + address.size + (address.size % 2)
      if (batch.length >= MAX_ITEMS || size + itemSize > max || 2 + (batch.length + 1) * 12 > max) await flush()
      batch.push({ address, index })
      size += itemSize
    }
    await flush()
    return results
  }

  /** Écrit une valeur typée (convertie depuis le texte saisi si besoin). */
  async writeValue(text, dataType, value, length) {
    const address = resolveAddress(text, dataType, length)
    const parsed = parseInput(value, dataType)
    if (address.size + WRITE_OVERHEAD > this.pduSize) {
      return this.writeArea(address.area, address.db, address.offset, [
        ...encodeValue(parsed, dataType, address.length)
      ])
    }
    const bytes = encodeValue(parsed, dataType, address.length)
    const [code] = await this.writeItems([S7Client.item(address)], [bytes])
    if (code !== RETURN_CODES.SUCCESS) throw new Error(describeReturnCode(code))
    return parsed
  }

  // --- Listes d'état système, démarrage / arrêt ------------------------------------------

  /** Lecture d'une liste d'état système (SZL), en suivant les réponses découpées. */
  async readSzl(id, index = 0) {
    let { params, data } = szlRequest(id, index)
    const chunks = []
    for (let i = 0; i < 64; i++) {
      const res = await this.request(ROSCTR.USERDATA, params, data)
      const part = parseSzlResponse(res.params, res.data)
      if (part.errorCode) {
        throw new Error(t('s7.errors.szl', { id: `0x${id.toString(16).padStart(4, '0').toUpperCase()}` }))
      }
      chunks.push(part.body)
      if (part.last) break
      ;({ params, data } = szlNextRequest(part.sequence))
    }
    return splitSzl(Buffer.concat(chunks))
  }

  /** Identification de la CPU : référence (SZL 0x0011), nom, numéro de série… (SZL 0x001C). */
  async readIdentity() {
    const identity = {}
    try {
      const { records } = await this.readSzl(0x0011, 0)
      const module = records.find((r) => r.readUInt16BE(0) === 1) ?? records[0]
      if (module) identity.orderCode = szlText(module.subarray(2, 22))
      const firmware = records.find((r) => r.readUInt16BE(0) === 7)
      if (firmware) identity.version = `V${firmware[25]}.${firmware[26]}.${firmware[27]}`
    } catch {
      // liste non fournie par la CPU
    }
    const { records } = await this.readSzl(0x001c, 0)
    const fields = {
      1: 'plantId',
      2: 'moduleName',
      3: 'plantDesignation',
      4: 'copyright',
      5: 'serialNumber',
      7: 'moduleType'
    }
    for (const record of records) {
      const key = fields[record.readUInt16BE(0)]
      if (key) identity[key] = szlText(record.subarray(2, 34))
    }
    this.identity = identity
    return identity
  }

  /** État de la CPU (SZL 0x0424) : 'run', 'stop' ou 'unknown'. */
  async readCpuState() {
    const { records } = await this.readSzl(0x0424, 0)
    const state = records[0]?.[3]
    this.cpuState = state === 0x08 ? 'run' : state === 0x04 ? 'stop' : 'unknown'
    this.onStatus(this.status())
    return this.cpuState
  }

  /** Arrêt de la CPU (service PI « P_PROGRAM »). */
  async stopCpu() {
    const res = await this.request(ROSCTR.JOB, stopParams())
    if (res.errorClass) throw headerError(res)
    return this.readCpuState().catch(() => 'unknown')
  }

  /** Démarrage de la CPU : à chaud ('hot') ou à froid ('cold'). */
  async startCpu(mode = 'hot') {
    const res = await this.request(ROSCTR.JOB, startParams(mode))
    if (res.errorClass) throw headerError(res)
    return this.readCpuState().catch(() => 'unknown')
  }

  // --- Surveillance périodique ------------------------------------------------------------

  addWatch(item) {
    const address = resolveAddress(item.address, item.dataType, item.length)
    const watch = {
      id: item.id ?? randomUUID(),
      address: address.text,
      dataType: item.dataType,
      length: address.length,
      label: item.label || ''
    }
    this.watches.set(watch.id, watch)
    this.onWatches([...this.watches.values()])
    this.onStatus(this.status())
    this.poll()
    return this.status()
  }

  removeWatch(id) {
    this.watches.delete(id)
    this.last.delete(id)
    this.onWatches([...this.watches.values()])
    this.onStatus(this.status())
    return this.status()
  }

  /** Surveillances enregistrées, restaurées au démarrage (les adresses invalides sont ignorées). */
  restoreWatches(list = []) {
    for (const item of Array.isArray(list) ? list : []) {
      try {
        const address = resolveAddress(item.address, item.dataType, item.length)
        this.watches.set(item.id, { ...item, address: address.text, length: address.length })
      } catch {
        // surveillance d'une version antérieure devenue invalide
      }
    }
  }

  setPollInterval(ms) {
    const n = Number(ms)
    if (!Number.isFinite(n) || n < 50) throw new Error(t('s7.errors.minPoll'))
    this.config = { ...(this.config ?? DEFAULT_CLIENT_CONFIG), pollInterval: n }
    if (this.socket) this.startPolling()
    this.onStatus(this.status())
    return this.status()
  }

  startPolling() {
    clearInterval(this.pollTimer)
    this.pollTimer = setInterval(() => this.poll(), Math.max(50, Number(this.config.pollInterval) || 500))
  }

  async poll() {
    if (this.polling || !this.socket || !this.watches.size) return
    this.polling = true
    try {
      const watches = [...this.watches.values()]
      const time = new Date().toISOString()
      let results
      try {
        results = await this.readValues(watches.map((w) => resolveAddress(w.address, w.dataType, w.length)))
      } catch (err) {
        results = watches.map(() => ({ value: null, error: err.message }))
      }
      watches.forEach((w, i) => this.received({ id: w.id, ...results[i], time }))
    } finally {
      this.polling = false
    }
  }

  received(data) {
    if (this.watches.has(data.id)) this.last.set(data.id, data)
    this.onData(data)
  }
}
