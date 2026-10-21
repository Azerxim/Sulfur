import net from 'net'
import tls from 'tls'
import { randomUUID } from 'crypto'
import { DEFAULT_CLIENT_CONFIG, MAX_SERIAL_UNIT_ID, TABLES, TRANSPORTS } from '../shared/constants'
import { decodeValue, encodeValue, pointSize, toBoolean } from '../shared/codec'
import {
  DEVICE_ID_CODES,
  FUNCTIONS,
  ModbusException,
  identificationRequest,
  parseResponse,
  readRequest,
  readWriteRequest,
  writeRequest
} from './protocol'
import { createFramer, interFrameDelay, isSerialTransport } from './framing'
import { normalizeSerial, openSerialPort, serialLabel } from './serial'
import { t } from '../shared/i18n'

export const CLIENT_COMMON_NAME = 'Sulfur Modbus Client'

/** Délai d'observation après l'ouverture : un serveur qui refuse (IP, certificat, rôle) ferme aussitôt. */
const SETTLE_DELAY = 250

/** Écriture en diffusion (Unit ID 0 sur un bus série) : délai laissé aux esclaves avant la requête suivante. */
const BROADCAST_TURNAROUND = 100

const describeError = (err) =>
  err instanceof ModbusException
    ? t('modbus.exceptions.format', {
        code: err.code,
        message: t(`modbus.exceptions.${err.code}`, null, t('modbus.exceptions.unknown'))
      })
    : err.message

/**
 * Client Modbus TCP / Modbus/TCP Security, RTU over TCP, ou maître Modbus RTU / ASCII sur une
 * liaison série. En TLS, le certificat du client porte le rôle choisi ; celui du serveur est vérifié
 * par épinglage. Sans en-tête MBAP (RTU, ASCII), les requêtes partent une à une : la réponse est
 * celle de la requête en cours.
 */
export class ModbusClient {
  socket = null
  config = null
  tlsInfo = null
  framer = null
  pending = new Map()
  transactionId = 0
  /** Requêtes en attente d'envoi et requête en cours (transports sans numéro de transaction). */
  queue = []
  inFlight = null
  watches = new Map()
  /** Dernière lecture par surveillance : id -> { value, error, time } */
  last = new Map()
  pollTimer = null
  polling = false

  /** `openSerial(options)` : ouverture d'un port série (remplaçable dans les tests). */
  constructor(pki, { onStatus, onData, openSerial = openSerialPort }) {
    this.pki = pki
    this.onStatus = onStatus
    this.onData = onData
    this.openSerial = openSerial
  }

  endpoint() {
    if (!this.config || !this.socket) return null
    const { transport, host, port, serial } = this.config
    if (isSerialTransport(transport)) return `${serial.path} · ${serialLabel(serial)}`
    return `${host}:${port}`
  }

  status() {
    return {
      connected: !!this.socket,
      endpoint: this.endpoint(),
      transport: this.config?.transport ?? null,
      unitId: this.config?.unitId ?? null,
      mode: this.config?.security?.mode ?? null,
      tls: this.socket ? this.tlsInfo : null,
      pollInterval: this.config?.pollInterval ?? DEFAULT_CLIENT_CONFIG.pollInterval,
      watches: [...this.watches.values()]
    }
  }

  async connect(options) {
    if (this.socket) await this.disconnect()
    const config = {
      ...DEFAULT_CLIENT_CONFIG,
      ...options,
      security: { ...DEFAULT_CLIENT_CONFIG.security, ...options?.security }
    }
    const transport = config.transport ?? 'tcp'
    if (!TRANSPORTS.includes(transport)) throw new Error(t('modbus.errors.unknownTransport', { transport }))
    const serialLink = isSerialTransport(transport)
    const port = Number(config.port)
    const unitId = Number(config.unitId)
    if (serialLink) {
      config.serial = normalizeSerial(config.serial)
      if (!Number.isInteger(unitId) || unitId < 0 || unitId > MAX_SERIAL_UNIT_ID)
        throw new Error(t('modbus.errors.invalidSerialClientUnitId'))
    } else {
      if (!config.host?.trim()) throw new Error(t('modbus.errors.missingHost'))
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(t('modbus.errors.invalidPort'))
      if (!Number.isInteger(unitId) || unitId < 0 || unitId > 255) throw new Error(t('modbus.errors.invalidUnitId'))
    }
    if (transport !== 'tcp') config.security = { ...config.security, mode: 'tcp' }
    config.transport = transport
    config.port = port
    config.unitId = unitId
    config.timeout = Math.max(100, Number(config.timeout) || 2000)

    const secure = config.security.mode === 'tls'
    let socket
    if (serialLink) {
      socket = await this.openSerial(config.serial)
      this.tlsInfo = null
    } else {
      socket = secure ? await this.openTls(config) : await this.openTcp(config)
      // Un serveur qui refuse la connexion (IP, certificat, rôle) la ferme immédiatement.
      const closedEarly = await new Promise((resolve) => {
        const timer = setTimeout(() => {
          socket.off('close', onClose)
          resolve(false)
        }, SETTLE_DELAY)
        const onClose = () => {
          clearTimeout(timer)
          resolve(true)
        }
        socket.once('close', onClose)
      })
      if (closedEarly) {
        throw new Error(secure ? t('modbus.errors.closedTls') : t('modbus.errors.closedPlain'))
      }
    }

    const framer = createFramer(transport, 'response')
    socket.on('error', () => {})
    socket.on('data', (chunk) => {
      try {
        for (const frame of framer.reader.push(chunk)) this.onFrame(frame)
      } catch (err) {
        socket.destroy(err)
      }
    })
    socket.on('close', () => {
      if (this.socket !== socket) return
      this.cleanup(new Error(serialLink ? t('modbus.errors.serialClosed') : t('modbus.errors.closed')))
      this.onStatus({ ...this.status(), lost: true })
    })
    this.socket = socket
    this.framer = framer
    this.config = config
    this.startPolling()
    this.onStatus(this.status())
    return this.status()
  }

  openTcp(config) {
    return new Promise((resolve, reject) => {
      const socket = net.connect({ host: config.host, port: config.port })
      const timer = setTimeout(
        () => socket.destroy(new Error(t('modbus.errors.connectTimeout', { timeout: config.timeout }))),
        config.timeout
      )
      socket.once('connect', () => {
        clearTimeout(timer)
        socket.setNoDelay(true)
        socket.off('error', onError)
        socket.on('error', () => {})
        this.tlsInfo = null
        resolve(socket)
      })
      const onError = (err) => {
        clearTimeout(timer)
        reject(
          new Error(
            err.code === 'ECONNREFUSED'
              ? t('modbus.errors.connectionRefused', { host: config.host, port: config.port })
              : err.message
          )
        )
      }
      socket.once('error', onError)
    })
  }

  async openTls(config) {
    const own = await this.pki.ensureOwn({ commonName: CLIENT_COMMON_NAME, role: config.security.role?.trim() || null })
    const socket = await new Promise((resolve, reject) => {
      const s = tls.connect({
        host: config.host,
        port: config.port,
        cert: own.cert,
        key: own.key,
        minVersion: 'TLSv1.2',
        // Le certificat du serveur (auto-signé) est vérifié par épinglage juste après la négociation.
        rejectUnauthorized: false,
        servername: net.isIP(config.host) ? undefined : config.host
      })
      const timer = setTimeout(
        () => s.destroy(new Error(t('modbus.errors.connectTimeout', { timeout: config.timeout }))),
        config.timeout
      )
      s.once('secureConnect', () => {
        clearTimeout(timer)
        s.off('error', onError)
        s.on('error', () => {})
        resolve(s)
      })
      const onError = (err) => {
        clearTimeout(timer)
        reject(
          new Error(
            err.code === 'ECONNREFUSED'
              ? t('modbus.errors.connectionRefused', { host: config.host, port: config.port })
              : t('modbus.errors.tls', { message: err.message })
          )
        )
      }
      s.once('error', onError)
    })

    const peer = socket.getPeerX509Certificate()
    if (!peer) {
      socket.destroy()
      throw new Error(t('modbus.errors.noServerCert'))
    }
    const check = await this.pki.checkPeer(peer, { autoAccept: !!config.security.autoAcceptCertificates })
    if (!check.ok) {
      socket.destroy()
      throw new Error(t('modbus.errors.serverCertRefused', { name: check.info.commonName, reason: check.reason }))
    }
    socket.setNoDelay(true)
    this.tlsInfo = {
      protocol: socket.getProtocol(),
      cipher: socket.getCipher()?.name,
      role: config.security.role?.trim() || null,
      server: { commonName: check.info.commonName, thumbprint: check.info.thumbprint }
    }
    return socket
  }

  async disconnect() {
    const socket = this.socket
    this.cleanup(new Error(t('modbus.errors.disconnected')))
    if (socket) {
      if (isSerialTransport(this.config?.transport)) {
        if (socket.isOpen) await new Promise((resolve) => socket.close(() => resolve()))
      } else socket.destroy()
    }
    this.onStatus(this.status())
    return this.status()
  }

  cleanup(error) {
    clearInterval(this.pollTimer)
    this.pollTimer = null
    this.socket = null
    this.last.clear()
    for (const p of [...this.pending.values(), ...(this.inFlight ? [this.inFlight] : []), ...this.queue]) {
      clearTimeout(p.timer)
      p.reject(error)
    }
    this.pending.clear()
    this.queue = []
    this.inFlight = null
  }

  onFrame({ transactionId, unitId, pdu }) {
    if (!this.framer?.framed) {
      // Bus série : seule compte la réponse de l'esclave interrogé à la requête en cours.
      const current = this.inFlight
      if (!current || unitId !== this.config.unitId) return
      let value, error
      try {
        value = parseResponse(current.request, pdu, current.quantity)
      } catch (err) {
        error = err
      }
      return this.settle(current, value, error)
    }
    const pending = this.pending.get(transactionId)
    if (!pending) return
    this.pending.delete(transactionId)
    clearTimeout(pending.timer)
    try {
      pending.resolve(parseResponse(pending.request, pdu, pending.quantity))
    } catch (err) {
      pending.reject(err)
    }
  }

  request(pdu, quantity) {
    if (!this.socket) return Promise.reject(new Error(t('errors.notConnected')))
    if (!this.framer.framed) {
      if (this.config.unitId === 0 && !FUNCTIONS[pdu[0]]?.write)
        return Promise.reject(new Error(t('modbus.errors.broadcastRead')))
      return new Promise((resolve, reject) => {
        this.queue.push({ resolve, reject, request: pdu, quantity, timer: null })
        this.next()
      })
    }
    this.transactionId = (this.transactionId % 0xffff) + 1
    const id = this.transactionId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(t('modbus.errors.responseTimeout', { timeout: this.config.timeout })))
      }, this.config.timeout)
      this.pending.set(id, { resolve, reject, timer, request: pdu, quantity })
      this.socket.write(this.framer.encode({ transactionId: id, unitId: this.config.unitId, pdu }))
    })
  }

  /** Envoie la requête suivante de la file (transports sans numéro de transaction). */
  next() {
    if (this.inFlight || !this.queue.length || !this.socket) return
    const item = this.queue.shift()
    this.inFlight = item
    this.socket.write(this.framer.encode({ unitId: this.config.unitId, pdu: item.request }))
    if (this.config.unitId === 0) {
      // Diffusion : aucun esclave ne répond.
      item.timer = setTimeout(() => this.settle(item, null), BROADCAST_TURNAROUND)
      return
    }
    item.timer = setTimeout(() => {
      // Réponse partielle ou parasite : on repart d'un tampon vide pour la requête suivante.
      this.framer.reader.flush()
      this.settle(item, null, new Error(t('modbus.errors.responseTimeout', { timeout: this.config.timeout })))
    }, this.config.timeout)
  }

  /** Termine la requête en cours, puis envoie la suivante après le silence inter-trames. */
  settle(item, value, error) {
    if (this.inFlight !== item) return
    clearTimeout(item.timer)
    this.inFlight = null
    if (error) item.reject(error)
    else item.resolve(value)
    const gap = isSerialTransport(this.config?.transport) ? Math.ceil(interFrameDelay(this.config.serial)) : 0
    setTimeout(() => this.next(), gap)
  }

  // --- Opérations ---------------------------------------------------------------

  checkRange(table, address, quantity) {
    const info = TABLES[table]
    if (!info) throw new Error(t('modbus.errors.unknownTable', { table }))
    if (!Number.isInteger(address) || address < 0 || address > 65535) throw new Error(t('modbus.errors.invalidAddress'))
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > info.max)
      throw new Error(t('modbus.errors.invalidQuantityRange', { max: info.max }))
    if (address + quantity > 65536) throw new Error(t('modbus.errors.rangeOverflow'))
  }

  /** Lecture brute : booléens (coils / discrete inputs) ou mots 16 bits (registres). */
  async read(table, address, quantity) {
    address = Number(address)
    quantity = Number(quantity)
    this.checkRange(table, address, quantity)
    try {
      return await this.request(readRequest(table, address, quantity), quantity)
    } catch (err) {
      throw new Error(describeError(err), { cause: err })
    }
  }

  /** Écriture brute : booléens pour les coils, mots 16 bits pour les holding registers. */
  async write(table, address, values, options = {}) {
    address = Number(address)
    if (!TABLES[table]?.writable) throw new Error(t('modbus.errors.readOnlyTable'))
    if (!values.length) throw new Error(t('modbus.errors.noValues'))
    const max = table === 'coils' ? 1968 : 123
    if (values.length > max) throw new Error(t('modbus.errors.tooManyValues', { max }))
    this.checkRange(table, address, 1)
    const clean =
      table === 'coils'
        ? values.map(toBoolean)
        : values.map((v) => {
            const n = Number(v)
            if (!Number.isInteger(n) || n < 0 || n > 0xffff)
              throw new Error(t('modbus.errors.invalidRegister', { value: v }))
            return n
          })
    try {
      await this.request(writeRequest(table, address, clean, options))
    } catch (err) {
      throw new Error(describeError(err), { cause: err })
    }
    return { address, count: clean.length }
  }

  /**
   * Écrit des holding registers puis en lit d'autres en une seule requête (fonction 23).
   * Retourne les mots lus.
   */
  async readWrite(readAddress, readQuantity, writeAddress, values) {
    readAddress = Number(readAddress)
    readQuantity = Number(readQuantity)
    writeAddress = Number(writeAddress)
    this.checkRange('holdingRegisters', readAddress, readQuantity)
    if (!values.length) throw new Error(t('modbus.errors.noValues'))
    if (values.length > 121) throw new Error(t('modbus.errors.tooManyValues', { max: 121 }))
    this.checkRange('holdingRegisters', writeAddress, values.length)
    const clean = values.map((v) => {
      const n = Number(v)
      if (!Number.isInteger(n) || n < 0 || n > 0xffff) throw new Error(t('modbus.errors.invalidRegister', { value: v }))
      return n
    })
    try {
      return await this.request(readWriteRequest(readAddress, readQuantity, writeAddress, clean), readQuantity)
    } catch (err) {
      throw new Error(describeError(err), { cause: err })
    }
  }

  /**
   * Identification de l'équipement (fonction 43 / 14), en suivant les réponses découpées.
   * `code` : 1 basique, 2 régulière, 3 étendue. Retourne { conformity, objects: [{ id, value }] }.
   */
  async readDeviceIdentification(code = DEVICE_ID_CODES.REGULAR) {
    code = Number(code)
    if (![DEVICE_ID_CODES.BASIC, DEVICE_ID_CODES.REGULAR, DEVICE_ID_CODES.EXTENDED].includes(code)) {
      throw new Error(t('modbus.errors.invalidDeviceIdCode', { code }))
    }
    const objects = []
    let objectId = 0
    let conformity = null
    try {
      // Garde-fou : au plus 256 objets, donc au plus 256 réponses.
      for (let i = 0; i < 256; i++) {
        const response = await this.request(identificationRequest(code, objectId))
        conformity = response.conformity
        objects.push(...response.objects)
        if (!response.moreFollows || response.nextObjectId <= objectId) break
        objectId = response.nextObjectId
      }
    } catch (err) {
      throw new Error(describeError(err), { cause: err })
    }
    return { conformity, objects }
  }

  /** Écrit une valeur typée (Float32, Int32…) en l'encodant sur le nombre de registres nécessaire. */
  writeValue(table, address, value, dataType, wordOrder) {
    if (table === 'coils') return this.write(table, address, [toBoolean(value)])
    const words = encodeValue(value, dataType, wordOrder)
    return this.write(table, address, words, { forceMultiple: words.length > 1 })
  }

  async readValue(table, address, dataType, wordOrder) {
    if (TABLES[table].bit) return (await this.read(table, address, 1))[0]
    return decodeValue(await this.read(table, address, pointSize(dataType)), dataType, wordOrder)
  }

  // --- Surveillance périodique ----------------------------------------------------

  addWatch(item) {
    const watch = {
      id: randomUUID(),
      table: item.table,
      address: Number(item.address),
      dataType: TABLES[item.table]?.bit ? 'Boolean' : item.dataType || 'UInt16',
      wordOrder: item.wordOrder || 'ABCD',
      label: item.label || ''
    }
    this.checkRange(watch.table, watch.address, pointSize(watch.dataType))
    this.watches.set(watch.id, watch)
    this.onStatus(this.status())
    this.poll()
    return this.status()
  }

  removeWatch(id) {
    this.watches.delete(id)
    this.last.delete(id)
    this.onStatus(this.status())
    return this.status()
  }

  setPollInterval(ms) {
    const n = Number(ms)
    if (!Number.isFinite(n) || n < 50) throw new Error(t('modbus.errors.minPoll'))
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
      for (const w of [...this.watches.values()]) {
        if (!this.socket) break
        try {
          const value = await this.readValue(w.table, w.address, w.dataType, w.wordOrder)
          this.received({ id: w.id, value, error: null, time: new Date().toISOString() })
        } catch (err) {
          this.received({ id: w.id, value: null, error: err.message, time: new Date().toISOString() })
        }
      }
    } finally {
      this.polling = false
    }
  }

  received(data) {
    if (this.watches.has(data.id)) this.last.set(data.id, data)
    this.onData(data)
  }
}
