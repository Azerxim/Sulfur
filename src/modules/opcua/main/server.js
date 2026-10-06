import { OPCUAServer, Variant, DataType, StatusCodes, makeAccessLevelFlag } from 'node-opcua'
import { randomUUID } from 'crypto'
import { coerce, toPlain } from './serialize'
import { simulate } from './simulator'

const VALUES_EMIT_INTERVAL = 250

const accessLevel = (writable) => makeAccessLevelFlag(writable ? 'CurrentRead | CurrentWrite' : 'CurrentRead')

/**
 * Serveur OPC UA exposant des variables simulées sous Objects/<rootFolder>.
 * Les variables peuvent être ajoutées, modifiées ou supprimées pendant que le serveur tourne.
 */
export class SimulationServer {
  server = null
  folder = null
  simTimer = null
  emitTimer = null
  t0 = 0
  config = null
  /** id -> { def, node, value } */
  vars = new Map()

  constructor(onStatus, onValues) {
    this.onStatus = onStatus
    this.onValues = onValues
  }

  status() {
    return {
      running: !!this.server,
      endpointUrl: this.server?.getEndpointUrl() ?? null,
      config: this.config,
      sessions: this.server?.currentSessionCount ?? 0
    }
  }

  async start(config) {
    if (this.server) throw new Error('Le serveur est déjà démarré')
    const names = config.variables.map((v) => v.name)
    if (new Set(names).size !== names.length) throw new Error('Noms de variables en double')


    const server = new OPCUAServer({
      port: Number(config.port),
      resourcePath: config.resourcePath,
      allowAnonymous: true,
      buildInfo: {
        productName: 'Sulfur OPC UA Simulator',
        manufacturerName: 'Sulfur',
        buildNumber: '1',
        buildDate: new Date()
      }
    })

    try {
      await server.initialize()
      const addressSpace = server.engine.addressSpace
      this.server = server
      this.config = { ...config, variables: [] }
      this.folder = addressSpace.getOwnNamespace().addFolder(addressSpace.rootFolder.objects, {
        browseName: config.rootFolder
      })
      for (const def of config.variables) this.createVariable({ ...def, id: def.id ?? randomUUID() })
      await server.start()
    } catch (err) {
      this.reset()
      await server.shutdown(0).catch(() => {})
      throw err
    }

    server.on('create_session', () => this.onStatus(this.status()))
    server.on('session_closed', () => this.onStatus(this.status()))
    this.t0 = Date.now()
    this.startSimulation()
    this.emitTimer = setInterval(() => this.onValues(this.values()), VALUES_EMIT_INTERVAL)
    this.onStatus(this.status())
    return this.status()
  }

  async stop() {
    const server = this.server
    this.reset()
    if (server) await server.shutdown(500)
    this.onStatus(this.status())
    return this.status()
  }

  reset() {
    clearInterval(this.simTimer)
    clearInterval(this.emitTimer)
    this.simTimer = this.emitTimer = null
    this.server = null
    this.folder = null
    this.vars.clear()
  }

  requireRunning() {
    if (!this.server) throw new Error('Le serveur n\'est pas démarré')
  }

  /** Valeurs courantes de toutes les variables : { [id]: valeur } */
  values() {
    return Object.fromEntries([...this.vars].map(([id, v]) => [id, toPlain(v.value)]))
  }

  // --- Modifications à chaud ------------------------------------------------

  /**
   * Ajoute ou met à jour une variable. Un changement de nom ou de type recrée le nœud
   * (son NodeId change) ; les autres paramètres sont appliqués sans interruption.
   */
  upsertVariable(def) {
    this.requireRunning()
    if (!def.name?.trim()) throw new Error('Le nom de la variable est vide')
    for (const [id, v] of this.vars) {
      if (id !== def.id && v.def.name === def.name) throw new Error(`La variable "${def.name}" existe déjà`)
    }

    const entry = this.vars.get(def.id)
    if (!entry) {
      this.createVariable(def)
    } else if (entry.def.name !== def.name || entry.def.dataType !== def.dataType) {
      this.deleteVariable(def.id)
      this.createVariable(def)
    } else {
      entry.def = def
      entry.node.accessLevel = accessLevel(def.writable)
      entry.node.userAccessLevel = accessLevel(def.writable)
      this.syncConfig()
    }
    this.onStatus(this.status())
    return this.status()
  }

  removeVariable(id) {
    this.requireRunning()
    this.deleteVariable(id)
    this.onStatus(this.status())
    return this.status()
  }

  /** Force la valeur courante d'une variable (écrasée au prochain pas si elle est simulée). */
  setValue(id, raw) {
    this.requireRunning()
    const entry = this.vars.get(id)
    if (!entry) throw new Error('Variable inconnue')
    entry.value = coerce(raw, entry.def.dataType)
    this.onValues(this.values())
    return toPlain(entry.value)
  }

  setUpdateRate(rate) {
    this.requireRunning()
    const n = Number(rate)
    if (!Number.isFinite(n) || n < 10) throw new Error('Période minimale : 10 ms')
    this.config = { ...this.config, updateRate: n }
    this.startSimulation()
    this.onStatus(this.status())
    return this.status()
  }

  // --- Interne ----------------------------------------------------------------

  createVariable(def) {
    const dataType = DataType[def.dataType]
    if (dataType === undefined) throw new Error(`Type inconnu : ${def.dataType}`)
    const ns = this.server.engine.addressSpace.getOwnNamespace()
    const entry = { def, value: coerce(def.initialValue, def.dataType), node: null }

    entry.node = ns.addVariable({
      componentOf: this.folder,
      browseName: def.name,
      nodeId: `s=${this.config.rootFolder}.${def.name}`,
      dataType: def.dataType,
      accessLevel: accessLevel(def.writable),
      userAccessLevel: accessLevel(def.writable),
      minimumSamplingInterval: 50,
      value: {
        get: () => new Variant({ dataType, value: entry.value }),
        set: (variant) => {
          if (!entry.def.writable) return StatusCodes.BadNotWritable
          entry.value = variant.value
          return StatusCodes.Good
        }
      }
    })
    this.vars.set(def.id, entry)
    this.syncConfig()
  }

  deleteVariable(id) {
    const entry = this.vars.get(id)
    if (!entry) return
    this.server.engine.addressSpace.deleteNode(entry.node)
    this.vars.delete(id)
    this.syncConfig()
  }

  syncConfig() {
    this.config = { ...this.config, variables: [...this.vars.values()].map((v) => v.def) }
  }

  startSimulation() {
    clearInterval(this.simTimer)
    const dt = Number(this.config.updateRate) || 100
    this.simTimer = setInterval(() => {
      const t = Date.now() - this.t0
      for (const entry of this.vars.values()) {
        if (entry.def.simulation === 'none') continue
        entry.value = simulate(entry.def, entry.value, t, dt)
      }
    }, dt)
  }
}
