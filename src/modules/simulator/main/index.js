import { SIMULATOR_MODULE } from '../shared/constants'
import '../shared/locales'
import { SimulatorEngine } from './engine'

let engine = null

/** Partie "main" du simulateur. Canaux : `simulator:*`. Agit sur les points publiés par les autres modules. */
export const simulatorMainModule = {
  manifest: SIMULATOR_MODULE,

  activate(ctx) {
    engine = new SimulatorEngine({ peers: () => ctx.peers(), onStatus: (status) => ctx.emit('status', status) })

    ctx.handle('targets', () => engine.targets())
    ctx.handle('status', () => engine.status())
    ctx.handle('read', (keys) => engine.read(keys))
    ctx.handle('faults:activate', (def) => engine.activateFault(def))
    ctx.handle('faults:deactivate', (id) => engine.deactivateFault(id))
    ctx.handle('faults:clear', () => engine.clearFaults())
    ctx.handle('scenario:play', (scenario, faults) => engine.play(scenario, faults))
    ctx.handle('scenario:stop', () => engine.stop())
    ctx.handle('record:start', (keys) => engine.startRecording(keys))
    ctx.handle('record:stop', () => engine.stopRecording())
  },

  /** Scénario en cours, enregistrement ou défaut actif. */
  busy() {
    const status = engine?.status()
    return !!(status && (status.scenario || status.recording || status.faults.length))
  },

  async deactivate() {
    await engine?.dispose()
  }
}
