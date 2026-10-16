import { parsePointKey } from '@shared/points'
import { RECORD_INTERVAL } from '../shared/constants'
import { t } from '../shared/i18n'

export const seconds = (value) => {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) throw new Error(t('simulator.errors.invalidDuration', { value }))
  return n * 1000
}

/** Arrondi d'une durée enregistrée (s), au centième. */
const roundSeconds = (ms) => Math.round(ms / 10) / 100

/**
 * Moteur du simulateur : défauts injectés dans les autres modules et enregistrement des évolutions
 * de points. Les flux (`./flows`) s'en servent pour lire et écrire les points et piloter les défauts.
 * Les modules sont atteints par leurs points publiés (`peers()` : [{ id, api }], contrat `@shared/points`).
 */
export class SimulatorEngine {
  /** id du défaut -> { def, until, timer, byFlow } */
  active = new Map()
  /** Enregistrement en cours : { keys, startedAt, last, events, timer } */
  recording = null

  constructor({ peers, onStatus = () => {} }) {
    this.peers = peers
    this.onStatus = onStatus
  }

  status() {
    return {
      faults: [...this.active.values()].map(({ def, until }) => ({ id: def.id, until })),
      recording: this.recording && {
        keys: this.recording.keys,
        startedAt: this.recording.startedAt,
        count: this.recording.events.length
      }
    }
  }

  changed() {
    this.onStatus(this.status())
    return this.status()
  }

  peer(moduleId) {
    const peer = this.peers().find((p) => p.id === moduleId)
    if (!peer) throw new Error(t('simulator.errors.unknownModule', { id: moduleId }))
    return peer.api
  }

  /** Modules disponibles : [{ id, name, points, faultTypes }] */
  targets() {
    return this.peers().map(({ id, api }) => ({
      id,
      name: api.name,
      points: api.points(),
      faultTypes: api.faultTypes?.() ?? []
    }))
  }

  /** Valeurs courantes de points désignés par leur clé `<module>/<id>`. */
  read(keys) {
    const byModule = Map.groupBy(keys, (key) => parsePointKey(key).moduleId)
    const values = {}
    for (const [moduleId, moduleKeys] of byModule) {
      const read = this.peer(moduleId).read(moduleKeys.map((key) => parsePointKey(key).id))
      for (const key of moduleKeys) values[key] = read[parsePointKey(key).id]
    }
    return values
  }

  write(key, value) {
    const { moduleId, id } = parsePointKey(key)
    return this.peer(moduleId).write(id, value)
  }

  // --- Défauts ---------------------------------------------------------------------

  /**
   * Active (ou réactive) un défaut : def = { id, module, type, params, points, duration (s, 0 = illimité) }.
   */
  async activateFault(def, { byFlow = false } = {}) {
    const api = this.peer(def.module)
    if (!(api.faultTypes?.() ?? []).some((f) => f.type === def.type)) {
      throw new Error(t('simulator.errors.unsupportedFault', { module: api.name }))
    }
    const duration = seconds(def.duration ?? 0)
    const previous = this.active.get(def.id)
    clearTimeout(previous?.timer)
    // Un défaut déjà activé à la main le reste au redéploiement des flux.
    const entry = {
      def,
      until: duration ? Date.now() + duration : null,
      timer: null,
      byFlow: byFlow && (!previous || previous.byFlow)
    }
    if (duration) entry.timer = setTimeout(() => this.deactivateFault(def.id).catch(() => {}), duration)
    this.active.set(def.id, entry)
    await this.applyFaults(def.module)
    return this.changed()
  }

  async deactivateFault(id) {
    const entry = this.active.get(id)
    if (entry) {
      clearTimeout(entry.timer)
      this.active.delete(id)
      await this.applyFaults(entry.def.module)
    }
    return this.changed()
  }

  async clearFaults() {
    const modules = new Set([...this.active.values()].map((e) => e.def.module))
    for (const entry of this.active.values()) clearTimeout(entry.timer)
    this.active.clear()
    for (const moduleId of modules) await this.applyFaults(moduleId)
    return this.changed()
  }

  /** Transmet à un module la liste de ses défauts actifs. */
  async applyFaults(moduleId) {
    const faults = [...this.active.values()]
      .filter((e) => e.def.module === moduleId)
      .map(({ def }) => ({ id: def.id, type: def.type, params: def.params ?? {}, points: def.points ?? [] }))
    await this.peer(moduleId).setFaults?.(faults)
  }

  /** Arrête les défauts activés par les flux (redéploiement ou arrêt des flux). */
  async releaseFlowFaults() {
    for (const entry of [...this.active.values()].filter((e) => e.byFlow)) {
      await this.deactivateFault(entry.def.id).catch(() => {})
    }
  }

  // --- Enregistrement ------------------------------------------------------------------

  /** Enregistre les évolutions des points (clés `<module>/<id>`) jusqu'à stopRecording(). */
  startRecording(keys, interval = RECORD_INTERVAL) {
    if (this.recording) throw new Error(t('simulator.errors.alreadyRecording'))
    if (!keys?.length) throw new Error(t('simulator.errors.noPoints'))
    const startedAt = Date.now()
    const initial = this.read(keys)
    const recording = { keys, startedAt, initial, last: { ...initial }, events: [], timer: null }
    recording.timer = setInterval(() => {
      const now = Date.now()
      let values
      try {
        values = this.read(keys)
      } catch {
        return
      }
      for (const key of keys) {
        if (JSON.stringify(values[key]) === JSON.stringify(recording.last[key])) continue
        recording.last[key] = values[key]
        if (values[key] !== undefined) recording.events.push({ t: now - startedAt, key, value: values[key] })
      }
    }, interval)
    this.recording = recording
    return this.changed()
  }

  /** Arrête l'enregistrement et retourne les étapes correspondantes (voir stepsToFlow). */
  stopRecording() {
    const recording = this.recording
    if (!recording) return []
    clearInterval(recording.timer)
    this.recording = null
    const end = Date.now() - recording.startedAt
    const steps = recording.keys
      .filter((key) => recording.initial[key] !== undefined)
      .map((key) => ({ type: 'set', point: key, value: recording.initial[key] }))
    let time = 0
    for (const event of recording.events) {
      if (event.t > time) steps.push({ type: 'wait', duration: roundSeconds(event.t - time) })
      time = event.t
      steps.push({ type: 'set', point: event.key, value: event.value })
    }
    if (end > time) steps.push({ type: 'wait', duration: roundSeconds(end - time) })
    this.changed()
    return steps
  }

  async dispose() {
    if (this.recording) this.stopRecording()
    await this.clearFaults().catch(() => {})
  }
}
