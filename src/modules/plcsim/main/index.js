import { PLCSIM_MODULE } from '../shared/constants'
import '../shared/locales'
import { PlcsimManager } from './manager'
import { createPointsApi } from './points'
import bridgeScript from './bridge.ps1?raw'

let manager = null

/**
 * Partie "main" du module PLCSim Advanced (Windows uniquement). Canaux : `plcsim:*`.
 * L'API Simulation Runtime (assembly .NET Framework) est appelée par un pont Windows PowerShell.
 */
export const plcsimMainModule = {
  manifest: PLCSIM_MODULE,

  activate(ctx) {
    manager = new PlcsimManager({
      dataDir: ctx.dataDir,
      scriptSource: bridgeScript,
      onStatus: (status) => ctx.emit('status', status),
      onData: (data) => ctx.emit('data', data),
      onWatches: (watches) => ctx.setConfig('watches', watches)
    })
    const settings = ctx.config().settings ?? {}
    manager.restoreWatches(ctx.config().watches)
    if (Number(ctx.config().pollInterval) >= 100) manager.pollInterval = Number(ctx.config().pollInterval)

    ctx.expose(createPointsApi({ manager }))

    ctx.handle('status', () => manager.status())
    ctx.handle('connect', (options) => manager.connect(options))
    ctx.handle('disconnect', () => manager.disconnect())
    ctx.handle('createInstance', (options) => manager.createInstance(options))
    ctx.handle('operate', (name, operation) => manager.operate(name, operation))
    ctx.handle('setIp', (name, suite) => manager.setIp(name, suite))
    ctx.handle('tags', (name, options) => manager.tags(name, options))
    ctx.handle('addWatch', (item) => manager.addWatch(item))
    ctx.handle('removeWatch', (id) => manager.removeWatch(id))
    ctx.handle('writeWatch', (id, value) => manager.writeWatch(id, value))
    ctx.handle('setPollInterval', (ms) => {
      const status = manager.setPollInterval(ms)
      ctx.setConfig('pollInterval', status.pollInterval)
      return status
    })

    // Connexion au démarrage, sans retarder le chargement des autres modules.
    if (settings.autoConnect && process.platform === 'win32') {
      manager.connect(settings).catch((err) => ctx.log('connexion automatique impossible :', err.message))
    }
  },

  /** Connecté à l'API (les instances continuent de tourner dans PLCSim Advanced après la déconnexion). */
  busy() {
    return !!manager?.status().connected
  },

  async deactivate() {
    await manager?.disconnect().catch(() => {})
  }
}
