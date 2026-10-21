import dgram from 'dgram'
import net from 'net'
import { randomBytes, randomUUID } from 'crypto'
import {
  ACCT_ACTIONS,
  CODES,
  DEFAULT_RADIUS_CLIENT_CONFIG,
  METHODS,
  attributeName,
  formatAttribute,
  requireAttributes
} from '../../shared/radius'
import {
  ATTR,
  CODE,
  buildRequest,
  chapResponse,
  checkMessageAuthenticator,
  checkResponse,
  decodePacket,
  encodeAttribute,
  hidePassword
} from './protocol'
import { t } from '../../shared/i18n'

const MAX_HISTORY = 50

const validPort = (value) => Number.isInteger(value) && value >= 1 && value <= 65535

/**
 * Client RADIUS : Access-Request (PAP ou CHAP), Status-Server et Accounting-Request (Start,
 * Interim-Update, Stop d'une session). Chaque requête part d'un socket UDP neuf et est renvoyée à
 * l'identique sans réponse dans le délai, `retries` fois au plus. Les réponses sont vérifiées
 * (authentificateur, Message-Authenticator) avec le secret partagé.
 */
export class RadiusClient {
  history = []
  nextId = Math.floor(Math.random() * 256)
  /** Session d'accounting en cours : { sessionId, started }. */
  session = null

  normalize(options) {
    const config = { ...DEFAULT_RADIUS_CLIENT_CONFIG, ...options }
    const host = String(config.host ?? '').trim()
    const authPort = Number(config.authPort)
    const acctPort = Number(config.acctPort)
    const retries = Number(config.retries)
    if (!host) throw new Error(t('radius.errors.missingHost'))
    if (!validPort(authPort) || !validPort(acctPort)) throw new Error(t('radius.errors.invalidPort'))
    if (!config.secret) throw new Error(t('radius.errors.missingClientSecret'))
    if (!METHODS.includes(config.method)) throw new Error(t('radius.errors.invalidMethod'))
    if (!Number.isInteger(retries) || retries < 0 || retries > 10) throw new Error(t('radius.errors.invalidRetries'))
    return {
      ...config,
      host,
      authPort,
      acctPort,
      retries,
      secret: String(config.secret),
      timeout: Math.max(100, Number(config.timeout) || 3000),
      extra: requireAttributes(config.attributes)
    }
  }

  /** Attributs communs : NAS-Identifier, NAS-IP-Address et attributs saisis. */
  common(config) {
    return [
      ...(config.nasIdentifier ? [encodeAttribute({ type: ATTR.nasIdentifier, value: config.nasIdentifier })] : []),
      ...(net.isIPv4(String(config.nasIpAddress ?? ''))
        ? [encodeAttribute({ type: ATTR.nasIpAddress, value: config.nasIpAddress })]
        : []),
      ...config.extra.map(encodeAttribute)
    ]
  }

  /** Envoie une requête et attend la réponse vérifiée : { packet, attempts, duration }. */
  async exchange(config, port, build) {
    const id = (this.nextId = (this.nextId + 1) % 256)
    const { packet, authenticator } = build(id)
    const socket = dgram.createSocket(net.isIPv6(config.host) ? 'udp6' : 'udp4')
    const started = performance.now()
    try {
      return await new Promise((resolve, reject) => {
        let attempts = 0
        let timer = null
        const send = () => {
          attempts++
          socket.send(packet, port, config.host, (err) => err && reject(err))
          timer = setTimeout(() => {
            if (attempts > config.retries) {
              reject(new Error(t('radius.errors.timeout', { attempts, destination: `${config.host}:${port}` })))
            } else {
              send()
            }
          }, config.timeout)
        }
        socket.on('error', (err) => {
          clearTimeout(timer)
          reject(err.code === 'ECONNREFUSED' ? new Error(t('radius.errors.refused')) : err)
        })
        socket.on('message', (msg) => {
          let response
          try {
            response = decodePacket(msg)
          } catch {
            return
          }
          // Réponse à une autre requête : ignorée.
          if (response.id !== id) return
          clearTimeout(timer)
          if (!checkResponse(response.raw, authenticator, config.secret)) {
            return reject(new Error(t('radius.errors.badResponseAuthenticator')))
          }
          if (checkMessageAuthenticator(response.raw, config.secret, authenticator) === false) {
            return reject(new Error(t('radius.errors.badResponseMessageAuthenticator')))
          }
          resolve({ packet: response, attempts, duration: Math.round(performance.now() - started) })
        })
        send()
      })
    } finally {
      socket.close()
    }
  }

  record(kind, config, port, result, details = {}) {
    const entry = {
      id: randomUUID(),
      time: new Date().toISOString(),
      kind,
      destination: `${config.host}:${port}`,
      code: CODES[result.packet.code] ?? String(result.packet.code),
      accepted: [CODE.accessAccept, CODE.accountingResponse].includes(result.packet.code),
      attributes: result.packet.attributes.map((a) => ({
        name: attributeName(a),
        value: formatAttribute(a)
      })),
      attempts: result.attempts,
      duration: result.duration,
      ...details
    }
    this.history.unshift(entry)
    if (this.history.length > MAX_HISTORY) this.history.length = MAX_HISTORY
    return entry
  }

  /** Access-Request avec le nom et le mot de passe saisis (PAP ou CHAP). */
  async authenticate(options) {
    const config = this.normalize(options)
    const username = String(config.username ?? '').trim()
    if (!username) throw new Error(t('radius.errors.missingUser'))
    const result = await this.exchange(config, config.authPort, (id) => {
      const authenticator = randomBytes(16)
      const credentials =
        config.method === 'pap'
          ? [
              encodeAttribute({
                type: ATTR.userPassword,
                value: hidePassword(config.password ?? '', config.secret, authenticator)
              })
            ]
          : (() => {
              // Défi : l'authentificateur de la requête (pas de CHAP-Challenge, RFC 2865 § 2.2).
              const chapId = randomBytes(1)[0]
              const response = chapResponse(chapId, config.password ?? '', authenticator)
              return [
                encodeAttribute({ type: ATTR.chapPassword, value: Buffer.concat([Buffer.from([chapId]), response]) })
              ]
            })()
      const attributes = [
        encodeAttribute({ type: ATTR.userName, value: username }),
        ...credentials,
        ...this.common(config)
      ]
      return {
        authenticator,
        packet: buildRequest(CODE.accessRequest, id, attributes, config.secret, {
          authenticator,
          messageAuthenticator: config.messageAuthenticator
        })
      }
    })
    return this.record('auth', config, config.authPort, result, { user: username, method: config.method })
  }

  /** Status-Server (RFC 5997) sur le port d'authentification. */
  async statusServer(options) {
    const config = this.normalize(options)
    const result = await this.exchange(config, config.authPort, (id) => {
      const authenticator = randomBytes(16)
      const attributes = config.nasIdentifier
        ? [encodeAttribute({ type: ATTR.nasIdentifier, value: config.nasIdentifier })]
        : []
      return {
        authenticator,
        packet: buildRequest(CODE.statusServer, id, attributes, config.secret, {
          authenticator,
          messageAuthenticator: true
        })
      }
    })
    return this.record('status', config, config.authPort, result)
  }

  /**
   * Accounting-Request : Start ouvre une session (identifiant saisi ou tiré au hasard), Interim-Update
   * et Stop la poursuivent avec sa durée. Retourne l'entrée d'historique.
   */
  async accounting(options, action) {
    const config = this.normalize(options)
    const statusType = ACCT_ACTIONS[action]
    if (!statusType) throw new Error(t('radius.errors.invalidAccounting'))
    const typed = String(config.sessionId ?? '').trim()
    if (action === 'start' || !this.session || (typed && typed !== this.session.sessionId)) {
      this.session = { sessionId: typed || randomBytes(4).toString('hex').toUpperCase(), started: Date.now() }
    }
    const { sessionId, started } = this.session
    const sessionTime = Math.round((Date.now() - started) / 1000)
    const username = String(config.username ?? '').trim()
    const result = await this.exchange(config, config.acctPort, (id) => {
      const attributes = [
        ...(username ? [encodeAttribute({ type: ATTR.userName, value: username })] : []),
        encodeAttribute({ type: ATTR.acctStatusType, value: statusType }),
        encodeAttribute({ type: ATTR.acctSessionId, value: sessionId }),
        ...(action === 'start' ? [] : [encodeAttribute({ type: ATTR.acctSessionTime, value: sessionTime })]),
        ...this.common(config)
      ]
      const packet = buildRequest(CODE.accountingRequest, id, attributes, config.secret)
      return { packet, authenticator: packet.subarray(4, 20) }
    })
    if (action === 'stop') this.session = null
    return this.record('accounting', config, config.acctPort, result, {
      action,
      sessionId,
      user: username,
      sessionTime: action === 'start' ? null : sessionTime
    })
  }

  status() {
    return { session: this.session }
  }

  clear() {
    this.history = []
    return []
  }
}
