import { BREAK_DURATION, DEFAULT_RX_CONFIG, FRAMINGS, MAX_FRAME, MAX_LOG, MIN_REPEAT } from '../shared/constants'
import { encodePayload, escapedText, toHex } from '../shared/codec'
import { t } from '../shared/i18n'
import { normalizePort, openSerialPort, portLabel } from './serial'

/** Période de lecture des lignes d'entrée CTS / DSR / DCD (ms). */
const SIGNALS_PERIOD = 250

/** Regroupement des entrées du journal envoyées à l'interface (ms). */
const EMIT_PERIOD = 100

const LF = 0x0a

const promisify = (fn) => new Promise((resolve, reject) => fn((err, value) => (err ? reject(err) : resolve(value))))

/** Réglages de découpage des trames reçues validés : { framing, gap }. */
export function normalizeRx(options) {
  const rx = { ...DEFAULT_RX_CONFIG, ...options }
  const gap = Number(rx.gap)
  if (!FRAMINGS.includes(rx.framing)) throw new Error(t('serial.errors.invalidFraming'))
  if (!Number.isInteger(gap) || gap < 1 || gap > 10_000) throw new Error(t('serial.errors.invalidGap'))
  return { framing: rx.framing, gap }
}

/**
 * Terminal sur un port série : ouverture, journal des trames reçues (RX) et envoyées (TX), envois
 * ponctuels ou répétés, lignes de contrôle (DTR / RTS en sortie, CTS / DSR / DCD en entrée) et BREAK.
 *
 * Entrées du journal : { id, time, dir: 'rx' | 'tx' | 'event', hex, source?, level?, text? } — `hex`
 * en notation compacte (« 01030a »), `source` : origine d'un envoi (passerelle, point de données…).
 *
 * Les octets reçus sont regroupés en trames : une trame se termine après un silence de `rx.gap` ms
 * (et à chaque LF en découpage `newline`), ou quand elle atteint MAX_FRAME octets. Les abonnés de
 * `onReceive` (passerelle TCP) reçoivent les octets bruts, sans attendre la fin de la trame.
 */
export class SerialTerminal {
  port = null
  config = null
  rx = { ...DEFAULT_RX_CONFIG }
  /** Lignes de sortie demandées. */
  outputs = { dtr: true, rts: true }
  /** Lignes d'entrée lues sur le port (null : port fermé ou lecture non prise en charge). */
  signals = null
  counters = { rxBytes: 0, txBytes: 0, rxFrames: 0, txFrames: 0 }
  lastReceived = null
  log = []
  repeat = null
  nextId = 1
  pending = []
  pendingLength = 0
  pendingTimer = null
  outbox = []
  emitTimer = null
  signalsTimer = null
  receivers = new Set()
  closeListeners = new Set()

  /** `openSerial(options)` : ouverture d'un port série (remplaçable dans les tests). */
  constructor({ onStatus = () => {}, onLog = () => {}, openSerial = openSerialPort } = {}) {
    this.onStatus = onStatus
    this.onLog = onLog
    this.openSerial = openSerial
  }

  get isOpen() {
    return !!this.port
  }

  /** Octets reçus, au fil de l'eau : fn(Buffer). Retourne la fonction de désabonnement. */
  onReceive(fn) {
    this.receivers.add(fn)
    return () => this.receivers.delete(fn)
  }

  /** Fermeture du port (demandée ou non). */
  onClose(fn) {
    this.closeListeners.add(fn)
    return () => this.closeListeners.delete(fn)
  }

  status() {
    return {
      open: this.isOpen,
      config: this.config,
      label: this.config ? portLabel(this.config) : null,
      rx: this.rx,
      outputs: this.outputs,
      signals: this.signals,
      counters: { ...this.counters },
      repeating: this.repeat ? { interval: this.repeat.interval, bytes: this.repeat.data.length } : null
    }
  }

  emitStatus() {
    this.onStatus(this.status())
  }

  async open(config, rx = this.rx) {
    if (this.port) throw new Error(t('serial.errors.alreadyOpen'))
    const settings = normalizePort(config)
    this.rx = normalizeRx(rx)
    const port = await this.openSerial(settings)
    this.port = port
    this.config = settings
    this.outputs = { dtr: settings.dtr, rts: settings.rts }
    this.counters = { rxBytes: 0, txBytes: 0, rxFrames: 0, txFrames: 0 }
    this.lastReceived = null
    port.on('data', (chunk) => this.receive(chunk))
    port.on('error', (err) => this.event('error', t('serial.log.error', { message: err.message })))
    port.on('close', () => {
      // Port retiré (adaptateur USB débranché) : le terminal se ferme.
      if (this.port !== port) return
      this.event('error', t('serial.log.lost', { path: settings.path }))
      this.closed()
    })
    this.event('info', t('serial.log.opened', { path: settings.path, label: portLabel(settings) }))
    await this.applyOutputs()
    this.startSignals()
    this.emitStatus()
    return this.status()
  }

  async close() {
    const port = this.port
    if (!port) return this.status()
    this.closed()
    if (port.isOpen !== false) await new Promise((resolve) => port.close(() => resolve()))
    this.event('info', t('serial.log.closed', { path: this.config.path }))
    return this.status()
  }

  /** Port fermé : trame en cours enregistrée, envoi répété et lecture des lignes arrêtés. */
  closed() {
    this.flushRx()
    this.stopRepeat({ silent: true })
    clearInterval(this.signalsTimer)
    this.signalsTimer = null
    this.port = null
    this.signals = null
    for (const fn of this.closeListeners) fn()
    this.emitStatus()
  }

  receive(chunk) {
    const bytes = Buffer.from(chunk)
    this.counters.rxBytes += bytes.length
    for (const fn of this.receivers) fn(bytes)
    let rest = bytes
    while (rest.length) {
      const lf = this.rx.framing === 'newline' ? rest.indexOf(LF) : -1
      const room = MAX_FRAME - this.pendingLength
      const end = lf >= 0 && lf < room ? lf + 1 : Math.min(rest.length, room)
      this.pending.push(rest.subarray(0, end))
      this.pendingLength += end
      rest = rest.subarray(end)
      if (this.pendingLength >= MAX_FRAME || (lf >= 0 && end === lf + 1)) this.flushRx()
    }
    clearTimeout(this.pendingTimer)
    this.pendingTimer = this.pendingLength ? setTimeout(() => this.flushRx(), this.rx.gap) : null
  }

  /** Enregistre la trame reçue en cours. */
  flushRx() {
    clearTimeout(this.pendingTimer)
    this.pendingTimer = null
    if (!this.pendingLength) return
    const data = Buffer.concat(this.pending)
    this.pending = []
    this.pendingLength = 0
    this.counters.rxFrames++
    this.lastReceived = data
    this.append({ dir: 'rx', hex: data.toString('hex') })
  }

  /** Envoie des octets sur le port ; `source` : origine affichée dans le journal. */
  async write(bytes, source = null) {
    const port = this.port
    if (!port) throw new Error(t('serial.errors.notOpen'))
    const data = Buffer.from(bytes)
    // Trame reçue avant cet envoi : enregistrée avant lui, pour garder l'ordre des échanges.
    this.flushRx()
    await new Promise((resolve, reject) => port.write(data, (err) => (err ? reject(err) : resolve())))
    this.counters.txBytes += data.length
    this.counters.txFrames++
    this.append({ dir: 'tx', hex: data.toString('hex'), ...(source ? { source } : {}) })
    return data.length
  }

  /** Envoi d'une saisie : { mode: 'text' | 'hex', text, lineEnding }. Retourne le nombre d'octets. */
  send(payload, source = null) {
    return this.write(encodePayload(payload), source)
  }

  /** Envoie la saisie tout de suite, puis toutes les `interval` ms jusqu'à `stopRepeat`. */
  async startRepeat(payload, interval) {
    const period = Number(interval)
    if (!Number.isFinite(period) || period < MIN_REPEAT)
      throw new Error(t('serial.errors.minInterval', { min: MIN_REPEAT }))
    const data = encodePayload(payload)
    if (!this.port) throw new Error(t('serial.errors.notOpen'))
    this.stopRepeat({ silent: true })
    await this.write(data)
    const timer = setInterval(() => {
      this.write(data).catch((err) => {
        this.event('error', t('serial.log.repeatError', { message: err.message }))
        this.stopRepeat()
      })
    }, period)
    this.repeat = { timer, interval: period, data }
    this.emitStatus()
    return this.status()
  }

  stopRepeat({ silent = false } = {}) {
    if (!this.repeat) return this.status()
    clearInterval(this.repeat.timer)
    this.repeat = null
    if (!silent) this.emitStatus()
    return this.status()
  }

  /** Lignes de sortie DTR / RTS ({ dtr?, rts? }), appliquées aussitôt. */
  async setOutputs(outputs) {
    if (!this.port) throw new Error(t('serial.errors.notOpen'))
    this.outputs = {
      dtr: outputs?.dtr === undefined ? this.outputs.dtr : !!outputs.dtr,
      rts: outputs?.rts === undefined ? this.outputs.rts : !!outputs.rts
    }
    await this.applyOutputs()
    this.emitStatus()
    return this.status()
  }

  /**
   * `set` de `serialport` remet à leur valeur par défaut les lignes non précisées : DTR, RTS et
   * BREAK sont donc toujours envoyés ensemble.
   */
  async applyOutputs(brk = false) {
    const port = this.port
    if (!port?.set) return
    try {
      await promisify((cb) => port.set({ ...this.outputs, brk }, cb))
    } catch (err) {
      this.event('error', t('serial.log.outputsError', { message: err.message }))
      if (brk) throw err
    }
  }

  /** Envoie un BREAK (ligne TX maintenue à l'état bas pendant `duration` ms). */
  async sendBreak(duration = BREAK_DURATION) {
    if (!this.port) throw new Error(t('serial.errors.notOpen'))
    this.flushRx()
    await this.applyOutputs(true)
    await new Promise((resolve) => setTimeout(resolve, duration))
    await this.applyOutputs(false)
    this.event('info', t('serial.log.break', { duration }))
    return this.status()
  }

  /** Lecture périodique de CTS / DSR / DCD ; arrêtée si le port ne la prend pas en charge. */
  startSignals() {
    const port = this.port
    if (!port?.get) return
    const read = () =>
      port.get((err, status) => {
        if (this.port !== port) return
        if (err || !status) {
          clearInterval(this.signalsTimer)
          this.signalsTimer = null
          if (this.signals) {
            this.signals = null
            this.emitStatus()
          }
          return
        }
        const next = { cts: !!status.cts, dsr: !!status.dsr, dcd: !!status.dcd }
        const changed = !this.signals || Object.keys(next).some((k) => next[k] !== this.signals[k])
        this.signals = next
        if (changed) this.emitStatus()
      })
    read()
    this.signalsTimer = setInterval(read, SIGNALS_PERIOD)
  }

  /** Découpage des trames reçues, modifiable port ouvert. */
  setRx(rx) {
    this.flushRx()
    this.rx = normalizeRx(rx)
    this.emitStatus()
    return this.status()
  }

  /** Message du journal (ouverture, fermeture, passerelle, erreur). */
  event(level, text) {
    this.flushRx()
    this.append({ dir: 'event', level, text })
  }

  append(entry) {
    const full = { id: this.nextId++, time: Date.now(), ...entry }
    this.log.push(full)
    if (this.log.length > MAX_LOG) this.log.splice(0, this.log.length - MAX_LOG)
    this.outbox.push(full)
    this.emitTimer ??= setTimeout(() => {
      this.emitTimer = null
      const batch = this.outbox
      this.outbox = []
      this.onLog(batch)
      // Compteurs à jour dans l'interface avec le journal (pas un événement par octet reçu).
      this.emitStatus()
    }, EMIT_PERIOD)
  }

  clearLog() {
    this.log = []
    this.outbox = []
    return this.log
  }

  /** Journal en texte : une ligne par entrée (heure, sens, octets en hexadécimal, texte). */
  exportText() {
    const lines = this.log.map((e) => {
      const time = new Date(e.time).toISOString()
      if (e.dir === 'event') return `${time} --  ${e.text}`
      const bytes = Buffer.from(e.hex, 'hex')
      const source = e.source ? ` (${e.source})` : ''
      return `${time} ${e.dir.toUpperCase()}${source} [${bytes.length}] ${toHex(bytes)} | ${escapedText(bytes)}`
    })
    return lines.join('\n') + (lines.length ? '\n' : '')
  }

  /** Arrêt du module : port fermé, minuteries arrêtées. */
  async dispose() {
    await this.close().catch(() => {})
    clearTimeout(this.emitTimer)
    this.emitTimer = null
  }
}
