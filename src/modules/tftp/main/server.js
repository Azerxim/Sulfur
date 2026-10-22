import dgram from 'dgram'
import fs from 'fs/promises'
import net from 'net'
import path from 'path'
import { randomUUID } from 'crypto'
import { OutsideRoot, prepareRoot, resolveInside, virtualPath } from '@azerxim/sulfur-sdk/main'
import { DEFAULT_SERVER_CONFIG, MAX_BLOCK_SIZE, MAX_LOG, MIN_BLOCK_SIZE, MODES } from '../shared/constants'
import {
  Channel,
  ERROR,
  OP,
  TftpError,
  TftpTimeout,
  decode,
  encodeAck,
  encodeError,
  encodeOack,
  fromNetascii,
  parseBlockSize,
  receiveBlocks,
  sendBlocks,
  toNetascii
} from './protocol'
import { t } from '../shared/i18n'

const STATUS_EMIT_INTERVAL = 500
/** Taille maximale d'un fichier reçu (conservé en mémoire pendant le transfert). */
export const MAX_FILE_SIZE = 256 * 1024 * 1024

/** Message d'erreur TFTP par défaut d'un code (défaut « erreur forcée »). */
const ERROR_MESSAGES = {
  [ERROR.UNDEFINED]: 'Server error',
  [ERROR.NOT_FOUND]: 'File not found',
  [ERROR.ACCESS]: 'Access violation',
  [ERROR.DISK_FULL]: 'Disk full or allocation exceeded'
}

/**
 * Serveur TFTP (RFC 1350) servant un dossier : lecture (RRQ) et, au choix, écriture (WRQ), modes
 * octet et netascii, options blksize, tsize et timeout (RFC 2347 à 2349). Chaque transfert utilise
 * son propre port (TID). Les chemins sont confinés au dossier servi.
 */
export class TftpServer {
  socket = null
  config = null
  transfers = new Map()
  logEntries = []
  counters = { reads: 0, writes: 0, errors: 0, bytesIn: 0, bytesOut: 0 }
  faults = []

  constructor(defaultRoot, { onStatus = () => {}, onLog = () => {} } = {}) {
    this.defaultRoot = defaultRoot
    this.onStatus = onStatus
    this.onLog = onLog
  }

  get running() {
    return !!this.socket
  }

  status() {
    return {
      running: this.running,
      endpoint: this.running ? `tftp://${this.config.host}:${this.config.port}` : null,
      config: this.config,
      root: this.running ? this.root : null,
      counters: { ...this.counters },
      transfers: [...this.transfers.values()].map(({ channel: _channel, ...rest }) => rest)
    }
  }

  /** Configuration vérifiée et normalisée. */
  prepare(options) {
    const config = { ...DEFAULT_SERVER_CONFIG, ...options }
    const port = Number(config.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(t('tftp.errors.invalidPort'))
    const timeout = Number(config.timeout)
    if (!(timeout > 0 && timeout <= 255)) throw new Error(t('tftp.errors.invalidTimeout'))
    const retries = Number(config.retries)
    if (!Number.isInteger(retries) || retries < 0 || retries > 50) throw new Error(t('tftp.errors.invalidRetries'))
    const maxBlockSize = Number(config.maxBlockSize)
    if (!Number.isInteger(maxBlockSize) || maxBlockSize < MIN_BLOCK_SIZE || maxBlockSize > MAX_BLOCK_SIZE)
      throw new Error(t('tftp.errors.invalidBlockSize', { min: MIN_BLOCK_SIZE, max: MAX_BLOCK_SIZE }))
    return { ...config, port, timeout, retries, maxBlockSize }
  }

  async start(options) {
    if (this.running) throw new Error(t('errors.alreadyStarted'))
    const config = this.prepare(options)
    const prepared = await prepareRoot(String(config.root ?? '').trim() || this.defaultRoot)
    if (!prepared) throw new Error(t('tftp.errors.invalidRoot', { path: config.root }))
    const host = config.host || '0.0.0.0'
    const socket = dgram.createSocket(net.isIPv6(host) ? 'udp6' : 'udp4')
    try {
      await new Promise((resolve, reject) => {
        socket.once('error', reject)
        socket.bind(config.port, host, () => {
          socket.off('error', reject)
          resolve()
        })
      })
    } catch (err) {
      socket.close()
      if (err.code === 'EACCES') throw new Error(t('tftp.errors.portPrivileged', { port: config.port }), { cause: err })
      if (err.code === 'EADDRINUSE') throw new Error(t('tftp.errors.portInUse', { port: config.port }), { cause: err })
      throw err
    }
    socket.on('error', (err) => this.log('error', '', err.message))
    socket.on('message', (msg, rinfo) => this.onRequest(msg, rinfo))
    this.socket = socket
    this.config = config
    this.root = prepared.root
    this.realRoot = prepared.realRoot
    this.counters = { reads: 0, writes: 0, errors: 0, bytesIn: 0, bytesOut: 0 }
    this.statusTimer = setInterval(() => {
      const snapshot = JSON.stringify([this.counters, [...this.transfers.values()].map((x) => x.bytes)])
      if (snapshot !== this.lastSnapshot) {
        this.lastSnapshot = snapshot
        this.onStatus(this.status())
      }
    }, STATUS_EMIT_INTERVAL)
    this.log('info', '', t('tftp.log.started', { endpoint: this.status().endpoint, root: this.root }))
    this.onStatus(this.status())
    return this.status()
  }

  async stop() {
    clearInterval(this.statusTimer)
    for (const transfer of this.transfers.values()) transfer.channel.close()
    this.transfers.clear()
    const socket = this.socket
    this.socket = null
    if (socket) {
      socket.close()
      this.log('info', '', t('tftp.log.stopped'))
    }
    this.onStatus(this.status())
    return this.status()
  }

  /** Droits d'écriture, délai, retransmissions et taille de bloc modifiés serveur démarré. */
  update(options) {
    if (!this.running) throw new Error(t('errors.notStarted'))
    this.config = this.prepare({ ...options, host: this.config.host, port: this.config.port, root: this.config.root })
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

  // --- Requêtes -------------------------------------------------------------------------------

  /** Nouvelle requête sur le port du serveur : transfert sur un port dédié. */
  async onRequest(msg, rinfo) {
    const remote = `${rinfo.address}:${rinfo.port}`
    const request = decode(msg)
    if (!request || (request.op !== OP.RRQ && request.op !== OP.WRQ)) {
      // Paquet hors transfert (ex. acquittement tardif) : ignoré.
      if (request?.op !== OP.ERROR && request?.op !== OP.ACK && request?.op !== OP.DATA)
        this.socket?.send(encodeError(ERROR.ILLEGAL, 'Illegal TFTP operation'), rinfo.port, rinfo.address)
      return
    }
    if (this.fault('noResponse')) {
      this.log('warn', remote, t('tftp.log.faultNoResponse', { file: request.filename }))
      return
    }
    const socket = dgram.createSocket(net.isIPv6(rinfo.address) ? 'udp6' : 'udp4')
    socket.on('error', () => {})
    try {
      await new Promise((resolve, reject) => {
        socket.once('error', reject)
        socket.bind(0, this.config.host || undefined, resolve)
      })
    } catch (err) {
      socket.close()
      this.log('error', remote, err.message)
      return
    }
    const channel = new Channel(socket, rinfo, {
      delay: () => Number(this.fault('delay')?.params?.ms) || 0,
      onForeign: (other) =>
        this.log('warn', remote, t('tftp.log.unknownTid', { other: `${other.address}:${other.port}` }))
    })
    const write = request.op === OP.WRQ
    const transfer = {
      id: randomUUID(),
      remote,
      file: request.filename,
      direction: write ? 'write' : 'read',
      mode: request.mode,
      bytes: 0,
      total: null,
      since: new Date().toISOString(),
      channel
    }
    this.transfers.set(transfer.id, transfer)
    this.onStatus(this.status())
    const started = Date.now()
    try {
      const result = write
        ? await this.receive(request, channel, transfer)
        : await this.send(request, channel, transfer)
      const seconds = Math.max((Date.now() - started) / 1000, 0.001)
      this.log(
        'info',
        remote,
        t(write ? 'tftp.log.received' : 'tftp.log.sent', {
          file: transfer.virtual ?? request.filename,
          bytes: transfer.bytes,
          blocks: result.blocks,
          blockSize: result.blockSize,
          rate: Math.round(transfer.bytes / 1024 / seconds),
          retransmissions: channel.retransmissions
        })
      )
    } catch (err) {
      this.counters.errors++
      this.fail(channel, remote, request, err)
    } finally {
      channel.close()
      this.transfers.delete(transfer.id)
      this.onStatus(this.status())
    }
  }

  /** Erreur d'un transfert : paquet ERROR envoyé au client (sauf erreur reçue ou délai dépassé) et journal. */
  fail(channel, remote, request, err) {
    const file = request.filename
    if (channel.closed) return undefined
    if (err instanceof TftpTimeout) return this.log('warn', remote, t('tftp.log.timeout', { file }))
    if (err.remote) return this.log('warn', remote, t('tftp.log.clientError', { file, message: err.message }))
    let code = err instanceof TftpError ? err.code : ERROR.UNDEFINED
    let message = err.message
    if (err instanceof OutsideRoot) {
      code = ERROR.ACCESS
      message = 'Access violation'
      this.log('warn', remote, t('tftp.log.outside', { file }))
    } else if (err.code === 'ENOENT') {
      code = ERROR.NOT_FOUND
      message = 'File not found'
    } else if (err.code === 'EACCES' || err.code === 'EPERM' || err.code === 'EISDIR') {
      code = ERROR.ACCESS
      message = 'Access violation'
    }
    channel.send(encodeError(code, message))
    this.log(
      'warn',
      remote,
      t('tftp.log.refused', { file, direction: request.op === OP.WRQ ? 'WRQ' : 'RRQ', code, message })
    )
  }

  /** Options acceptées de la requête (réponse OACK), et paramètres du transfert. */
  negotiate(request, size) {
    const accepted = {}
    let blockSize = 512
    let timeoutMs = this.config.timeout * 1000
    const requested = parseBlockSize(request.options.blksize)
    if (requested) {
      blockSize = Math.min(requested, this.config.maxBlockSize)
      accepted.blksize = blockSize
    }
    const timeout = Number(request.options.timeout)
    if (Number.isInteger(timeout) && timeout >= 1 && timeout <= 255) {
      accepted.timeout = timeout
      timeoutMs = timeout * 1000
    }
    if (request.options.tsize !== undefined) {
      const tsize = Number(request.options.tsize)
      if (request.op === OP.RRQ) accepted.tsize = size
      else if (Number.isInteger(tsize) && tsize >= 0) {
        if (tsize > MAX_FILE_SIZE) throw new TftpError(ERROR.DISK_FULL, 'File too large')
        accepted.tsize = tsize
      }
    }
    return { accepted, blockSize, timeoutMs }
  }

  /** Erreur forcée par le simulateur (défaut « exception »), ou contrôle du mode. */
  check(request) {
    const forced = this.fault('exception')
    if (forced) {
      const code = Number(forced.params?.code ?? ERROR.NOT_FOUND)
      throw new TftpError(code, ERROR_MESSAGES[code] ?? ERROR_MESSAGES[ERROR.UNDEFINED])
    }
    if (!MODES.includes(request.mode)) throw new TftpError(ERROR.ILLEGAL, `Unsupported mode ${request.mode}`)
  }

  /** RRQ : envoi du fichier demandé. */
  async send(request, channel, transfer) {
    this.check(request)
    const virtual = virtualPath(request.filename)
    transfer.virtual = virtual
    const { real } = await resolveInside(this.root, this.realRoot, virtual, { mustExist: true })
    const stats = await fs.stat(real)
    if (!stats.isFile()) throw new TftpError(ERROR.NOT_FOUND, 'File not found')
    let data = await fs.readFile(real)
    if (request.mode === 'netascii') data = toNetascii(data)
    transfer.total = data.length
    const { accepted, blockSize, timeoutMs } = this.negotiate(request, data.length)
    const retries = this.config.retries
    if (Object.keys(accepted).length) {
      const ack = await channel.exchange(encodeOack(accepted), (p) => p.op === OP.ACK && p.block === 0, {
        timeoutMs,
        retries
      })
      if (!ack) throw new TftpTimeout('OACK')
    }
    const { blocks } = await sendBlocks(channel, data, {
      blockSize,
      timeoutMs,
      retries,
      onProgress: (bytes) => {
        this.counters.bytesOut += bytes - transfer.bytes
        transfer.bytes = bytes
      }
    }).catch(remoteError)
    this.counters.reads++
    return { blocks, blockSize }
  }

  /** WRQ : réception d'un fichier, écrit à la fin du transfert. */
  async receive(request, channel, transfer) {
    this.check(request)
    if (!this.config.allowWrite) throw new TftpError(ERROR.ACCESS, 'Write not allowed')
    const virtual = virtualPath(request.filename)
    transfer.virtual = virtual
    if (virtual === '/') throw new TftpError(ERROR.ACCESS, 'Access violation')
    const { real } = await resolveInside(this.root, this.realRoot, virtual).catch((err) => {
      if (err.code === 'ENOENT') throw new TftpError(ERROR.ACCESS, 'Directory not found')
      throw err
    })
    const existing = await fs.stat(real).catch(() => null)
    if (existing?.isDirectory()) throw new TftpError(ERROR.ACCESS, 'Access violation')
    if (existing && !this.config.allowOverwrite) throw new TftpError(ERROR.EXISTS, 'File already exists')
    const { accepted, blockSize, timeoutMs } = this.negotiate(request)
    transfer.total = accepted.tsize ?? null
    const initial = Object.keys(accepted).length ? encodeOack(accepted) : encodeAck(0)
    channel.send(initial)
    const { blocks } = await receiveBlocks(channel, {
      blockSize,
      timeoutMs,
      retries: this.config.retries,
      initial,
      maxSize: MAX_FILE_SIZE,
      onProgress: (bytes) => {
        this.counters.bytesIn += bytes - transfer.bytes
        transfer.bytes = bytes
      },
      // Fichier écrit d'un bloc avant le dernier acquittement : un transfert interrompu ne laisse
      // pas de fichier partiel, et le client sait le fichier enregistré.
      beforeLastAck: async (data) => {
        const temporary = path.join(path.dirname(real), `.${path.basename(real)}.${process.pid}.part`)
        await fs.writeFile(temporary, request.mode === 'netascii' ? fromNetascii(data) : data)
        await fs.rename(temporary, real)
      }
    }).catch(remoteError)
    this.counters.writes++
    return { blocks, blockSize }
  }
}

/** Erreur reçue du client pendant un transfert : pas de réponse ERROR en retour. */
function remoteError(err) {
  if (err instanceof TftpError && err.message !== 'too large' && err.message !== 'aborted') err.remote = true
  if (err.message === 'too large') err.message = 'Disk full or allocation exceeded'
  throw err
}
