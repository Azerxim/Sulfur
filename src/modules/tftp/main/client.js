import dgram from 'dgram'
import { lookup } from 'dns/promises'
import net from 'net'
import { randomUUID } from 'crypto'
import { DEFAULT_BLOCK_SIZE, DEFAULT_CLIENT_CONFIG, MAX_HISTORY, MODES } from '../shared/constants'
import {
  Channel,
  OP,
  TftpError,
  TftpTimeout,
  encodeAck,
  encodeRequest,
  fromNetascii,
  parseBlockSize,
  receiveBlocks,
  sendBlocks,
  toNetascii
} from './protocol'
import { MAX_FILE_SIZE } from './server'
import { t } from '../shared/i18n'

const PROGRESS_INTERVAL = 200

/** Message d'une erreur de transfert. */
function describe(err) {
  if (err instanceof TftpError) return t('tftp.errors.remote', { code: err.code, message: err.message })
  if (err instanceof TftpTimeout) return t('tftp.errors.timeout')
  return err?.message ?? String(err)
}

/**
 * Client TFTP : lecture (GET) et écriture (PUT) d'un fichier, avec négociation facultative de la
 * taille de bloc, de la taille du fichier et du délai d'attente. Un seul transfert à la fois.
 */
export class TftpClient {
  history = []
  current = null

  constructor({ onProgress = () => {} } = {}) {
    this.onProgress = onProgress
  }

  /** Paramètres vérifiés du transfert. */
  async prepare(options) {
    const config = { ...DEFAULT_CLIENT_CONFIG, ...options }
    const host = String(config.host ?? '').trim()
    if (!host) throw new Error(t('tftp.errors.missingHost'))
    const port = Number(config.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(t('tftp.errors.invalidPort'))
    const remoteFile = String(config.remoteFile ?? '').trim()
    if (!remoteFile) throw new Error(t('tftp.errors.missingFile'))
    if (!MODES.includes(config.mode)) throw new Error(t('tftp.errors.invalidMode'))
    const blockSize = parseBlockSize(config.blockSize)
    if (!blockSize) throw new Error(t('tftp.errors.invalidBlockSize', { min: 8, max: 65464 }))
    const timeout = Number(config.timeout)
    if (!(timeout > 0 && timeout <= 255)) throw new Error(t('tftp.errors.invalidTimeout'))
    const retries = Number(config.retries)
    if (!Number.isInteger(retries) || retries < 0 || retries > 50) throw new Error(t('tftp.errors.invalidRetries'))
    // Adresse résolue : les réponses du serveur sont filtrées par adresse.
    const address = net.isIP(host)
      ? host
      : await lookup(host)
          .then((r) => r.address)
          .catch(() => {
            throw new Error(t('tftp.errors.unknownHost', { host }))
          })
    // Options demandées au serveur (le délai d'attente reste local) : 512 octets, sans tsize, se passe
    // de négociation (RFC 1350 strict).
    const requested = {}
    if (blockSize !== DEFAULT_BLOCK_SIZE) requested.blksize = blockSize
    return {
      ...config,
      host,
      address,
      port,
      remoteFile,
      blockSize,
      timeoutMs: timeout * 1000,
      retries,
      options: requested
    }
  }

  async open(address) {
    const socket = dgram.createSocket(net.isIPv6(address) ? 'udp6' : 'udp4')
    socket.on('error', () => {})
    await new Promise((resolve) => socket.bind(0, resolve))
    return socket
  }

  /** Transfert exécuté avec suivi de progression ; l'entrée d'historique est retournée. */
  async run(direction, config, body) {
    if (this.current) throw new Error(t('tftp.errors.busy'))
    const entry = {
      id: randomUUID(),
      time: new Date().toISOString(),
      direction,
      server: `${config.host}:${config.port}`,
      remoteFile: config.remoteFile,
      mode: config.mode,
      bytes: 0,
      total: null
    }
    const socket = await this.open(config.address)
    const channel = new Channel(socket, { address: config.address, port: config.port }, { lockPort: true })
    this.current = { entry, channel }
    let lastEmit = 0
    const progress = (bytes, force = false) => {
      entry.bytes = bytes
      if (force || Date.now() - lastEmit >= PROGRESS_INTERVAL) {
        lastEmit = Date.now()
        this.onProgress({ ...entry })
      }
    }
    const started = Date.now()
    try {
      const result = await body(channel, entry, progress)
      Object.assign(entry, result, { ok: true })
    } catch (err) {
      Object.assign(entry, { ok: false, error: describe(err) })
    } finally {
      channel.close()
      this.current = null
    }
    entry.duration = Date.now() - started
    entry.retransmissions = channel.retransmissions
    progress(entry.bytes, true)
    this.history.unshift(entry)
    this.history.splice(MAX_HISTORY)
    return entry
  }

  /**
   * Lecture d'un fichier distant (RRQ). Retourne { entry, data } ; `data` est null si le transfert a
   * échoué (`entry.error`).
   */
  async get(options) {
    const config = await this.prepare(options)
    let data = null
    const entry = await this.run('get', config, async (channel, entry, progress) => {
      const requestOptions = { ...config.options }
      if (config.tsize) requestOptions.tsize = 0
      const request = encodeRequest(OP.RRQ, config.remoteFile, config.mode, requestOptions)
      const first = await channel.exchange(request, (p) => p.op === OP.OACK || (p.op === OP.DATA && p.block === 1), {
        timeoutMs: config.timeoutMs,
        retries: config.retries,
        port: config.port
      })
      if (!first) throw new TftpTimeout('request')
      const negotiated = acceptedOptions(first, requestOptions)
      if (negotiated.tsize !== undefined) entry.total = negotiated.tsize
      const blockSize = negotiated.blksize ?? DEFAULT_BLOCK_SIZE
      let initial = null
      if (first.op === OP.OACK) {
        initial = encodeAck(0)
        channel.send(initial)
      }
      const result = await receiveBlocks(channel, {
        blockSize,
        timeoutMs: (negotiated.timeout ?? 0) * 1000 || config.timeoutMs,
        retries: config.retries,
        initial,
        pending: first.op === OP.DATA ? first : null,
        maxSize: MAX_FILE_SIZE,
        onProgress: progress
      })
      data = config.mode === 'netascii' ? fromNetascii(result.data) : result.data
      return { blocks: result.blocks, blockSize, options: negotiated, size: data.length }
    })
    return { entry, data: entry.ok ? data : null }
  }

  /** Écriture d'un fichier distant (WRQ) à partir de `data` (Buffer). Retourne l'entrée d'historique. */
  async put(options, content) {
    const config = await this.prepare(options)
    const data = config.mode === 'netascii' ? toNetascii(Buffer.from(content)) : Buffer.from(content)
    return this.run('put', config, async (channel, entry, progress) => {
      entry.total = data.length
      const requestOptions = { ...config.options }
      if (config.tsize) requestOptions.tsize = data.length
      const request = encodeRequest(OP.WRQ, config.remoteFile, config.mode, requestOptions)
      const first = await channel.exchange(request, (p) => p.op === OP.OACK || (p.op === OP.ACK && p.block === 0), {
        timeoutMs: config.timeoutMs,
        retries: config.retries,
        port: config.port
      })
      if (!first) throw new TftpTimeout('request')
      const negotiated = acceptedOptions(first, requestOptions)
      const blockSize = negotiated.blksize ?? DEFAULT_BLOCK_SIZE
      const result = await sendBlocks(channel, data, {
        blockSize,
        timeoutMs: (negotiated.timeout ?? 0) * 1000 || config.timeoutMs,
        retries: config.retries,
        onProgress: progress
      })
      return { blocks: result.blocks, blockSize, options: negotiated, size: data.length }
    })
  }

  /** Abandon du transfert en cours. */
  abort() {
    this.current?.channel.close()
  }

  clear() {
    this.history = []
    return []
  }
}

/**
 * Options retenues par le serveur (OACK) ; aucune si le serveur a répondu directement. Une option
 * non demandée, ou une taille de bloc supérieure à celle demandée, est refusée (RFC 2347).
 */
function acceptedOptions(first, requested) {
  if (first.op !== OP.OACK) return {}
  const out = {}
  for (const [name, value] of Object.entries(first.options)) {
    if (!(name in requested)) throw new Error(t('tftp.errors.unexpectedOption', { name }))
    const number = Number(value)
    if (name === 'blksize' && !(number >= 8 && number <= requested.blksize))
      throw new Error(t('tftp.errors.badOption', { name, value }))
    out[name] = Number.isFinite(number) ? number : value
  }
  return out
}
