import { app } from 'electron'
import { join } from 'path'
import { moduleT, t } from '@azerxim/sulfur-sdk'
import { APP_VERSION } from '@shared/app'
import { loadModulePackages, provideSharedModules } from './module-packages'
import { loadPreferences } from './preferences'

/**
 * Modules externes installés dans `<userData>/module-packages`, chargés seulement si l'utilisateur
 * l'a demandé (Paramètres → Modules) : ces paquets ne sont pas encore signés et leur code
 * s'exécute avec les droits de l'application. Chargés après les modules intégrés (ils peuvent
 * utiliser leurs points) et actualisables sans redémarrer Sulfur (reload).
 */
export class ExternalModules {
  /** Paquets chargés à ce démarrage ou à la dernière actualisation. */
  enabled = false
  /** Paquets dont le module est chargé : [{ id, dir, descriptor }]. */
  packages = []

  constructor(host, { dir = join(app.getPath('userData'), 'module-packages'), importModule } = {}) {
    this.host = host
    this.dir = dir
    this.importModule = importModule
  }

  /** Identifiants des modules externes chargés. */
  ids() {
    return this.packages.map((p) => p.id)
  }

  /** Charge les paquets si `enabled` ; `disabled` : modules désactivés dans les Paramètres. */
  async load(enabled, disabled = []) {
    this.enabled = enabled
    this.packages = []
    if (!enabled) return
    provideSharedModules()
    const found = await loadModulePackages(this.dir, {
      appVersion: APP_VERSION,
      loadedIds: this.host.modules.map((m) => m.manifest.id),
      ...(this.importModule ? { importModule: this.importModule } : {})
    })
    const ids = found.modules.map((m) => m.manifest.id)
    await this.host.load(found.modules, { disabled: disabled.filter((id) => ids.includes(id)), external: true })
    this.host.rejected.push(...found.rejected.map((r) => ({ ...r, external: true })))
    this.packages = found.packages.filter((p) => this.host.configs.has(p.id))
  }

  /**
   * Actualisation : modules externes arrêtés et retirés, puis paquets relus selon le choix
   * enregistré dans les Paramètres. Refusée si un module externe a un serveur ou un client en marche.
   */
  async reload() {
    const busy = this.host.activeModules().filter((m) => this.ids().includes(m.manifest.id) && m.busy?.())
    if (busy.length) {
      const names = busy.map((m) => moduleT(m.manifest.id)(`${m.manifest.id}.name`, null, m.manifest.name))
      throw new Error(t('errors.externalBusy', { modules: names.join(', ') }))
    }
    await this.host.unload(this.ids())
    const prefs = loadPreferences()
    await this.load(prefs.externalModules === true, [].concat(prefs.disabledModules ?? []))
  }
}
