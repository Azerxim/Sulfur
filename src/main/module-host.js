import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'

/**
 * Charge les modules côté process principal et leur fournit un contexte :
 *  - ctx.handle(action, fn) : enregistre un handler `<moduleId>:<action>` appelable depuis le renderer
 *  - ctx.emit(event, payload) : diffuse un événement `<moduleId>:<event>` à toutes les fenêtres
 *  - ctx.dataDir : dossier de données persistant propre au module
 *  - ctx.log(...args)
 */
export class ModuleHost {
  modules = []

  async load(modules) {
    for (const mod of modules) {
      await mod.activate(this.createContext(mod.manifest.id))
      this.modules.push(mod)
      console.log(`[sulfur] module "${mod.manifest.id}" chargé`)
    }
  }

  async dispose() {
    for (const mod of [...this.modules].reverse()) {
      try {
        await mod.deactivate?.()
      } catch (err) {
        console.error(`[sulfur] erreur à l'arrêt du module "${mod.manifest.id}"`, err)
      }
    }
    this.modules = []
  }

  createContext(id) {
    return {
      dataDir: join(app.getPath('userData'), 'modules', id),
      handle(action, fn) {
        ipcMain.handle(`${id}:${action}`, async (_e, ...args) => {
          try {
            return { ok: true, data: await fn(...args) }
          } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) }
          }
        })
      },
      emit(event, payload) {
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) win.webContents.send(`${id}:${event}`, payload)
        }
      },
      log(...args) {
        console.log(`[${id}]`, ...args)
      }
    }
  }
}
