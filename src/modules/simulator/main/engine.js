import { parsePointKey, toNumber } from '@shared/points'
import { RAMP_INTERVAL, RECORD_INTERVAL } from '../shared/constants'
import { t } from '../shared/i18n'

const seconds = (value) => {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) throw new Error(t('simulator.errors.invalidDuration', { value }))
  return n * 1000
}

/** Arrondi d'une durée enregistrée (s), au centième. */
const roundSeconds = (ms) => Math.round(ms / 10) / 100

/**
 * Moteur du simulateur : défauts injectés dans les autres modules, lecture des scénarios et
 * enregistrement des évolutions de points. Les modules sont atteints par leurs points publiés
 * (`peers()` : [{ id, api }], contrat `@shared/points`).
 */
export class SimulatorEngine {
  /** id du défaut -> { def, until, timer, byScenario } */
  active = new Map()
  /** Scénario en cours : { id, name, count, step, iteration, loop, token } */
  run = null
  /** Enregistrement en cours : { keys, startedAt, last, events, timer } */
  recording = null
  error = null

  constructor({ peers, onStatus = () => {} }) {
    this.peers = peers
    this.onStatus = onStatus
  }

  status() {
    return {
      faults: [...this.active.values()].map(({ def, until }) => ({ id: def.id, until })),
      scenario: this.run && {
        id: this.run.id,
        step: this.run.step,
        count: this.run.count,
        iteration: this.run.iteration,
        loop: this.run.loop
      },
      recording: this.recording && {
        keys: this.recording.keys,
        startedAt: this.recording.startedAt,
        count: this.recording.events.length
      },
      error: this.error
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
  async activateFault(def, { byScenario = false } = {}) {
    const api = this.peer(def.module)
    if (!(api.faultTypes?.() ?? []).some((f) => f.type === def.type)) {
      throw new Error(t('simulator.errors.unsupportedFault', { module: api.name }))
    }
    const duration = seconds(def.duration ?? 0)
    const previous = this.active.get(def.id)
    clearTimeout(previous?.timer)
    // Un défaut déjà activé à la main le reste à la fin du scénario.
    const entry = {
      def,
      until: duration ? Date.now() + duration : null,
      timer: null,
      byScenario: byScenario && (!previous || previous.byScenario)
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

  // --- Scénarios ---------------------------------------------------------------------

  /**
   * Lance un scénario : { id, name, loop, steps }. `faults` : défauts connus, pour les étapes « fault ».
   * Le scénario s'exécute en arrière-plan ; son avancement est publié par onStatus.
   */
  play(scenario, faults = []) {
    if (this.run) throw new Error(t('simulator.errors.alreadyRunning'))
    if (!scenario.steps?.length) throw new Error(t('simulator.errors.emptyScenario'))
    const token = { cancelled: false, wake: null }
    this.error = null
    this.run = {
      id: scenario.id,
      count: scenario.steps.length,
      step: 0,
      iteration: 1,
      loop: !!scenario.loop,
      token
    }
    this.execute(scenario, faults, token).then(
      () => this.finish(token),
      (err) => this.finish(token, err)
    )
    return this.changed()
  }

  async stop() {
    const token = this.run?.token
    if (token) {
      token.cancelled = true
      token.wake?.()
    }
    await this.finish(token)
    return this.status()
  }

  async finish(token, err) {
    if (!this.run || this.run.token !== token) return
    this.run = null
    if (err) this.error = err.message
    // Les défauts activés par le scénario ne lui survivent pas.
    for (const entry of [...this.active.values()].filter((e) => e.byScenario)) {
      await this.deactivateFault(entry.def.id).catch(() => {})
    }
    this.changed()
  }

  sleep(ms, token) {
    return new Promise((resolve) => {
      if (token.cancelled || ms <= 0) return resolve()
      const timer = setTimeout(done, ms)
      function done() {
        clearTimeout(timer)
        token.wake = null
        resolve()
      }
      token.wake = done
    })
  }

  async execute(scenario, faults, token) {
    do {
      for (const [index, step] of scenario.steps.entries()) {
        if (token.cancelled) return
        this.run.step = index + 1
        this.changed()
        try {
          await this.executeStep(step, faults, token)
        } catch (err) {
          throw new Error(
            t('simulator.errors.stepFailed', {
              step: index + 1,
              type: t(`simulator.steps.${step.type}`),
              message: err.message
            }),
            { cause: err }
          )
        }
      }
      if (token.cancelled || !scenario.loop) return
      this.run.iteration++
    } while (!token.cancelled)
  }

  async executeStep(step, faults, token) {
    switch (step.type) {
      case 'set':
        return this.write(step.point, step.value)
      case 'wait':
        return this.sleep(seconds(step.duration), token)
      case 'ramp': {
        const duration = seconds(step.duration)
        const from =
          step.from === '' || step.from === undefined || step.from === null
            ? this.read([step.point])[step.point]
            : step.from
        const start = toNumber(from)
        const end = toNumber(step.to)
        if (start === null || end === null) throw new Error(t('simulator.errors.notNumeric', { point: step.point }))
        const count = Math.max(1, Math.round(duration / RAMP_INTERVAL))
        // Bornes entières : valeurs intermédiaires entières (variables de type entier).
        const integer = Number.isInteger(start) && Number.isInteger(end)
        for (let k = 1; k <= count && !token.cancelled; k++) {
          await this.sleep(duration / count, token)
          if (token.cancelled) return
          const value = start + ((end - start) * k) / count
          await this.write(step.point, integer ? Math.round(value) : value)
        }
        return
      }
      case 'fault': {
        const def = faults.find((f) => f.id === step.fault)
        if (!def) throw new Error(t('simulator.errors.unknownFault'))
        if (step.action === 'off') return this.deactivateFault(def.id)
        return this.activateFault(def, { byScenario: true })
      }
      default:
        return undefined
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

  /** Arrête l'enregistrement et retourne les étapes du scénario correspondant. */
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
    await this.stop()
    await this.clearFaults().catch(() => {})
  }
}
