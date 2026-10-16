import dgram from 'dgram'
import net from 'net'
import { DEFAULT_CLIENT_CONFIG } from '../shared/constants'
import { t } from '../shared/i18n'
import { MODES, decodePacket, encodePacket, offsetAndDelay } from './packet'

/** Résultats conservés (interrogations périodiques). */
const MAX_HISTORY = 200

/**
 * Client NTP : interroge un serveur (une fois ou périodiquement) et calcule l'écart d'horloge et
 * le délai aller-retour. Une réponse dont le champ Origin ne reprend pas notre Transmit est ignorée.
 */
export class NtpClient {
  config = { ...DEFAULT_CLIENT_CONFIG }
  history = []
  pollTimer = null
  polling = false

  constructor({ onStatus = () => {}, onResult = () => {} } = {}) {
    this.onStatus = onStatus
    this.onResult = onResult
  }

  status() {
    return { config: this.config, polling: !!this.pollTimer, last: this.history.at(-1) ?? null }
  }

  /** Interroge le serveur : { host, port, version, timeout } (par défaut, la configuration courante). */
  query(options = {}) {
    const config = { ...this.config, ...options }
    const port = Number(config.port)
    const version = Number(config.version)
    if (!config.host?.trim()) return Promise.reject(new Error(t('ntp.errors.missingHost')))
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      return Promise.reject(new Error(t('ntp.errors.invalidPort')))
    if (![3, 4].includes(version)) return Promise.reject(new Error(t('ntp.errors.invalidVersion')))
    const timeout = Math.max(100, Number(config.timeout) || 2000)

    return new Promise((resolve, reject) => {
      const host = config.host.trim()
      const socket = dgram.createSocket(net.isIPv6(host) ? 'udp6' : 'udp4')
      const done = (err, result) => {
        clearTimeout(timer)
        socket.close()
        if (err) reject(err)
        else resolve(result)
      }
      const timer = setTimeout(() => done(new Error(t('ntp.errors.timeout', { timeout }))), timeout)
      const t1 = Date.now()
      const request = encodePacket({ version, mode: MODES.CLIENT, transmit: t1, poll: 6, precision: -20 })
      socket.on('error', (err) => done(err))
      socket.on('message', (msg) => {
        const t4 = Date.now()
        let response
        try {
          response = decodePacket(msg)
        } catch (err) {
          return done(err)
        }
        // Réponse à une autre requête (ou usurpée) : on attend la bonne.
        if (!response.rawOrigin.equals(request.subarray(40, 48))) return
        if (response.mode !== MODES.SERVER)
          return done(new Error(t('ntp.errors.unexpectedMode', { mode: response.mode })))
        const result = {
          server: `${host}:${port}`,
          at: new Date(t4).toISOString(),
          leap: response.leap,
          version: response.version,
          stratum: response.stratum,
          poll: response.poll,
          precision: response.precision,
          rootDelay: response.rootDelay,
          rootDispersion: response.rootDispersion,
          refId: response.refId,
          reference: response.reference,
          // Strate 0 : Kiss-o'-Death, le code est dans l'identifiant de référence.
          kiss: response.stratum === 0 ? response.refId : null
        }
        if (!result.kiss) {
          const { offset, delay } = offsetAndDelay(t1, response.receive, response.transmit, t4)
          Object.assign(result, { time: response.transmit, offset, delay })
        }
        done(null, result)
      })
      socket.send(request, port, host, (err) => err && done(err))
    })
  }

  async poll() {
    if (this.polling) return
    this.polling = true
    try {
      this.record(await this.query())
    } catch (err) {
      this.record({
        server: `${this.config.host}:${this.config.port}`,
        at: new Date().toISOString(),
        error: err.message
      })
    } finally {
      this.polling = false
    }
  }

  record(result) {
    this.history.push(result)
    if (this.history.length > MAX_HISTORY) this.history.splice(0, this.history.length - MAX_HISTORY)
    this.onResult(result)
    return result
  }

  /** Interrogation unique, ajoutée à l'historique. */
  async queryOnce(options = {}) {
    this.config = { ...this.config, ...options }
    try {
      return this.record(await this.query())
    } catch (err) {
      this.record({
        server: `${this.config.host}:${this.config.port}`,
        at: new Date().toISOString(),
        error: err.message
      })
      throw err
    }
  }

  /** Interroge le serveur toutes les `pollInterval` secondes. */
  startPolling(options = {}) {
    this.config = { ...this.config, ...options }
    const seconds = Number(this.config.pollInterval)
    if (!Number.isFinite(seconds) || seconds < 1) throw new Error(t('ntp.errors.minPoll'))
    clearInterval(this.pollTimer)
    this.pollTimer = setInterval(() => this.poll(), seconds * 1000)
    this.poll()
    this.onStatus(this.status())
    return this.status()
  }

  stopPolling() {
    clearInterval(this.pollTimer)
    this.pollTimer = null
    this.onStatus(this.status())
    return this.status()
  }

  clearHistory() {
    this.history = []
    return []
  }
}
