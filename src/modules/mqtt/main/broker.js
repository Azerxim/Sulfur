import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import mqttPacket from 'mqtt-packet'
import { isValidFilter, isValidTopic, matchTopic } from '../shared/topics'

/** Codes de raison MQTT 5.0 utilisés par le broker. */
export const REASON = {
  success: 0,
  disconnectWithWill: 4,
  noMatchingSubscribers: 16,
  noSubscriptionExisted: 17,
  unspecified: 128,
  protocolError: 130,
  unsupportedVersion: 132,
  invalidClientId: 133,
  badCredentials: 134,
  notAuthorized: 135,
  serverShuttingDown: 139,
  badAuthMethod: 140,
  keepAliveTimeout: 141,
  sessionTakenOver: 142,
  invalidFilter: 143,
  invalidTopic: 144,
  topicAliasInvalid: 148,
  sharedNotSupported: 158
}

/** Codes de retour CONNACK de MQTT 3.1 / 3.1.1. */
const V3_RETURN = { unsupportedVersion: 1, invalidClientId: 2, badCredentials: 4, notAuthorized: 5 }

/** Propriétés d'un message transmises aux abonnés MQTT 5.0. */
const FORWARDED = ['payloadFormatIndicator', 'contentType', 'responseTopic', 'correlationData', 'userProperties']

const TOPIC_ALIAS_MAXIMUM = 10
/** Messages QoS 1 / 2 en attente au plus par session (les plus anciens sont abandonnés). */
const MAX_INFLIGHT = 1000
const NEVER_EXPIRES = 0xffffffff

/** Session d'un client : abonnements et messages QoS 1 / 2 en cours, conservés entre connexions si persistante. */
class Session {
  subscriptions = new Map()
  /** messageId -> { packet, sent, released } */
  inflight = new Map()
  /** Identifiants des messages QoS 2 reçus, en attente de PUBREL. */
  incoming = new Set()
  connection = null
  expiryTimer = null
  lastId = 0

  constructor(id) {
    this.id = id
  }

  nextMessageId() {
    for (let i = 0; i < 65535; i++) {
      this.lastId = (this.lastId % 65535) + 1
      if (!this.inflight.has(this.lastId)) return this.lastId
    }
    // Plus aucun identifiant libre : le plus ancien message est abandonné.
    const oldest = this.inflight.keys().next().value
    this.inflight.delete(oldest)
    return oldest
  }
}

/**
 * Broker MQTT 3.1, 3.1.1 et 5.0 (codec mqtt-packet) : sessions persistantes et expiration de session,
 * QoS 0 / 1 / 2, messages retenus, message de dernière volonté (avec délai en 5.0), alias de topic,
 * options d'abonnement 5.0 (no local, retain as published, retain handling, identifiant
 * d'abonnement), propriétés des messages transmises aux clients 5.0.
 *
 * Points d'accroche (facultatifs) :
 *  - preConnect(connection) : true accepte, false refuse (connexion fermée), null ne répond pas ;
 *  - authenticate(connection, username, password) : Promise<true | 'badCredentials' | 'notAuthorized'> ;
 *  - authorizePublish(connection, packet) : Promise (rejetée : publication refusée) ;
 *  - authorizeForward(packet) : false bloque la distribution aux abonnés.
 * Événements : clientReady, clientDisconnect, subscribe, unsubscribe, publish (packet, connection | null).
 */
export class MqttBroker extends EventEmitter {
  /** clientId -> connexion établie */
  connections = new Map()
  /** clientId -> Session */
  sessions = new Map()
  /** topic -> { packet, expiresAt } */
  retained = new Map()
  sockets = new Set()
  /** Dernières volontés différées (MQTT 5.0) : clientId -> timer */
  willTimers = new Map()
  closed = false

  preConnect = () => true
  authenticate = async () => true
  authorizePublish = async () => {}
  authorizeForward = () => true

  constructor({ connectTimeout = 10_000 } = {}) {
    super()
    this.connectTimeout = connectTimeout
    this.handle = this.handle.bind(this)
  }

  // --- Connexions ---------------------------------------------------------------------

  /** Prend en charge une connexion TCP ou TLS. */
  handle(socket) {
    if (this.closed) return socket.destroy()
    const connection = {
      socket,
      address: socket.remoteAddress?.replace(/^::ffff:/, '') ?? '',
      version: 4,
      id: null,
      username: '',
      session: null,
      will: null,
      aliases: new Map(),
      connected: false,
      keepaliveTimer: null
    }
    this.sockets.add(socket)
    const parser = mqttPacket.parser()
    const connectTimer = setTimeout(() => socket.destroy(), this.connectTimeout)
    parser.on('packet', (packet) => {
      if (packet.cmd === 'connect') clearTimeout(connectTimer)
      this.onPacket(connection, packet).catch(() => socket.destroy())
    })
    // Paquet mal formé : erreur de protocole, connexion fermée.
    parser.on('error', () => this.drop(connection, REASON.protocolError))
    socket.on('data', (chunk) => parser.parse(chunk))
    socket.on('error', () => {})
    socket.on('close', () => {
      clearTimeout(connectTimer)
      this.sockets.delete(socket)
      this.onClose(connection)
    })
  }

  send(connection, packet) {
    if (connection.socket.destroyed) return
    try {
      connection.socket.write(mqttPacket.generate(packet, { protocolVersion: connection.version }))
    } catch {
      connection.socket.destroy()
    }
  }

  /** Ferme une connexion, avec un DISCONNECT portant `reasonCode` pour un client 5.0. */
  drop(connection, reasonCode) {
    if (connection.connected && connection.version === 5 && reasonCode !== undefined) {
      this.send(connection, { cmd: 'disconnect', reasonCode })
    }
    connection.socket.end()
    setTimeout(() => connection.socket.destroy(), 100).unref?.()
  }

  refuse(connection, reason) {
    const v5 = connection.version === 5
    this.send(connection, {
      cmd: 'connack',
      sessionPresent: false,
      ...(v5 ? { reasonCode: REASON[reason] } : { returnCode: V3_RETURN[reason] })
    })
    connection.socket.end()
  }

  async onConnect(connection, packet) {
    if (connection.id !== null) return this.drop(connection, REASON.protocolError)
    connection.version = packet.protocolVersion
    connection.id = ''
    const v5 = packet.protocolVersion === 5

    const accepted = await this.preConnect(connection, packet)
    if (accepted === null) return // pas de réponse : le client atteint son délai
    if (!accepted) return connection.socket.destroy()

    if (v5 && packet.properties?.authenticationMethod) return this.refuse(connection, 'badAuthMethod')
    let clientId = packet.clientId ?? ''
    let assigned = false
    if (!clientId) {
      // MQTT 3.1 impose un identifiant ; 3.1.1 l'attribue pour une session propre seulement.
      if (packet.protocolVersion === 3 || (packet.protocolVersion === 4 && !packet.clean)) {
        return this.refuse(connection, 'invalidClientId')
      }
      clientId = `sulfur_${randomUUID().replaceAll('-', '').slice(0, 12)}`
      assigned = true
    }
    const auth = await this.authenticate(connection, packet.username ?? '', packet.password ?? null)
    if (auth !== true) return this.refuse(connection, auth === 'notAuthorized' ? 'notAuthorized' : 'badCredentials')
    if (connection.socket.destroyed) return

    // Reprise de session : l'ancienne connexion du même client est fermée.
    const previous = this.connections.get(clientId)
    if (previous) {
      previous.takenOver = true
      this.drop(previous, REASON.sessionTakenOver)
    }
    this.cancelWill(clientId)

    let session = this.sessions.get(clientId)
    if (session && packet.clean) {
      clearTimeout(session.expiryTimer)
      this.sessions.delete(clientId)
      session = null
    }
    const sessionPresent = !!session
    if (!session) {
      session = new Session(clientId)
      this.sessions.set(clientId, session)
    }
    clearTimeout(session.expiryTimer)
    session.version = packet.protocolVersion
    session.expiry = v5 ? (packet.properties?.sessionExpiryInterval ?? 0) : packet.clean ? 0 : NEVER_EXPIRES
    session.connection = connection

    connection.id = clientId
    connection.username = packet.username ?? ''
    connection.session = session
    connection.connected = true
    connection.keepalive = packet.keepalive ?? 0
    connection.will = packet.will ?? null
    if (previous) previous.session = null
    this.connections.set(clientId, connection)
    this.resetKeepalive(connection)

    this.send(connection, {
      cmd: 'connack',
      sessionPresent,
      ...(v5
        ? {
            reasonCode: REASON.success,
            properties: {
              topicAliasMaximum: TOPIC_ALIAS_MAXIMUM,
              sharedSubscriptionAvailable: false,
              ...(assigned ? { assignedClientIdentifier: clientId } : {})
            }
          }
        : { returnCode: 0 })
    })
    this.emit('clientReady', connection)
    // Messages en attente de la session reprise.
    for (const [messageId, entry] of session.inflight) this.sendInflight(session, messageId, entry)
  }

  resetKeepalive(connection) {
    clearTimeout(connection.keepaliveTimer)
    if (!connection.keepalive) return
    connection.keepaliveTimer = setTimeout(
      () => this.drop(connection, REASON.keepAliveTimeout),
      connection.keepalive * 1500
    )
  }

  async onPacket(connection, packet) {
    if (packet.cmd === 'connect') return this.onConnect(connection, packet)
    if (!connection.connected) return connection.socket.destroy()
    this.resetKeepalive(connection)
    const { session } = connection
    switch (packet.cmd) {
      case 'publish':
        return this.onPublish(connection, packet)
      case 'pubrel':
        session.incoming.delete(packet.messageId)
        return this.send(connection, { cmd: 'pubcomp', messageId: packet.messageId })
      case 'puback':
      case 'pubcomp':
        session.inflight.delete(packet.messageId)
        return
      case 'pubrec': {
        const entry = session.inflight.get(packet.messageId)
        if (entry) entry.released = true
        return this.send(connection, { cmd: 'pubrel', messageId: packet.messageId })
      }
      case 'subscribe':
        return this.onSubscribe(connection, packet)
      case 'unsubscribe':
        return this.onUnsubscribe(connection, packet)
      case 'pingreq':
        return this.send(connection, { cmd: 'pingresp' })
      case 'disconnect':
        connection.cleanDisconnect = !(connection.version === 5 && packet.reasonCode === REASON.disconnectWithWill)
        if (connection.version === 5 && packet.properties?.sessionExpiryInterval !== undefined) {
          session.expiry = packet.properties.sessionExpiryInterval
        }
        return connection.socket.end()
      default:
        return this.drop(connection, REASON.protocolError)
    }
  }

  onClose(connection) {
    clearTimeout(connection.keepaliveTimer)
    if (!connection.connected) return
    connection.connected = false
    // Connexion remplacée par une reprise de session : le client reste connecté.
    const current = this.connections.get(connection.id) === connection
    if (current) this.connections.delete(connection.id)
    const { session } = connection
    if (connection.will && !connection.cleanDisconnect && !this.closed) this.scheduleWill(connection)
    if (session && session.connection === connection) {
      session.connection = null
      if (!session.expiry) this.sessions.delete(session.id)
      else if (session.expiry !== NEVER_EXPIRES) {
        session.expiryTimer = setTimeout(() => {
          if (!session.connection) this.sessions.delete(session.id)
        }, session.expiry * 1000)
        session.expiryTimer.unref?.()
      }
    }
    if (current) this.emit('clientDisconnect', connection)
  }

  // --- Dernière volonté ---------------------------------------------------------------

  scheduleWill(connection) {
    const { will } = connection
    const packet = {
      topic: will.topic,
      payload: will.payload ?? Buffer.alloc(0),
      qos: will.qos ?? 0,
      retain: !!will.retain,
      properties: will.properties
    }
    const delay = connection.version === 5 ? (will.properties?.willDelayInterval ?? 0) : 0
    // La dernière volonté n'est pas envoyée avant la fin de la session (MQTT 5.0, § 3.1.3.2.2).
    const seconds = Math.min(delay, connection.session?.expiry ?? 0)
    if (!seconds) return this.route(packet, null)
    const timer = setTimeout(() => {
      this.willTimers.delete(connection.id)
      this.route(packet, null)
    }, seconds * 1000)
    timer.unref?.()
    this.willTimers.set(connection.id, timer)
  }

  cancelWill(clientId) {
    clearTimeout(this.willTimers.get(clientId))
    this.willTimers.delete(clientId)
  }

  // --- Publications -------------------------------------------------------------------

  async onPublish(connection, packet) {
    const v5 = connection.version === 5
    let topic = packet.topic
    const alias = packet.properties?.topicAlias
    if (v5 && alias !== undefined) {
      if (alias < 1 || alias > TOPIC_ALIAS_MAXIMUM) return this.drop(connection, REASON.topicAliasInvalid)
      if (topic) connection.aliases.set(alias, topic)
      else topic = connection.aliases.get(alias)
      if (!topic) return this.drop(connection, REASON.protocolError)
    }
    const ack = (reasonCode) => {
      if (packet.qos === 1)
        this.send(connection, { cmd: 'puback', messageId: packet.messageId, ...(v5 ? { reasonCode } : {}) })
      if (packet.qos === 2)
        this.send(connection, { cmd: 'pubrec', messageId: packet.messageId, ...(v5 ? { reasonCode } : {}) })
    }
    if (!isValidTopic(topic) || topic.startsWith('$')) {
      // Un client 3.1.1 ne peut pas recevoir de refus : la connexion est fermée.
      if (v5 && packet.qos > 0) return ack(REASON.invalidTopic)
      return this.drop(connection, REASON.invalidTopic)
    }
    // QoS 2 : un message déjà reçu (renvoyé avant le PUBREL) n'est distribué qu'une fois.
    if (packet.qos === 2 && connection.session.incoming.has(packet.messageId)) return ack(REASON.success)
    try {
      await this.authorizePublish(connection, { ...packet, topic })
    } catch {
      if (v5 && packet.qos > 0) return ack(REASON.notAuthorized)
      return this.drop(connection, REASON.notAuthorized)
    }
    if (packet.qos === 2) connection.session.incoming.add(packet.messageId)
    const properties = { ...packet.properties }
    delete properties.topicAlias
    delete properties.subscriptionIdentifier
    const delivered = this.route({ ...packet, topic, properties }, connection)
    ack(delivered ? REASON.success : REASON.noMatchingSubscribers)
  }

  /** Publication du broker lui-même (topics simulés). */
  publish(packet) {
    this.route({ qos: 0, retain: false, ...packet, payload: Buffer.from(packet.payload ?? '') }, null)
  }

  /** Distribue un message aux sessions abonnées ; retourne le nombre de sessions destinataires. */
  route(packet, origin) {
    const message = {
      topic: packet.topic,
      payload: Buffer.isBuffer(packet.payload) ? packet.payload : Buffer.from(packet.payload ?? ''),
      qos: packet.qos ?? 0,
      retain: !!packet.retain,
      properties: packet.properties ?? {},
      receivedAt: Date.now()
    }
    if (message.retain) {
      if (message.payload.length) {
        const expiry = message.properties.messageExpiryInterval
        this.retained.set(message.topic, { packet: message, expiresAt: expiry ? Date.now() + expiry * 1000 : null })
      } else this.retained.delete(message.topic)
    }
    this.emit('publish', message, origin)
    if (!this.authorizeForward(message)) return 0

    let count = 0
    for (const session of this.sessions.values()) {
      const matching = [...session.subscriptions.values()].filter(
        (sub) => matchTopic(sub.topic, message.topic) && !(sub.nl && origin?.id === session.id)
      )
      if (!matching.length) continue
      count++
      this.deliver(session, message, {
        qos: Math.max(...matching.map((s) => s.qos)),
        // Le drapeau « retenu » est retiré, sauf abonnement « retain as published ».
        retain: message.retain && matching.some((s) => s.rap),
        ids: matching.map((s) => s.id).filter(Boolean)
      })
    }
    return count
  }

  deliver(session, message, { qos, retain, ids = [] }) {
    if (!session.connection && !session.expiry) return
    const out = {
      cmd: 'publish',
      topic: message.topic,
      payload: message.payload,
      qos: Math.min(message.qos, qos),
      retain,
      dup: false
    }
    if (session.version === 5) {
      const properties = {}
      for (const key of FORWARDED) if (message.properties[key] !== undefined) properties[key] = message.properties[key]
      const expiry = message.properties.messageExpiryInterval
      if (expiry !== undefined) {
        const remaining = Math.ceil(expiry - (Date.now() - message.receivedAt) / 1000)
        if (remaining <= 0) return
        properties.messageExpiryInterval = remaining
      }
      if (ids.length) properties.subscriptionIdentifier = ids.length === 1 ? ids[0] : ids
      if (Object.keys(properties).length) out.properties = properties
    }
    if (out.qos === 0) {
      if (session.connection) this.send(session.connection, out)
      return
    }
    const messageId = session.nextMessageId()
    const entry = { packet: { ...out, messageId }, sent: false, released: false }
    session.inflight.set(messageId, entry)
    if (session.inflight.size > MAX_INFLIGHT) session.inflight.delete(session.inflight.keys().next().value)
    this.sendInflight(session, messageId, entry)
  }

  sendInflight(session, messageId, entry) {
    if (!session.connection) return
    if (entry.released) return this.send(session.connection, { cmd: 'pubrel', messageId })
    this.send(session.connection, { ...entry.packet, dup: entry.sent })
    entry.sent = true
  }

  // --- Abonnements --------------------------------------------------------------------

  onSubscribe(connection, packet) {
    const { session } = connection
    const v5 = connection.version === 5
    const id = v5 ? packet.properties?.subscriptionIdentifier : undefined
    const granted = []
    const accepted = []
    for (const sub of packet.subscriptions) {
      if (sub.topic.startsWith('$share/')) {
        granted.push(v5 ? REASON.sharedNotSupported : 128)
        continue
      }
      if (!isValidFilter(sub.topic)) {
        granted.push(v5 ? REASON.invalidFilter : 128)
        continue
      }
      const existed = session.subscriptions.has(sub.topic)
      const entry = { topic: sub.topic, qos: Math.min(sub.qos, 2), nl: !!sub.nl, rap: !!sub.rap, rh: sub.rh ?? 0, id }
      session.subscriptions.set(sub.topic, entry)
      granted.push(entry.qos)
      accepted.push({ entry, existed })
    }
    this.send(connection, { cmd: 'suback', messageId: packet.messageId, granted })
    if (accepted.length)
      this.emit(
        'subscribe',
        accepted.map(({ entry }) => ({ topic: entry.topic, qos: entry.qos })),
        connection
      )

    // Messages retenus : toujours (rh 0), pour un nouvel abonnement (rh 1), jamais (rh 2).
    const now = Date.now()
    for (const { entry, existed } of accepted) {
      if (entry.rh === 2 || (entry.rh === 1 && existed)) continue
      for (const [topic, { packet: message, expiresAt }] of this.retained) {
        if (expiresAt && expiresAt <= now) {
          this.retained.delete(topic)
          continue
        }
        if (matchTopic(entry.topic, topic)) {
          this.deliver(session, message, { qos: entry.qos, retain: true, ids: entry.id ? [entry.id] : [] })
        }
      }
    }
  }

  onUnsubscribe(connection, packet) {
    const { session } = connection
    const reasons = packet.unsubscriptions.map((topic) =>
      session.subscriptions.delete(topic) ? REASON.success : REASON.noSubscriptionExisted
    )
    this.send(connection, {
      cmd: 'unsuback',
      messageId: packet.messageId,
      ...(connection.version === 5 ? { granted: reasons } : {})
    })
    this.emit('unsubscribe', packet.unsubscriptions, connection)
  }

  // --- Arrêt --------------------------------------------------------------------------

  /** Ferme toutes les connexions (sans DISCONNECT : coupure franche). */
  disconnectAll() {
    for (const socket of this.sockets) socket.destroy()
  }

  close() {
    this.closed = true
    for (const timer of this.willTimers.values()) clearTimeout(timer)
    this.willTimers.clear()
    for (const connection of this.connections.values()) this.drop(connection, REASON.serverShuttingDown)
    for (const socket of this.sockets) socket.destroy()
    for (const session of this.sessions.values()) clearTimeout(session.expiryTimer)
    this.sessions.clear()
    this.connections.clear()
    this.retained.clear()
  }
}
