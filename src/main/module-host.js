import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { checkManifest, moduleT, t } from '@azerxim/sulfur-sdk'
import { APP_VERSION } from '@shared/app'
import { ConfigStore } from './config-store'

/** Canal IPC dont le résultat est enveloppé ({ ok, data } ou { ok: false, error }). Remplace un canal existant. */
function handleChannel(channel, fn) {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, data: await fn(...args) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

/** Nom traduit d'un module (messages d'erreur). */
const moduleName = (mod) => moduleT(mod.manifest.id)(`${mod.manifest.id}.name`, null, mod.manifest.name)

/**
 * Charge les modules côté process principal et leur fournit un contexte :
 *  - ctx.handle(action, fn) : enregistre un handler `<moduleId>:<action>` appelable depuis le renderer
 *  - ctx.emit(event, payload) : diffuse un événement `<moduleId>:<event>` à toutes les fenêtres
 *  - ctx.dataDir : dossier de données persistant propre au module
 *  - ctx.config() : configuration enregistrée du module (voir ci-dessous)
 *  - ctx.setConfig(section, value) : remplace une section de cette configuration (état propre au
 *    process principal, comme les flux déployés du simulateur)
 *  - ctx.expose(api) : publie les points de données du module pour les autres modules
 *    (contrat décrit dans `points.js` du SDK)
 *  - ctx.peers() : points publiés par les autres modules actifs, [{ id, api }]
 *  - ctx.log(...args)
 *
 * Chaque module dispose aussi d'une configuration enregistrée (`<dataDir>/config.json`), lue et écrite
 * par l'interface via les canaux `<moduleId>:config:load`, `<moduleId>:config:save` et
 * `<moduleId>:config:reset`. Un module peut exporter `busy()` (serveur démarré, client connecté) :
 * l'import d'une configuration est alors refusé. Il peut aussi exporter `migrateConfig(config)`, qui
 * convertit une configuration d'une version antérieure, au chargement comme à l'import.
 *
 * Un module désactivé (Paramètres → Modules) n'est pas activé : ni ses canaux ni ses points
 * n'existent, mais sa configuration enregistrée reste disponible (interface, import / export).
 *
 * Le manifeste de chaque module est vérifié avant tout (voir `checkManifest`) : un module invalide
 * ou incompatible (API des modules, version de Sulfur) est refusé et n'existe pas pour
 * l'application ; il est listé dans `rejected` avec la raison du refus.
 */
export class ModuleHost {
  /** Modules enregistrés, actifs ou non, dans l'ordre de chargement. */
  modules = []
  /** Identifiants des modules activés. */
  active = new Set()
  /** Identifiants des modules désactivés par l'utilisateur. */
  disabled = new Set()
  /** Modules refusés au chargement : [{ id, name, version, reason, params }] (libellés : modules.problems.*). */
  rejected = []
  contexts = new Map()
  /** Configurations enregistrées, par identifiant de module. */
  configs = new Map()
  /** Points publiés par les modules (ctx.expose), par identifiant de module. */
  apis = new Map()

  /** `disabled` : modules à ne pas activer (leur configuration est chargée quand même). */
  async load(modules, { disabled = [] } = {}) {
    for (const id of disabled) this.disabled.add(id)
    for (const mod of modules) {
      const problem = checkManifest(mod.manifest, {
        appVersion: APP_VERSION,
        loadedIds: this.modules.map((m) => m.manifest.id)
      })
      if (problem) {
        this.reject(mod, problem)
        continue
      }
      const id = mod.manifest.id
      const ctx = this.createContext(id)
      const config = new ConfigStore(join(ctx.dataDir, 'config.json'))
      const migrated = this.migrate(id, config.get(), [mod])
      if (migrated !== config.get()) config.replace(migrated)
      this.configs.set(id, config)
      ctx.config = () => config.get()
      ctx.setConfig = (section, value) => config.set(section, value)
      handleChannel(`${id}:config:load`, () => config.get())
      handleChannel(`${id}:config:save`, (section, value) => config.set(section, value))
      handleChannel(`${id}:config:reset`, () => config.replace({}))
      this.contexts.set(id, ctx)
      this.modules.push(mod)
      if (this.disabled.has(id)) {
        console.log(`[sulfur] module "${id}" désactivé`)
        continue
      }
      await this.activate(mod)
    }
  }

  reject(mod, { reason, params }) {
    const { id = '?', name, version = '?' } = mod?.manifest ?? {}
    this.rejected.push({ id: String(id), name: String(name ?? id), version: String(version), reason, params })
    console.warn(`[sulfur] module "${id}" refusé : ${t(`modules.problems.${reason}`, params)}`)
  }

  async activate(mod) {
    const id = mod.manifest.id
    await mod.activate(this.contexts.get(id))
    this.active.add(id)
    console.log(`[sulfur] module "${id}" chargé`)
  }

  /** Arrêt d'un module : serveurs et clients arrêtés, canaux et points retirés. */
  async deactivate(mod) {
    const id = mod.manifest.id
    try {
      await mod.deactivate?.()
    } catch (err) {
      console.error(`[sulfur] erreur à l'arrêt du module "${id}"`, err)
    }
    const ctx = this.contexts.get(id)
    for (const channel of ctx.channels) ipcMain.removeHandler(channel)
    ctx.channels.clear()
    this.apis.delete(id)
    this.active.delete(id)
  }

  /**
   * Modules désactivés (parmi `switchable`) : les nouveaux désactivés sont arrêtés, les réactivés
   * sont activés aussitôt. Refusé si un module à désactiver a un serveur ou un client en marche.
   * Retourne la liste retenue.
   */
  async setDisabled(ids, switchable) {
    const wanted = new Set((Array.isArray(ids) ? ids : []).filter((id) => switchable.includes(id)))
    const stopping = this.modules.filter((m) => wanted.has(m.manifest.id) && this.active.has(m.manifest.id))
    const busy = stopping.filter((m) => m.busy?.())
    if (busy.length) throw new Error(t('errors.modulesBusy', { modules: busy.map(moduleName).join(', ') }))
    // Les modules transverses (simulateur, courbes) sont chargés après ceux dont ils lisent les
    // points : ils sont arrêtés avant eux.
    for (const mod of [...stopping].reverse()) await this.deactivate(mod)
    this.disabled = wanted
    for (const mod of this.modules) {
      if (!wanted.has(mod.manifest.id) && !this.active.has(mod.manifest.id)) await this.activate(mod)
    }
    return [...wanted]
  }

  /** Configuration d'un module convertie par son `migrateConfig` (inchangée s'il n'en a pas). */
  migrate(id, config, modules = this.modules) {
    const mod = modules.find((m) => m.manifest.id === id)
    return mod?.migrateConfig ? mod.migrateConfig(config) : config
  }

  /** Modules actifs, dans l'ordre de chargement. */
  activeModules() {
    return this.modules.filter((m) => this.active.has(m.manifest.id))
  }

  async dispose() {
    for (const mod of this.activeModules().reverse()) await this.deactivate(mod)
    this.modules = []
  }

  createContext(id) {
    const apis = this.apis
    const channels = new Set()
    return {
      dataDir: join(app.getPath('userData'), 'modules', id),
      config: () => ({}),
      channels,
      expose(api) {
        apis.set(id, api)
      },
      peers() {
        return [...apis].filter(([peer]) => peer !== id).map(([peer, api]) => ({ id: peer, api }))
      },
      handle(action, fn) {
        const channel = `${id}:${action}`
        handleChannel(channel, fn)
        channels.add(channel)
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
