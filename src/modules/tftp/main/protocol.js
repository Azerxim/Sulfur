import { DEFAULT_BLOCK_SIZE, MAX_BLOCK_SIZE, MIN_BLOCK_SIZE } from '../shared/constants'

/** Codes d'opération TFTP (RFC 1350, OACK : RFC 2347). */
export const OP = { RRQ: 1, WRQ: 2, DATA: 3, ACK: 4, ERROR: 5, OACK: 6 }

/** Codes d'erreur TFTP. */
export const ERROR = {
  UNDEFINED: 0,
  NOT_FOUND: 1,
  ACCESS: 2,
  DISK_FULL: 3,
  ILLEGAL: 4,
  UNKNOWN_TID: 5,
  EXISTS: 6,
  NO_USER: 7,
  OPTIONS: 8
}

/** Erreur reçue de l'autre extrémité (paquet ERROR). */
export class TftpError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

const zeroTerminated = (strings) => Buffer.concat(strings.map((s) => Buffer.from(`${s}\0`, 'latin1')))

function header(op, size = 0) {
  const buffer = Buffer.alloc(2 + size)
  buffer.writeUInt16BE(op)
  return buffer
}

/** RRQ / WRQ : nom de fichier, mode et options ({ blksize: 1428, tsize: 0, … }). */
export function encodeRequest(op, filename, mode, options = {}) {
  const pairs = Object.entries(options).flatMap(([name, value]) => [name, String(value)])
  return Buffer.concat([header(op), zeroTerminated([filename, mode, ...pairs])])
}

export function encodeData(block, data) {
  const buffer = header(OP.DATA, 2)
  buffer.writeUInt16BE(block, 2)
  return Buffer.concat([buffer, data])
}

export function encodeAck(block) {
  const buffer = header(OP.ACK, 2)
  buffer.writeUInt16BE(block, 2)
  return buffer
}

export function encodeError(code, message) {
  const buffer = header(OP.ERROR, 2)
  buffer.writeUInt16BE(code, 2)
  return Buffer.concat([buffer, zeroTerminated([message])])
}

export function encodeOack(options) {
  return Buffer.concat([header(OP.OACK), zeroTerminated(Object.entries(options).flat().map(String))])
}

/** Chaînes terminées par un octet nul (la dernière peut ne pas l'être). */
function strings(buffer) {
  const out = []
  let start = 0
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === 0) {
      out.push(buffer.toString('latin1', start, i))
      start = i + 1
    }
  }
  if (start < buffer.length) out.push(buffer.toString('latin1', start))
  return out
}

/** Options « nom / valeur » (noms en minuscules). */
function optionPairs(list) {
  const options = {}
  for (let i = 0; i + 1 < list.length; i += 2) options[list[i].toLowerCase()] = list[i + 1]
  return options
}

/** Décode un paquet TFTP ; null s'il est invalide. */
export function decode(buffer) {
  if (buffer.length < 2) return null
  const op = buffer.readUInt16BE(0)
  switch (op) {
    case OP.RRQ:
    case OP.WRQ: {
      const [filename, mode, ...rest] = strings(buffer.subarray(2))
      if (!filename || !mode) return null
      return { op, filename, mode: mode.toLowerCase(), options: optionPairs(rest) }
    }
    case OP.DATA:
      return buffer.length < 4 ? null : { op, block: buffer.readUInt16BE(2), data: buffer.subarray(4) }
    case OP.ACK:
      return buffer.length < 4 ? null : { op, block: buffer.readUInt16BE(2) }
    case OP.ERROR:
      return buffer.length < 4
        ? null
        : { op, code: buffer.readUInt16BE(2), message: strings(buffer.subarray(4))[0] ?? '' }
    case OP.OACK:
      return { op, options: optionPairs(strings(buffer.subarray(2))) }
    default:
      return null
  }
}

/** Mode netascii (envoi) : LF → CR LF, CR → CR NUL (conversion réversible). */
export function toNetascii(data) {
  const out = []
  for (const byte of data) {
    if (byte === 0x0a) out.push(0x0d, 0x0a)
    else if (byte === 0x0d) out.push(0x0d, 0x00)
    else out.push(byte)
  }
  return Buffer.from(out)
}

/** Mode netascii (réception) : CR LF → LF, CR NUL → CR. */
export function fromNetascii(data) {
  const out = []
  for (let i = 0; i < data.length; i++) {
    if (data[i] === 0x0d && data[i + 1] === 0x0a) {
      out.push(0x0a)
      i++
    } else if (data[i] === 0x0d && data[i + 1] === 0x00) {
      out.push(0x0d)
      i++
    } else out.push(data[i])
  }
  return Buffer.from(out)
}

/** Taille de bloc demandée valide (blksize), ou null. */
export function parseBlockSize(value) {
  const size = Number(value)
  return Number.isInteger(size) && size >= MIN_BLOCK_SIZE && size <= MAX_BLOCK_SIZE ? size : null
}

const nextBlock = (block) => (block + 1) & 0xffff

/**
 * Échange de paquets avec l'autre extrémité d'un transfert (TID : adresse et port). Les paquets
 * d'un autre TID reçoivent une erreur 5 (RFC 1350) ; le premier paquet reçu fixe le port de l'autre
 * extrémité si `lockPort` (client : le serveur répond depuis un nouveau port).
 */
export class Channel {
  queue = []
  waiter = null
  closed = false
  inflight = 0
  /** Paquets retransmis après un délai d'attente dépassé. */
  retransmissions = 0

  /** `delay()` : délai (ms) avant chaque envoi (défaut simulé d'un équipement lent). */
  constructor(socket, peer, { lockPort = false, onForeign = () => {}, delay = () => 0 } = {}) {
    this.socket = socket
    this.peer = { ...peer }
    this.locked = !lockPort
    this.onForeign = onForeign
    this.delay = delay
    socket.on('message', (msg, rinfo) => this.receive(msg, rinfo))
  }

  receive(msg, rinfo) {
    if (this.closed || rinfo.address.replace(/^::ffff:/, '') !== this.peer.address.replace(/^::ffff:/, '')) return
    if (!this.locked) {
      this.peer.port = rinfo.port
      this.locked = true
    } else if (rinfo.port !== this.peer.port) {
      this.socket.send(encodeError(ERROR.UNKNOWN_TID, 'Unknown transfer ID'), rinfo.port, rinfo.address)
      this.onForeign(rinfo)
      return
    }
    const packet = decode(msg)
    if (!packet) return
    if (this.waiter) {
      const { resolve, timer } = this.waiter
      this.waiter = null
      clearTimeout(timer)
      resolve(packet)
    } else this.queue.push(packet)
  }

  /** Envoie un paquet (vers `port` tant que l'autre extrémité n'a pas répondu). */
  send(buffer, port = this.peer.port) {
    if (this.closed) return
    const target = this.locked ? this.peer.port : port
    this.inflight++
    const emit = () => this.socket.send(buffer, target, this.peer.address, () => this.settle())
    const ms = this.delay()
    if (ms > 0) setTimeout(emit, ms)
    else emit()
  }

  /** Envoi terminé : le socket est fermé après le dernier envoi en attente. */
  settle() {
    if (--this.inflight === 0 && this.closed) this.release()
  }

  /** Paquet suivant de l'autre extrémité, ou null après `timeoutMs`. */
  next(timeoutMs) {
    if (this.queue.length) return Promise.resolve(this.queue.shift())
    if (this.closed) return Promise.resolve(null)
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiter = null
        resolve(null)
      }, timeoutMs)
      this.waiter = { resolve, timer }
    })
  }

  /**
   * Envoie `buffer` et attend une réponse acceptée par `accept(packet)` (retransmis à chaque délai
   * dépassé, `retries` fois au plus). Un paquet ERROR lève TftpError ; null si le délai est épuisé.
   */
  async exchange(buffer, accept, { timeoutMs, retries, port }) {
    this.send(buffer, port)
    for (let attempt = 0; ;) {
      const packet = await this.next(timeoutMs)
      if (this.closed) throw new TftpError(ERROR.UNDEFINED, 'aborted')
      if (!packet) {
        if (++attempt > retries) return null
        this.retransmissions++
        this.send(buffer, port)
        continue
      }
      if (packet.op === OP.ERROR) throw new TftpError(packet.code, packet.message)
      if (accept(packet)) return packet
    }
  }

  /** Fin du transfert : les paquets déjà envoyés (erreur, dernier acquittement) partent avant fermeture. */
  close() {
    if (this.closed) return
    this.closed = true
    if (this.waiter) {
      clearTimeout(this.waiter.timer)
      this.waiter.resolve(null)
      this.waiter = null
    }
    if (!this.inflight) this.release()
  }

  release() {
    try {
      this.socket.close()
    } catch {
      // déjà fermé
    }
  }
}

/** Délai d'attente épuisé. */
export class TftpTimeout extends Error {}

/**
 * Envoie `data` par blocs de `blockSize` (le dernier bloc est plus court, éventuellement vide) en
 * attendant l'acquittement de chacun. Les acquittements en double sont ignorés (pas de
 * retransmission : syndrome de l'apprenti sorcier). `onProgress(bytes)` après chaque bloc.
 */
export async function sendBlocks(channel, data, { blockSize = DEFAULT_BLOCK_SIZE, timeoutMs, retries, onProgress }) {
  const count = Math.floor(data.length / blockSize) + 1
  let block = 0
  for (let i = 0; i < count; i++) {
    block = nextBlock(block)
    const chunk = data.subarray(i * blockSize, (i + 1) * blockSize)
    const expected = block
    const ack = await channel.exchange(encodeData(block, chunk), (p) => p.op === OP.ACK && p.block === expected, {
      timeoutMs,
      retries
    })
    if (!ack) throw new TftpTimeout(`block ${block}`)
    onProgress?.(Math.min((i + 1) * blockSize, data.length))
  }
  return { blocks: count }
}

/**
 * Reçoit des blocs DATA jusqu'au premier bloc plus court que `blockSize`. `initial` : paquet
 * renvoyé tant que le premier bloc n'est pas arrivé (ACK 0, OACK ou requête) ; `pending` : premier
 * paquet déjà reçu ; `beforeLastAck(data)` : appelé avant d'acquitter le dernier bloc. Lève une
 * erreur si le total dépasse `maxSize`. Retourne { data, blocks }.
 */
export async function receiveBlocks(
  channel,
  {
    blockSize = DEFAULT_BLOCK_SIZE,
    timeoutMs,
    retries,
    initial,
    initialPort,
    pending,
    maxSize = Infinity,
    onProgress,
    beforeLastAck
  }
) {
  const chunks = []
  let size = 0
  let expected = 1
  let blocks = 0
  let last = initial
  let lastPort = initialPort
  let attempts = 0
  let packet = pending ?? null
  for (;;) {
    if (!packet) {
      packet = await channel.next(timeoutMs)
      if (channel.closed) throw new TftpError(ERROR.UNDEFINED, 'aborted')
      if (!packet) {
        if (++attempts > retries) throw new TftpTimeout(`block ${expected}`)
        channel.retransmissions++
        if (last) channel.send(last, lastPort)
        continue
      }
    }
    const current = packet
    packet = null
    if (current.op === OP.ERROR) throw new TftpError(current.code, current.message)
    if (current.op !== OP.DATA) continue
    if (current.block === expected) {
      attempts = 0
      size += current.data.length
      if (size > maxSize) throw new TftpError(ERROR.DISK_FULL, 'too large')
      chunks.push(current.data)
      blocks++
      onProgress?.(size)
      const done = current.data.length < blockSize
      const data = done ? Buffer.concat(chunks) : null
      // Dernier bloc : acquitté une fois le fichier enregistré.
      if (done) await beforeLastAck?.(data)
      last = encodeAck(expected)
      lastPort = undefined
      channel.send(last)
      if (done) return { data, blocks }
      expected = nextBlock(expected)
    } else if (current.block === ((expected - 1) & 0xffff)) {
      // Bloc précédent retransmis : notre acquittement s'est perdu.
      channel.send(encodeAck(current.block))
    }
  }
}
