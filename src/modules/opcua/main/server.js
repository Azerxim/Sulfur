import { OPCUAServer, Variant, DataType, StatusCodes } from 'node-opcua'
import { coerce } from './serialize'
import { simulate } from './simulator'

/** Serveur OPC UA exposant des variables simulées sous Objects/<rootFolder>. */
export class SimulationServer {
  server = null
  timer = null
  values = new Map()
  config = null

  constructor(onStatus) {
    this.onStatus = onStatus
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
    this.config = config

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
      this.buildAddressSpace(server, config)
      await server.start()
    } catch (err) {
      await server.shutdown(0).catch(() => {})
      this.config = null
      throw err
    }

    this.server = server
    server.on('create_session', () => this.onStatus(this.status()))
    server.on('session_closed', () => this.onStatus(this.status()))
    this.startSimulation(config)
    this.onStatus(this.status())
    return this.status()
  }

  async stop() {
    clearInterval(this.timer)
    this.timer = null
    if (this.server) {
      const server = this.server
      this.server = null
      await server.shutdown(500)
    }
    this.values.clear()
    this.onStatus(this.status())
    return this.status()
  }

  buildAddressSpace(server, config) {
    const addressSpace = server.engine.addressSpace
    const ns = addressSpace.getOwnNamespace()
    const folder = ns.addFolder(addressSpace.rootFolder.objects, { browseName: config.rootFolder })

    for (const v of config.variables) {
      const dataType = DataType[v.dataType]
      this.values.set(v.name, coerce(v.initialValue, v.dataType))
      ns.addVariable({
        componentOf: folder,
        browseName: v.name,
        nodeId: `s=${config.rootFolder}.${v.name}`,
        dataType: v.dataType,
        accessLevel: v.writable ? 'CurrentRead | CurrentWrite' : 'CurrentRead',
        userAccessLevel: v.writable ? 'CurrentRead | CurrentWrite' : 'CurrentRead',
        minimumSamplingInterval: config.updateRate,
        value: {
          get: () => new Variant({ dataType, value: this.values.get(v.name) }),
          set: (variant) => {
            this.values.set(v.name, variant.value)
            return StatusCodes.Good
          }
        }
      })
    }
  }

  startSimulation(config) {
    const t0 = Date.now()
    const dt = Number(config.updateRate) || 100
    this.timer = setInterval(() => {
      const t = Date.now() - t0
      for (const v of config.variables) {
        if (v.simulation === 'none') continue
        this.values.set(v.name, simulate(v, this.values.get(v.name), t, dt))
      }
    }, dt)
  }
}
