import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { resolveAddress } from '@modules/s7/shared/address'
import { decodeValue, encodeValue, parseInput, toBoolean } from '@modules/s7/shared/codec'
import {
  ADDRESS_AREAS,
  API_DLL,
  DEFAULT_API_ROOT,
  DEFAULT_POLL_INTERVAL,
  OPERATION_TIMEOUTS,
  TEXT_TYPES
} from '../shared/constants'
import { t } from '../shared/i18n'
import { PlcsimBridge } from './bridge'

/** Rafraîchissement de la liste des instances (états, adresses IP). */
const INSTANCES_INTERVAL = 1000
/** Délai d'une lecture groupée des surveillances. */
const READ_TIMEOUT = 10_000

/** Libellés des champs d'une adresse IP (messages d'erreur). */
const IP_FIELDS = {
  ip: 'plcsim.instances.address',
  mask: 'plcsim.instances.mask',
  gateway: 'plcsim.instances.gateway'
}

const versionKey = (name) => name.split('.').map((n) => Number(n) || 0)
const compareVersions = (a, b) => {
  const [x, y] = [versionKey(a), versionKey(b)]
  for (let i = 0; i < Math.max(x.length, y.length); i++)
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0)
  return 0
}

/** Dossier de la version la plus récente de l'API sous `root` (sous-dossiers 3.0, 4.0…), ou null. */
export function detectApiPath(root = DEFAULT_API_ROOT, fsImpl = fs) {
  let entries
  try {
    entries = fsImpl.readdirSync(root, { withFileTypes: true })
  } catch {
    return null
  }
  const versions = entries
    .filter((e) => e.isDirectory() && /^\d+(\.\d+)*$/.test(e.name))
    .map((e) => e.name)
    .sort(compareVersions)
    .reverse()
  for (const version of versions) {
    const dir = path.join(root, version)
    if (fsImpl.existsSync(path.join(dir, API_DLL.x64)) || fsImpl.existsSync(path.join(dir, API_DLL.x86))) return dir
  }
  return null
}

/**
 * Chemin transmis au pont : DLL indiquée, dossier qui la contient, dossier racine de l'API (la
 * version la plus récente est choisie) ou, si rien n'est indiqué, installation par défaut.
 */
export function resolveApiPath(input, fsImpl = fs) {
  const value = String(input ?? '').trim()
  if (!value) {
    const found = detectApiPath(DEFAULT_API_ROOT, fsImpl)
    if (!found) throw new Error(t('plcsim.errors.apiNotFound', { path: DEFAULT_API_ROOT }))
    return found
  }
  let stat
  try {
    stat = fsImpl.statSync(value)
  } catch {
    throw new Error(t('plcsim.errors.pathNotFound', { path: value }))
  }
  if (stat.isFile()) return value
  if (fsImpl.existsSync(path.join(value, API_DLL.x64)) || fsImpl.existsSync(path.join(value, API_DLL.x86))) return value
  const found = detectApiPath(value, fsImpl)
  if (!found) throw new Error(t('plcsim.errors.apiNotFound', { path: value }))
  return found
}

/** Type d'appel par nom d'une variable de la table : type primitif, ou chaîne. */
export function tagType(tag) {
  if (['String', 'WString'].includes(tag.dataType)) return tag.dataType
  return tag.primitive
}

/** Valeur saisie convertie pour une écriture par nom. */
function tagValue(type, value) {
  if (type === 'Bool') return toBoolean(value)
  if (TEXT_TYPES.includes(type)) return String(value ?? '')
  const n = Number(typeof value === 'boolean' ? Number(value) : value)
  if (!Number.isFinite(n) || String(value).trim() === '') throw new Error(t('errors.invalidNumber', { value }))
  return ['Float', 'Double'].includes(type) ? n : Math.round(n)
}

/** Adresse d'une surveillance (zones I, Q, M uniquement). */
function areaAddress(text, dataType, length) {
  const address = resolveAddress(text, dataType, length)
  if (!ADDRESS_AREAS.includes(address.area)) throw new Error(t('plcsim.errors.areaOnly', { address: address.text }))
  return address
}

/**
 * Pilotage de S7-PLCSIM Advanced par son API Simulation Runtime, au travers du pont PowerShell :
 * instances (création, mise sous tension, RUN / STOP, effacement général, adresse IP), table des
 * variables et surveillances publiées comme points pour le simulateur et les courbes.
 *
 * Une surveillance désigne son instance par son nom (stable), une variable par son nom symbolique
 * (`kind: 'tag'`) ou une adresse d'entrée, de sortie ou de mémento (`kind: 'address'`).
 */
export class PlcsimManager {
  bridge = null
  info = null
  instances = []
  apiPath = null
  connecting = false
  error = null
  watches = new Map()
  /** Dernière lecture par surveillance : id -> { value, error, time } */
  last = new Map()
  pollInterval = DEFAULT_POLL_INTERVAL
  pollTimer = null
  instancesTimer = null
  polling = false
  /** Rafraîchissement de la liste des instances en cours (Promise), ou null. */
  refreshing = null

  constructor({
    dataDir,
    scriptSource,
    platform = process.platform,
    createBridge = (options) => new PlcsimBridge(options),
    onStatus = () => {},
    onData = () => {},
    onWatches = () => {}
  }) {
    this.dataDir = dataDir
    this.scriptSource = scriptSource
    this.platform = platform
    this.createBridge = createBridge
    this.onStatus = onStatus
    this.onData = onData
    this.onWatches = onWatches
  }

  status() {
    return {
      supported: this.platform === 'win32',
      connected: !!this.bridge,
      connecting: this.connecting,
      apiPath: this.apiPath,
      info: this.info,
      error: this.error,
      instances: this.instances,
      pollInterval: this.pollInterval,
      watches: [...this.watches.values()]
    }
  }

  emit() {
    this.onStatus(this.status())
  }

  // --- Connexion à l'API --------------------------------------------------------------------

  async connect({ apiPath } = {}) {
    if (this.platform !== 'win32') throw new Error(t('plcsim.errors.windowsOnly'))
    if (this.bridge || this.connecting) return this.status()
    this.connecting = true
    this.error = null
    this.emit()
    try {
      const resolved = resolveApiPath(apiPath)
      // Script du pont écrit avec une marque d'ordre d'octets : Windows PowerShell 5.1 lit sinon un
      // fichier sans BOM dans le jeu de caractères ANSI.
      const scriptPath = path.join(this.dataDir, 'bridge.ps1')
      fs.mkdirSync(this.dataDir, { recursive: true })
      fs.writeFileSync(scriptPath, `\uFEFF${this.scriptSource}`, 'utf8')
      const bridge = this.createBridge({ scriptPath, apiPath: resolved })
      this.info = await bridge.start()
      bridge.on('exit', (err) => {
        if (this.bridge !== bridge) return
        this.cleanup()
        this.error = err.message
        this.emit()
      })
      this.bridge = bridge
      this.apiPath = resolved
      await this.refreshInstances().catch(() => {})
      this.instancesTimer = setInterval(() => this.refreshInstances().catch(() => {}), INSTANCES_INTERVAL)
      this.startPolling()
      return this.status()
    } catch (err) {
      this.info = null
      this.error = err.message
      throw err
    } finally {
      this.connecting = false
      this.emit()
    }
  }

  async disconnect() {
    const bridge = this.bridge
    this.cleanup()
    this.error = null
    await bridge?.stop().catch(() => {})
    this.emit()
    return this.status()
  }

  cleanup() {
    clearInterval(this.pollTimer)
    clearInterval(this.instancesTimer)
    this.pollTimer = null
    this.instancesTimer = null
    this.bridge = null
    this.info = null
    this.instances = []
    this.last.clear()
  }

  call(method, params, timeout) {
    if (!this.bridge) return Promise.reject(new Error(t('plcsim.errors.notConnected')))
    return this.bridge.call(method, params, timeout)
  }

  // --- Instances ------------------------------------------------------------------------------

  /**
   * Relit la liste des instances. `force` : après une opération, attend un rafraîchissement lancé
   * après elle (celui qui serait déjà en cours peut renvoyer l'état d'avant l'opération).
   */
  async refreshInstances({ force = false } = {}) {
    if (!this.bridge) return this.instances
    if (this.refreshing) {
      if (!force) return this.instances
      await this.refreshing.catch(() => {})
    }
    const promise = this.call('instances').then((list) => {
      const instances = list ?? []
      if (JSON.stringify(instances) !== JSON.stringify(this.instances)) {
        this.instances = instances
        this.emit()
      }
      return instances
    })
    this.refreshing = promise
    try {
      return await promise
    } finally {
      if (this.refreshing === promise) this.refreshing = null
    }
  }

  /** Instance enregistrée par son nom. */
  instance(name) {
    const found = this.instances.find((i) => i.name === name)
    if (!found) throw new Error(t('plcsim.errors.unknownInstance', { name }))
    return found
  }

  async createInstance({ name, cpuType } = {}) {
    const clean = String(name ?? '').trim()
    if (!clean) throw new Error(t('plcsim.errors.emptyName'))
    if (this.instances.some((i) => i.name === clean)) throw new Error(t('plcsim.errors.duplicateName', { name: clean }))
    await this.call('create', { name: clean, cpuType: cpuType || null })
    await this.refreshInstances({ force: true })
    return this.status()
  }

  /** Opération sur une instance : powerOn, powerOff, run, stop, memoryReset, unregister. */
  async operate(name, operation) {
    if (!(operation in OPERATION_TIMEOUTS) && operation !== 'unregister')
      throw new Error(t('plcsim.errors.unknownOperation', { operation }))
    const { id } = this.instance(name)
    const timeout = OPERATION_TIMEOUTS[operation] ?? 30_000
    const result = await this.call(operation, { id, timeout }, timeout + 30_000)
    await this.refreshInstances({ force: true }).catch(() => {})
    // Mise sous tension : l'API renvoie un code (OK, ou un avertissement de licence par exemple).
    if (typeof result === 'string' && result !== 'OK')
      return { warning: t(`plcsim.runtimeErrors.${result}`, null, result) }
    return { warning: null }
  }

  async setIp(name, { interface: index = 0, ip, mask, gateway } = {}) {
    const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
    for (const [field, value] of Object.entries({ ip, mask, gateway: gateway || '0.0.0.0' })) {
      const m = ipv4.exec(String(value ?? '').trim())
      if (!m || m.slice(1).some((n) => Number(n) > 255))
        throw new Error(t('plcsim.errors.invalidIp', { field: t(IP_FIELDS[field]), value }))
    }
    const { id } = this.instance(name)
    await this.call('setIp', { id, interface: Number(index) || 0, ip, mask, gateway: gateway || '0.0.0.0' })
    await this.refreshInstances({ force: true }).catch(() => {})
    return this.status()
  }

  /** Table des variables d'une instance (programme chargé depuis TIA Portal). */
  async tags(name, { hmiOnly = true } = {}) {
    const { id } = this.instance(name)
    const tags = (await this.call('tags', { id, hmiOnly }, 60_000)) ?? []
    return tags.map((tag) => ({ ...tag, type: tagType(tag) }))
  }

  // --- Surveillances ----------------------------------------------------------------------------

  /** Ajoute une surveillance : { instance, kind: 'tag', name, type } ou { instance, kind: 'address', address, dataType }. */
  addWatch(item) {
    const instance = String(item.instance ?? '').trim()
    if (!instance) throw new Error(t('plcsim.errors.noInstance'))
    let watch
    if (item.kind === 'address') {
      const address = areaAddress(item.address, item.dataType, item.length)
      watch = {
        id: item.id ?? randomUUID(),
        instance,
        kind: 'address',
        address: address.text,
        dataType: item.dataType,
        length: address.length,
        label: item.label || ''
      }
    } else {
      const name = String(item.name ?? '').trim()
      if (!name) throw new Error(t('plcsim.errors.emptyTag'))
      watch = {
        id: item.id ?? randomUUID(),
        instance,
        kind: 'tag',
        name,
        type: item.type || 'Double',
        dataType: item.dataType || item.type,
        label: item.label || ''
      }
    }
    this.watches.set(watch.id, watch)
    this.onWatches([...this.watches.values()])
    this.emit()
    this.poll()
    return this.status()
  }

  removeWatch(id) {
    this.watches.delete(id)
    this.last.delete(id)
    this.onWatches([...this.watches.values()])
    this.emit()
    return this.status()
  }

  /** Surveillances enregistrées, restaurées au démarrage (les entrées invalides sont ignorées). */
  restoreWatches(list = []) {
    for (const item of Array.isArray(list) ? list : []) {
      if (!item?.id || !item.instance) continue
      if (item.kind === 'address') {
        try {
          areaAddress(item.address, item.dataType, item.length)
        } catch {
          continue
        }
      } else if (!item.name) continue
      this.watches.set(item.id, item)
    }
  }

  setPollInterval(ms) {
    const n = Number(ms)
    if (!Number.isFinite(n) || n < 100) throw new Error(t('plcsim.errors.minPoll'))
    this.pollInterval = n
    if (this.bridge) this.startPolling()
    this.emit()
    return this.status()
  }

  startPolling() {
    clearInterval(this.pollTimer)
    this.pollTimer = setInterval(() => this.poll(), this.pollInterval)
  }

  /** Lit toutes les surveillances en une requête au pont. */
  async poll() {
    if (this.polling || !this.bridge || !this.watches.size) return
    this.polling = true
    try {
      const time = new Date().toISOString()
      const watches = [...this.watches.values()]
      const items = []
      const plan = watches.map((w) => {
        const instance = this.instances.find((i) => i.name === w.instance)
        if (!instance) return { error: t('plcsim.errors.unknownInstance', { name: w.instance }) }
        if (instance.state === 'Off') return { error: t('plcsim.errors.instanceOff', { name: w.instance }) }
        if (w.kind === 'address') {
          const address = areaAddress(w.address, w.dataType, w.length)
          items.push({
            id: instance.id,
            kind: 'area',
            area: address.area,
            offset: address.offset,
            length: address.size
          })
          return { index: items.length - 1, address }
        }
        items.push({ id: instance.id, kind: 'tag', name: w.name, type: w.type })
        return { index: items.length - 1 }
      })
      let results = []
      if (items.length) {
        try {
          results = await this.call('read', { items }, READ_TIMEOUT)
        } catch (err) {
          results = items.map(() => ({ error: err.message }))
        }
      }
      watches.forEach((w, i) => {
        const step = plan[i]
        if (step.error) return this.received({ id: w.id, value: null, error: step.error, time })
        const result = results[step.index] ?? {}
        if (result.error !== undefined && result.error !== null) {
          const error = result.code ? t(`plcsim.runtimeErrors.${result.code}`, null, result.error) : result.error
          return this.received({ id: w.id, value: null, error, time })
        }
        let value = result.value
        if (step.address) {
          try {
            value = decodeValue(value ?? [], step.address.dataType, {
              bit: step.address.bit ?? 0,
              length: step.address.length
            })
          } catch (err) {
            return this.received({ id: w.id, value: null, error: err.message, time })
          }
        }
        this.received({ id: w.id, value, error: null, time })
      })
    } finally {
      this.polling = false
    }
  }

  received(data) {
    if (this.watches.has(data.id)) this.last.set(data.id, data)
    this.onData(data)
  }

  /** Écrit une valeur dans la variable ou à l'adresse d'une surveillance. */
  async writeWatch(id, value) {
    const watch = this.watches.get(id)
    if (!watch) throw new Error(t('plcsim.errors.unknownWatch'))
    const instance = this.instance(watch.instance)
    if (watch.kind === 'address') {
      const address = areaAddress(watch.address, watch.dataType, watch.length)
      const parsed = parseInput(value, watch.dataType)
      if (watch.dataType === 'Bool') {
        await this.call('writeBit', {
          id: instance.id,
          area: address.area,
          offset: address.offset,
          bit: address.bit,
          value: parsed
        })
      } else {
        const bytes = [...encodeValue(parsed, watch.dataType, address.length)]
        await this.call('writeArea', { id: instance.id, area: address.area, offset: address.offset, bytes })
      }
      return parsed
    }
    const parsed = tagValue(watch.type, value)
    await this.call('write', { id: instance.id, name: watch.name, type: watch.type, value: parsed })
    return parsed
  }
}
