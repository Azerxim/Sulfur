import { DEBUG_LIMIT, NODE_TYPES } from '../shared/flows'
import { t } from '../shared/i18n'
import { NODE_IMPLEMENTATIONS } from './nodes'

/** Regroupement des statuts de nœuds et des messages de débogage envoyés à l'interface (ms). */
const FLUSH_INTERVAL = 150

/** Copie d'une valeur transmissible à l'interface (les valeurs non clonables deviennent du texte). */
function transferable(value) {
  try {
    return structuredClone(value)
  } catch {
    return String(value)
  }
}

/** Copie d'un message pour chaque nœud destinataire : un nœud ne modifie pas le message d'un autre. */
function cloneMessage(msg) {
  try {
    return structuredClone(msg)
  } catch {
    return { ...msg }
  }
}

/**
 * Exécution des flux, à la manière de Node-RED : les flux sont « déployés » et tournent en continu ;
 * les messages passent d'un nœud à l'autre en suivant les fils. Un redéploiement arrête tous les
 * nœuds (minuteurs, rampes…) et les défauts activés par les flux, puis relance les flux reçus.
 * Les points et défauts sont atteints par le moteur du simulateur (`SimulatorEngine`).
 */
export class FlowRuntime {
  /** Flux déployés (tels que reçus). */
  flows = []
  running = false
  deployedAt = null
  /** id du nœud → { node, flowId, flowContext, impl, api, closed, timers, wakers, targets: [[id]] } */
  nodes = new Map()
  /** id du nœud → { fill, text } */
  statuses = {}
  debugLog = []
  /** Contexte partagé par tous les flux (nœuds fonction : `global`). */
  global = {}
  pendingStatus = {}
  pendingDebug = []
  flushTimer = null
  debugSeq = 0

  constructor({ engine, faults = () => [], onState = () => {}, onNodeStatus = () => {}, onDebug = () => {} }) {
    this.engine = engine
    this.faults = faults
    this.onState = onState
    this.onNodeStatus = onNodeStatus
    this.onDebug = onDebug
  }

  state() {
    return { running: this.running, deployedAt: this.deployedAt, flows: this.flows }
  }

  changed() {
    this.onState(this.state())
    return this.state()
  }

  /** Remplace les flux en marche par `flows` et les démarre (`running` faux : déployés mais arrêtés). */
  async deploy(flows, { running = true } = {}) {
    if (!Array.isArray(flows)) throw new Error(t('simulator.errors.invalidFlows'))
    await this.halt()
    this.flows = transferable(flows)
    if (running) this.start()
    return this.changed()
  }

  /** Relance les flux déployés. */
  async restart() {
    await this.halt()
    this.start()
    return this.changed()
  }

  async stop() {
    await this.halt()
    return this.changed()
  }

  start() {
    this.running = true
    this.deployedAt = Date.now()
    this.global = {}
    for (const flow of this.flows) {
      if (flow.disabled) continue
      const flowContext = {}
      for (const node of flow.nodes ?? []) {
        if (!NODE_TYPES[node.type]) continue
        const targets = []
        for (const wire of flow.wires ?? []) {
          if (wire.source !== node.id) continue
          ;(targets[wire.port ?? 0] ??= []).push(wire.target)
        }
        this.nodes.set(node.id, {
          node,
          flowId: flow.id,
          flowContext,
          targets,
          timers: new Set(),
          wakers: new Set(),
          closed: false
        })
      }
    }
    // Tous les nœuds existent avant que le premier message ne circule.
    for (const entry of this.nodes.values()) this.create(entry)
    for (const entry of this.nodes.values()) {
      if (entry.impl?.start) this.guard(entry, () => entry.impl.start())
    }
  }

  create(entry) {
    const { node } = entry
    entry.api = this.nodeApi(entry)
    try {
      entry.impl = NODE_IMPLEMENTATIONS[node.type](entry.api)
    } catch (err) {
      entry.impl = null
      entry.api.error(err)
    }
  }

  /** Arrête tous les nœuds et les défauts activés par les flux. */
  async halt() {
    if (!this.running) return
    this.running = false
    for (const entry of this.nodes.values()) {
      entry.closed = true
      for (const timer of entry.timers) clearTimeout(timer)
      entry.timers.clear()
      for (const wake of [...entry.wakers]) wake()
      try {
        entry.impl?.close?.()
      } catch {
        // un nœud qui échoue à s'arrêter n'empêche pas l'arrêt des autres
      }
    }
    this.nodes.clear()
    this.statuses = {}
    this.pendingStatus = {}
    this.onNodeStatus(null)
    await this.engine.releaseFlowFaults()
  }

  /** Déclenche un nœud « Déclencheur » (bouton de l'éditeur). */
  inject(nodeId) {
    const entry = this.nodes.get(nodeId)
    if (!entry?.impl?.trigger) throw new Error(t('simulator.errors.notDeployed'))
    this.guard(entry, () => entry.impl.trigger())
  }

  /** Exécute une action d'un nœud ; une erreur est affichée sur le nœud et dans le débogage. */
  guard(entry, fn, msg) {
    Promise.resolve()
      .then(fn)
      .catch((err) => !entry.closed && entry.api.error(err, msg))
  }

  /**
   * Envoie un message sur les sorties d'un nœud : `msg` part sur la sortie 0, un tableau donne un
   * message (ou un tableau de messages, ou null) par sortie.
   */
  send(entry, msgs) {
    if (entry.closed || msgs === null || msgs === undefined) return
    const ports = Array.isArray(msgs) ? msgs : [msgs]
    ports.forEach((portMsgs, port) => {
      if (portMsgs === null || portMsgs === undefined) return
      for (const msg of Array.isArray(portMsgs) ? portMsgs : [portMsgs]) {
        if (msg === null || typeof msg !== 'object') continue
        for (const targetId of entry.targets[port] ?? []) this.deliver(targetId, cloneMessage(msg))
      }
    })
  }

  deliver(targetId, msg) {
    const target = this.nodes.get(targetId)
    if (!target?.impl?.input) return
    // Livraison différée : une boucle de nœuds ne bloque pas le process.
    setImmediate(() => {
      if (!target.closed) this.guard(target, () => target.impl.input(msg), msg)
    })
  }

  setStatus(nodeId, status) {
    if (!this.nodes.has(nodeId)) return
    if (status) this.statuses[nodeId] = status
    else delete this.statuses[nodeId]
    this.pendingStatus[nodeId] = status
    this.scheduleFlush()
  }

  /** Statuts courants des nœuds : { [id]: { fill, text } }. */
  nodeStatuses() {
    return this.statuses
  }

  debug(entry, value, level = 'info') {
    const message = {
      id: ++this.debugSeq,
      time: Date.now(),
      flowId: entry.flowId,
      nodeId: entry.node.id,
      name: entry.node.name,
      type: entry.node.type,
      level,
      value: transferable(value)
    }
    this.debugLog.push(message)
    if (this.debugLog.length > DEBUG_LIMIT) this.debugLog.splice(0, this.debugLog.length - DEBUG_LIMIT)
    this.pendingDebug.push(message)
    this.scheduleFlush()
  }

  clearDebug() {
    this.debugLog = []
    this.pendingDebug = []
    return []
  }

  scheduleFlush() {
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => this.flush(), FLUSH_INTERVAL)
  }

  flush() {
    clearTimeout(this.flushTimer)
    this.flushTimer = null
    if (Object.keys(this.pendingStatus).length) {
      const statuses = this.pendingStatus
      this.pendingStatus = {}
      this.onNodeStatus(statuses)
    }
    if (this.pendingDebug.length) {
      const messages = this.pendingDebug
      this.pendingDebug = []
      this.onDebug(messages)
    }
  }

  /** Outils offerts à l'implémentation d'un nœud (voir `./nodes`). */
  nodeApi(entry) {
    const runtime = this
    const { node } = entry
    const track = (timer) => {
      entry.timers.add(timer)
      return timer
    }
    return {
      id: node.id,
      name: node.name,
      type: node.type,
      config: { ...NODE_TYPES[node.type].defaults, ...node.config },
      /** Mémoire propre au nœud, au flux et commune à tous les flux (jusqu'au redéploiement). */
      context: {},
      flow: entry.flowContext,
      global: runtime.global,
      get closed() {
        return entry.closed
      },
      send: (msgs) => runtime.send(entry, msgs),
      status: (text, fill = 'green') => runtime.setStatus(node.id, { text: String(text ?? ''), fill }),
      clearStatus: () => runtime.setStatus(node.id, null),
      debug: (value, level) => runtime.debug(entry, value, level),
      warn(text) {
        runtime.debug(entry, String(text), 'warn')
      },
      error(err) {
        const text = err instanceof Error ? err.message : String(err)
        runtime.setStatus(node.id, { text, fill: 'red' })
        runtime.debug(entry, text, 'error')
      },
      read: (key) => runtime.engine.read([key])[key],
      write: (key, value) => runtime.engine.write(key, value),
      /** Défauts de la table du simulateur. */
      faults: () => runtime.faults(),
      activateFault: (def) => runtime.engine.activateFault(def, { byFlow: true }),
      deactivateFault: (id) => runtime.engine.deactivateFault(id),
      setTimeout(fn, ms) {
        const timer = track(
          setTimeout(() => {
            entry.timers.delete(timer)
            if (!entry.closed) runtime.guard(entry, fn)
          }, ms)
        )
        return timer
      },
      setInterval: (fn, ms) =>
        track(
          setInterval(() => {
            if (!entry.closed) runtime.guard(entry, fn)
          }, ms)
        ),
      clearTimer(timer) {
        clearTimeout(timer)
        entry.timers.delete(timer)
      },
      /** Attente, terminée aussitôt à l'arrêt des flux. */
      sleep: (ms) =>
        new Promise((resolve) => {
          if (entry.closed || ms <= 0) return resolve()
          const done = () => {
            clearTimeout(timer)
            entry.timers.delete(timer)
            entry.wakers.delete(done)
            resolve()
          }
          const timer = track(setTimeout(done, ms))
          entry.wakers.add(done)
        })
    }
  }

  async dispose() {
    await this.halt()
    clearTimeout(this.flushTimer)
    this.flushTimer = null
  }
}
