import { t } from '../shared/i18n'

/**
 * Horloge simulée du serveur NTP. L'heure simulée avance comme l'heure réelle, corrigée de la
 * dérive (ppm) : sim(r) = ancreSimulée + (r − ancreRéelle) × (1 + dérive / 10⁶).
 *  - mode « offset » : l'ancre est l'heure réelle + décalage ;
 *  - mode « fixed » : l'ancre est l'heure choisie (l'horloge part de là au démarrage).
 * Une horloge figée (défaut du simulateur) renvoie toujours la même heure.
 */
export class SimClock {
  anchorReal = Date.now()
  anchorSim = Date.now()
  drift = 0
  frozenAt = null

  constructor(settings = {}, now = () => Date.now()) {
    this.realNow = now
    this.configure(settings)
  }

  /** (Re)règle l'horloge : { mode, offset (s), fixedTime (ISO), drift (ppm) }. */
  configure({ mode = 'offset', offset = 0, fixedTime = '', drift = 0 } = {}) {
    const real = this.realNow()
    const ppm = Number(drift) || 0
    if (Math.abs(ppm) > 500_000) throw new Error(t('ntp.errors.invalidDrift', { value: drift }))
    let anchor
    if (mode === 'fixed') {
      anchor = Date.parse(fixedTime)
      if (!Number.isFinite(anchor)) throw new Error(t('ntp.errors.invalidTime', { value: fixedTime || '—' }))
    } else {
      const seconds = Number(offset)
      if (!Number.isFinite(seconds)) throw new Error(t('ntp.errors.invalidOffset', { value: offset }))
      anchor = real + seconds * 1000
    }
    this.settings = { mode, offset: Number(offset) || 0, fixedTime, drift: ppm }
    this.anchorReal = real
    this.anchorSim = anchor
    this.drift = ppm
    return this
  }

  /** Change seulement la dérive, sans saut d'heure. */
  setDrift(ppm) {
    const value = Number(ppm)
    if (!Number.isFinite(value) || Math.abs(value) > 500_000)
      throw new Error(t('ntp.errors.invalidDrift', { value: ppm }))
    this.anchorSim = this.now()
    this.anchorReal = this.realNow()
    this.drift = value
    this.settings = { ...this.settings, drift: value }
  }

  /** Décale l'horloge : l'heure simulée devient l'heure réelle + `seconds` (mode « offset »). */
  setOffset(seconds) {
    return this.configure({ ...this.settings, mode: 'offset', offset: seconds })
  }

  now() {
    if (this.frozenAt !== null) return this.frozenAt
    const real = this.realNow()
    return this.anchorSim + (real - this.anchorReal) * (1 + this.drift / 1e6)
  }

  /** Écart actuel entre l'heure simulée et l'heure réelle (s). */
  offset() {
    return (this.now() - this.realNow()) / 1000
  }

  freeze(frozen) {
    if (frozen && this.frozenAt === null) this.frozenAt = this.now()
    if (!frozen && this.frozenAt !== null) {
      // Reprise là où l'horloge s'était arrêtée.
      this.anchorSim = this.frozenAt
      this.anchorReal = this.realNow()
      this.frozenAt = null
    }
  }
}
