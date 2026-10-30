import dgram from 'dgram'
import net from 'net'
import { randomBytes, randomInt } from 'crypto'
import { CODES, OPTIONS, TYPES, decode, encode, isRequest, isResponse, isSuccess, optionValue } from '../shared/codec'
import { ACK_RANDOM_FACTOR, ACK_TIMEOUT, DEDUP_LIFETIME, MAX_RETRANSMIT } from '../shared/constants'

/** Erreur d'échange : `code` vaut 'timeout' (pas de réponse), 'reset' (RST reçu) ou 'closed'. */
export class CoapError extends Error {
  constructor(code) {
    super(`CoAP ${code}`)
    this.code = code
  }
}

const remoteKey = (address, port) => `${address}:${port}`

/**
 * Point d'échange CoAP sur un socket UDP (RFC 7252), commun au serveur, au client et à LwM2M :
 *  - requêtes reçues passées à `onRequest(msg, remote)`, qui retourne { code, options?, payload? }
 *    ou null (pas de réponse) ; réponse jointe à l'ACK d'une requête confirmable, ou NON ;
 *    doublons reconnus pendant DEDUP_LIFETIME et la même réponse renvoyée ;
 *  - requêtes envoyées par `request()` : retransmises jusqu'à l'ACK (confirmables), réponse jointe
 *    à l'ACK ou séparée, associée par son jeton ; observation (RFC 7641) : notifications passées à
 *    `onNotify` tant que la réponse porte l'option Observe ;
 *  - notifications envoyées par `notify()` en confirmable : un RST ou l'absence d'ACK appelle
 *    `onFail` (l'observateur est parti).
 */
export class CoapEndpoint {
  socket = null
  nextMid = randomInt(0, 65536)
  /** Requêtes en attente de réponse, par jeton (hex). */
  pending = new Map()
  /** Observations en cours, par jeton (hex). */
  observations = new Map()
  /** Messages confirmables en attente d'ACK, par identifiant de message. */
  awaitingAck = new Map()
  /** Messages reçus récemment (doublons) : `adresse:port:mid` → { buffer, expires }. */
  seen = new Map()

  constructor({ onRequest = null } = {}) {
    this.onRequest = onRequest
  }

  get bound() {
    return !!this.socket
  }

  /** Ouvre le socket ; port 0 : choisi par le système (client). Retourne l'adresse locale. */
  async bind(port = 0, host = undefined) {
    const socket = dgram.createSocket(host && net.isIPv6(host) ? 'udp6' : 'udp4')
    await new Promise((resolve, reject) => {
      socket.once('error', reject)
      socket.bind(port, host, () => {
        socket.off('error', reject)
        resolve()
      })
    })
    socket.on('error', () => {})
    socket.on('message', (buffer, rinfo) => this.receive(buffer, rinfo))
    this.socket = socket
    this.purgeTimer = setInterval(() => {
      const now = Date.now()
      for (const [key, entry] of this.seen) if (entry.expires < now) this.seen.delete(key)
    }, 10_000)
    return socket.address()
  }

  async close() {
    clearInterval(this.purgeTimer)
    for (const entry of this.awaitingAck.values()) clearTimeout(entry.timer)
    this.awaitingAck.clear()
    for (const pending of [...this.pending.values()]) pending.finish(new CoapError('closed'))
    this.observations.clear()
    this.seen.clear()
    const socket = this.socket
    this.socket = null
    if (socket) await new Promise((resolve) => socket.close(() => resolve()))
  }

  mid() {
    this.nextMid = (this.nextMid + 1) & 0xffff
    return this.nextMid
  }

  send(msg, port, address) {
    this.socket?.send(encode(msg), port, address)
  }

  /** Message confirmable retransmis jusqu'à son ACK ; `onFail('timeout' | 'reset')` sinon. */
  sendConfirmable(msg, port, address, { onAck = () => {}, onFail = () => {} } = {}) {
    const buffer = encode(msg)
    let attempts = 0
    let timeout = ACK_TIMEOUT * (1 + Math.random() * (ACK_RANDOM_FACTOR - 1))
    const entry = { onAck, onFail, timer: null }
    const transmit = () => {
      this.socket?.send(buffer, port, address)
      entry.timer = setTimeout(() => {
        if (attempts >= MAX_RETRANSMIT) {
          this.awaitingAck.delete(msg.mid)
          onFail('timeout')
          return
        }
        attempts++
        timeout *= 2
        transmit()
      }, timeout)
    }
    this.awaitingAck.set(msg.mid, entry)
    transmit()
  }

  acked(mid) {
    const entry = this.awaitingAck.get(mid)
    if (!entry) return null
    clearTimeout(entry.timer)
    this.awaitingAck.delete(mid)
    return entry
  }

  /**
   * Requête vers `address:port` : { code, options, payload, confirmable, timeout, onNotify }.
   * Retourne { msg, rtt, token } à la première réponse ; lève une CoapError sinon. Avec `onNotify`,
   * la requête porte Observe 0 (à ajouter dans `options`) et les notifications suivantes lui sont
   * passées jusqu'à `cancelObservation(token)`.
   */
  request({ address, port, code, options = [], payload, confirmable = true, timeout = 10_000, onNotify = null }) {
    if (!this.socket) return Promise.reject(new CoapError('closed'))
    const token = randomBytes(4)
    const key = token.toString('hex')
    const msg = { type: confirmable ? TYPES.CON : TYPES.NON, code, mid: this.mid(), token, options, payload }
    const started = Date.now()
    return new Promise((resolve, reject) => {
      const finish = (err, response) => {
        clearTimeout(timer)
        this.pending.delete(key)
        this.acked(msg.mid)
        if (err) {
          this.observations.delete(key)
          reject(err)
        } else resolve({ msg: response, rtt: Date.now() - started, token: key })
      }
      const timer = setTimeout(() => finish(new CoapError('timeout')), timeout)
      this.pending.set(key, { finish })
      if (onNotify) this.observations.set(key, { onNotify })
      if (confirmable) this.sendConfirmable(msg, port, address, { onFail: (reason) => finish(new CoapError(reason)) })
      else this.send(msg, port, address)
    })
  }

  /** Fin d'une observation : les notifications suivantes reçoivent un RST (RFC 7641 § 3.6). */
  cancelObservation(token) {
    this.observations.delete(String(token))
  }

  /** Notification d'un observateur (confirmable) : { address, port, token }, réponse et numéro Observe. */
  notify(observer, { code, options = [], payload }, { onFail = () => {} } = {}) {
    const msg = { type: TYPES.CON, code, mid: this.mid(), token: observer.token, options, payload }
    this.sendConfirmable(msg, observer.port, observer.address, { onFail })
  }

  receive(buffer, rinfo) {
    let msg
    try {
      msg = decode(buffer)
    } catch {
      return
    }
    if (msg.code === 0) {
      if (msg.type === TYPES.ACK || msg.type === TYPES.RST) {
        const entry = this.acked(msg.mid)
        if (msg.type === TYPES.RST) entry?.onFail('reset')
        else entry?.onAck(msg)
      } else if (msg.type === TYPES.CON) {
        // « Ping » CoAP : un message vide confirmable reçoit un RST.
        this.send({ type: TYPES.RST, code: 0, mid: msg.mid }, rinfo.port, rinfo.address)
      }
      return
    }
    if (isRequest(msg.code)) this.receiveRequest(msg, rinfo)
    else if (isResponse(msg.code)) this.receiveResponse(msg, rinfo)
  }

  /** Doublon d'un message déjà reçu (même émetteur, même identifiant). */
  duplicate(msg, rinfo) {
    if (msg.type === TYPES.ACK) return null
    const key = `${remoteKey(rinfo.address, rinfo.port)}:${msg.mid}`
    const entry = this.seen.get(key)
    if (entry) return entry
    this.seen.set(key, { buffer: null, expires: Date.now() + DEDUP_LIFETIME })
    return null
  }

  receiveRequest(msg, rinfo) {
    const duplicate = this.duplicate(msg, rinfo)
    if (duplicate) {
      if (duplicate.buffer) this.socket?.send(duplicate.buffer, rinfo.port, rinfo.address)
      return
    }
    const remote = { address: rinfo.address.replace(/^::ffff:/, ''), port: rinfo.port }
    Promise.resolve()
      .then(() => this.onRequest?.(msg, remote) ?? { code: CODES.NOT_FOUND })
      .catch(() => ({ code: CODES.INTERNAL_ERROR }))
      .then((response) => {
        if (!response || !this.socket) return
        const reply = {
          type: msg.type === TYPES.CON ? TYPES.ACK : TYPES.NON,
          code: response.code,
          mid: msg.type === TYPES.CON ? msg.mid : this.mid(),
          token: msg.token,
          options: response.options ?? [],
          payload: response.payload
        }
        const buffer = encode(reply)
        const entry = this.seen.get(`${remoteKey(rinfo.address, rinfo.port)}:${msg.mid}`)
        if (entry) entry.buffer = buffer
        this.socket.send(buffer, rinfo.port, rinfo.address)
      })
  }

  receiveResponse(msg, rinfo) {
    if (msg.type === TYPES.ACK) this.acked(msg.mid)
    const key = msg.token.toString('hex')
    const pending = this.pending.get(key)
    const observation = this.observations.get(key)
    if (!pending && !observation) {
      // Réponse ou notification inattendue (observation annulée) : refusée par un RST, sans ACK,
      // pour que l'émetteur oublie l'observateur.
      if (msg.type !== TYPES.ACK) this.send({ type: TYPES.RST, code: 0, mid: msg.mid }, rinfo.port, rinfo.address)
      return
    }
    // Réponse confirmable attendue (séparée ou notification) : acquittée, même en double.
    if (msg.type === TYPES.CON) this.send({ type: TYPES.ACK, code: 0, mid: msg.mid }, rinfo.port, rinfo.address)
    if (this.duplicate(msg, rinfo)) return
    const observing = optionValue(msg, OPTIONS.OBSERVE) !== undefined && isSuccess(msg.code)
    if (pending) {
      if (!observing) this.observations.delete(key)
      pending.finish(null, msg)
      return
    }
    if (!observing) this.observations.delete(key)
    observation.onNotify(msg)
  }
}
