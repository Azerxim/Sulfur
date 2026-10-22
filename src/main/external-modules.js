import { app } from 'electron'
import { randomUUID } from 'crypto'
import fs from 'fs/promises'
import { join } from 'path'
import { MODULE_PACKAGE_FILE, checkManifest, moduleT, packageManifest, t } from '@azerxim/sulfur-sdk'
import { readModuleArchive } from '@azerxim/sulfur-sdk/archive'
import { APP_VERSION } from '@shared/app'
import { loadModulePackages, packageDirs, provideSharedModules } from './module-packages'
import { loadPreferences } from './preferences'

/** Erreur d'un paquet refusé, avec le libellé de son problème ({ reason, params }). */
const packageError = ({ reason, params }) =>
  new Error(t('errors.modulePackage', { problem: t(`modules.problems.${reason}`, params) }))

/**
 * Modules externes installés dans `<userData>/module-packages`, chargés seulement si l'utilisateur
 * l'a demandé (Paramètres → Modules) : ces paquets ne sont pas signés (chacun peut créer le sien)
 * et leur code s'exécute avec les droits de l'application. Chargés après les modules intégrés (ils peuvent
 * utiliser leurs points) et actualisables sans redémarrer Sulfur (reload).
 *
 * Installation depuis une archive `.sulfur-module` en deux temps : `inspect` lit et vérifie
 * l'archive et retourne ce qu'il faut montrer à l'utilisateur (module, auteur, version installée),
 * puis `install` l'extrait une fois l'installation confirmée. `remove` supprime un paquet.
 */
export class ExternalModules {
  /** Paquets chargés à ce démarrage ou à la dernière actualisation. */
  enabled = false
  /** Paquets dont le module est chargé : [{ id, dir, descriptor }]. */
  packages = []
  /** Archive vérifiée en attente de confirmation : { token, descriptor, files }. */
  pending = null

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

  /** Refuse de continuer si un module externe chargé a un serveur ou un client en marche. */
  assertIdle() {
    const busy = this.host.activeModules().filter((m) => this.ids().includes(m.manifest.id) && m.busy?.())
    if (busy.length) {
      const names = busy.map((m) => moduleT(m.manifest.id)(`${m.manifest.id}.name`, null, m.manifest.name))
      throw new Error(t('errors.externalBusy', { modules: names.join(', ') }))
    }
  }

  /**
   * Actualisation : modules externes arrêtés et retirés, puis paquets relus selon le choix
   * enregistré dans les Paramètres. Refusée si un module externe a un serveur ou un client en marche.
   */
  async reload() {
    this.assertIdle()
    await this.host.unload(this.ids())
    const prefs = loadPreferences()
    await this.load(prefs.externalModules === true, [].concat(prefs.disabledModules ?? []))
  }

  /**
   * Paquets présents dans le dossier des paquets, chargés ou non :
   * [{ id, name, version, author, description, folder, loaded }]. Un dossier sans module.json
   * lisible est listé avec son nom (version « ? »), pour pouvoir le supprimer.
   */
  async installed() {
    const entries = await fs.readdir(this.dir, { withFileTypes: true }).catch(() => [])
    const list = []
    for (const entry of packageDirs(entries)) {
      let d = {}
      try {
        d = JSON.parse(await fs.readFile(join(this.dir, entry.name, MODULE_PACKAGE_FILE), 'utf8')) ?? {}
      } catch {
        // dossier sans descripteur lisible : listé sous son nom
      }
      const id = typeof d.id === 'string' ? d.id : entry.name
      list.push({
        id,
        name: typeof d.name === 'string' ? d.name : id,
        version: typeof d.version === 'string' ? d.version : '?',
        author: typeof d.author === 'string' ? d.author : null,
        description: typeof d.description === 'string' ? d.description : null,
        folder: entry.name,
        loaded: this.ids().includes(id)
      })
    }
    return list
  }

  /**
   * Lit et vérifie l'archive `buffer` (descripteur, fichiers, compatibilité, identifiant libre parmi
   * les modules intégrés) et la garde en attente de confirmation. Retourne
   * { token, id, name, version, author, description, files, size, installed } (`installed` : version
   * déjà installée, ou null). Lève une erreur qui décrit le problème si le paquet est refusé.
   */
  async inspect(buffer) {
    this.pending = null
    let archive
    try {
      archive = readModuleArchive(buffer)
    } catch (err) {
      if (err.problem) throw packageError(err.problem)
      throw err
    }
    const { descriptor, files } = archive
    const manifest = packageManifest(descriptor)
    const builtinIds = this.host.modules.map((m) => m.manifest.id).filter((id) => !this.ids().includes(id))
    const problem = checkManifest(manifest, { appVersion: APP_VERSION, loadedIds: builtinIds })
    if (problem) throw packageError(problem)

    const current = (await this.installed()).find((p) => p.id === manifest.id)
    this.pending = { token: randomUUID(), descriptor, files }
    return {
      token: this.pending.token,
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      author: manifest.author ?? null,
      description: manifest.description ?? null,
      files: files.size,
      size: [...files.values()].reduce((sum, data) => sum + data.length, 0),
      installed: current?.version ?? null
    }
  }

  /**
   * Installe l'archive vérifiée par `inspect` (après confirmation de l'utilisateur) dans
   * `<dossier des paquets>/<id>`, à la place de la version installée. Les fichiers sont d'abord
   * écrits dans un dossier caché, puis le dossier remplace l'ancien. Retourne { id, reload } :
   * `reload` indique qu'il faut actualiser les modules externes pour charger le paquet.
   */
  async install(token) {
    const pending = this.pending
    if (!pending || pending.token !== token) throw new Error(t('errors.packageExpired'))
    if (this.enabled) this.assertIdle()
    this.pending = null
    const { id } = pending.descriptor
    await fs.mkdir(this.dir, { recursive: true })
    const staging = join(this.dir, `.install-${id}-${randomUUID()}`)
    try {
      for (const [name, data] of pending.files) {
        const file = join(staging, ...name.split('/'))
        await fs.mkdir(join(file, '..'), { recursive: true })
        await fs.writeFile(file, data)
      }
      const previous = (await this.installed()).filter((p) => p.id === id)
      for (const p of previous) await fs.rm(join(this.dir, p.folder), { recursive: true, force: true })
      // Dossier du nom de l'identifiant occupé par autre chose qu'un paquet de ce module : on le garde.
      const taken = await fs
        .access(join(this.dir, id))
        .then(() => true)
        .catch(() => false)
      await fs.rename(staging, join(this.dir, taken ? `${id}-${pending.descriptor.version}` : id))
    } finally {
      await fs.rm(staging, { recursive: true, force: true })
    }
    return { id, reload: this.enabled }
  }

  /**
   * Supprime le paquet du module `id` (tous ses dossiers). Retourne { id, reload } : `reload`
   * indique qu'il faut actualiser les modules externes pour retirer le module chargé.
   */
  async remove(id) {
    const folders = (await this.installed()).filter((p) => p.id === id)
    if (!folders.length) throw new Error(t('errors.packageNotFound', { id }))
    const loaded = this.ids().includes(id)
    if (loaded) this.assertIdle()
    for (const p of folders) await fs.rm(join(this.dir, p.folder), { recursive: true, force: true })
    return { id, reload: loaded }
  }
}
