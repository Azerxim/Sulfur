import { withDefaults } from '@shared/config'
import { DEFAULT_FAULTS, SIMULATOR_MODULE } from '../shared/constants'
import { migrateSimulatorConfig } from '../shared/flows'
import '../shared/locales'
import { SimulatorEngine } from './engine'
import { FlowRuntime } from './flows'

let engine = null
let runtime = null

/**
 * Partie "main" du simulateur. Canaux : `simulator:*`. Agit sur les points publiés par les autres modules.
 * Les flux déployés sont enregistrés (section `deployed` : { flows, running }) et relancés au démarrage.
 */
export const simulatorMainModule = {
  manifest: SIMULATOR_MODULE,

  migrateConfig: migrateSimulatorConfig,

  async activate(ctx) {
    engine = new SimulatorEngine({ peers: () => ctx.peers(), onStatus: (status) => ctx.emit('status', status) })
    runtime = new FlowRuntime({
      engine,
      // Table des défauts telle qu'enregistrée par l'interface.
      faults: () => withDefaults(DEFAULT_FAULTS, ctx.config().faults),
      onState: (state) => ctx.emit('flows:state', state),
      onNodeStatus: (statuses) => ctx.emit('flows:nodeStatus', statuses),
      onDebug: (messages) => ctx.emit('flows:debug', messages)
    })
    const save = () => ctx.setConfig('deployed', { flows: runtime.flows, running: runtime.running })

    ctx.handle('targets', () => engine.targets())
    ctx.handle('status', () => engine.status())
    ctx.handle('read', (keys) => engine.read(keys))
    ctx.handle('faults:activate', (def) => engine.activateFault(def))
    ctx.handle('faults:deactivate', (id) => engine.deactivateFault(id))
    ctx.handle('faults:clear', () => engine.clearFaults())
    ctx.handle('record:start', (keys) => engine.startRecording(keys))
    ctx.handle('record:stop', () => engine.stopRecording())

    ctx.handle('flows:state', () => runtime.state())
    ctx.handle('flows:deploy', async (flows) => {
      const state = await runtime.deploy(flows)
      save()
      return state
    })
    ctx.handle('flows:stop', async () => {
      const state = await runtime.stop()
      save()
      return state
    })
    ctx.handle('flows:restart', async () => {
      const state = await runtime.restart()
      save()
      return state
    })
    ctx.handle('flows:inject', (nodeId) => runtime.inject(nodeId))
    ctx.handle('flows:nodeStatus', () => runtime.nodeStatuses())
    ctx.handle('flows:debug', () => runtime.debugLog)
    ctx.handle('flows:debug:clear', () => runtime.clearDebug())

    const deployed = ctx.config().deployed
    if (Array.isArray(deployed?.flows)) {
      await runtime.deploy(deployed.flows, { running: deployed.running !== false }).catch((err) => ctx.log(err))
    }
  },

  /** Défaut actif ou enregistrement en cours (les flux, qui tournent en continu, n'empêchent pas l'import). */
  busy() {
    const status = engine?.status()
    return !!(status && (status.recording || status.faults.length))
  },

  async deactivate() {
    await runtime?.dispose()
    await engine?.dispose()
  }
}
