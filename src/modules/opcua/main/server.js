import {
  OPCUAServer,
  Variant,
  DataType,
  StatusCodes,
  MessageSecurityMode,
  SecurityPolicy,
  makeAccessLevelFlag,
  makeApplicationUrn
} from 'node-opcua'
import os from 'os'
import { t } from '../shared/i18n'
import { randomUUID } from 'crypto'
import { DEFAULT_SERVER_SECURITY } from '../shared/constants'
import { coerce, toPlain } from './serialize'
import { hashPassword, isPasswordHash, verifyPassword } from './passwords'
import { simulate } from '@shared/simulator'

const VALUES_EMIT_INTERVAL = 250

/** Identité de l'application serveur (nom du certificat : OPCUA@Sulfur). */
export const SERVER_IDENTITY = {
  commonName: 'OPCUA@Sulfur',
  applicationName: 'Sulfur OPC UA Server',
  applicationUri: makeApplicationUrn(os.hostname(), 'Sulfur:OPCUA-Server')
}

/**
 * Remplace les éventuels mots de passe en clair par leur empreinte scrypt.
 * Le résultat ne contient plus que { username, passwordHash }.
 */
export async function hashUsers(users = []) {
  return Promise.all(
    users.map(async (u) => {
      if (!u.username?.trim()) throw new Error(t('opcua.errors.userNoName'))
      const passwordHash = isPasswordHash(u.passwordHash)
        ? u.passwordHash
        : u.password
          ? await hashPassword(u.password)
          : null
      if (!passwordHash) throw new Error(t('opcua.errors.userNoPassword', { name: u.username }))
      return { username: u.username.trim(), passwordHash }
    })
  )
}

/** Traduit la configuration de sécurité en options OPCUAServer. */
export function securityOptions(security = DEFAULT_SERVER_SECURITY) {
  const modes = security.modes ?? []
  const secure = modes.filter((m) => m !== 'None')
  if (!modes.length) throw new Error(t('opcua.errors.noMode'))
  if (secure.length && !security.policies?.length) {
    throw new Error(t('opcua.errors.noPolicy'))
  }
  if (!security.allowAnonymous && !security.users?.length) {
    throw new Error(t('opcua.errors.noAuth'))
  }
  const users = security.users ?? []
  return {
    securityModes: modes.map((m) => MessageSecurityMode[m]),
    securityPolicies: [
      ...(modes.includes('None') ? [SecurityPolicy.None] : []),
      ...(secure.length ? security.policies.map((p) => SecurityPolicy[p]) : [])
    ],
    allowAnonymous: !!security.allowAnonymous,
    userManager: {
      isValidUserAsync: (username, password, callback) => {
        const user = users.find((u) => u.username === username)
        verifyPassword(password, user?.passwordHash).then(
          (ok) => callback(null, !!user && ok),
          (err) => callback(err)
        )
      }
    }
  }
}

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

  certificateManager = null

  constructor(pki, onStatus, onValues) {
    this.pki = pki
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
    if (this.server) throw new Error(t('errors.alreadyStarted'))
    const names = config.variables.map((v) => v.name)
    if (new Set(names).size !== names.length) throw new Error(t('opcua.errors.duplicateNames'))

    const security = { ...DEFAULT_SERVER_SECURITY, ...config.security }
    security.users = await hashUsers(security.users)
    const options = securityOptions(security)
    this.certificateManager = await this.pki.createManager(!!security.autoAcceptCertificates)
    await this.pki.ensureOwnCertificate(this.certificateManager, SERVER_IDENTITY)

    const server = new OPCUAServer({
      port: Number(config.port),
      resourcePath: config.resourcePath,
      ...options,
      serverCertificateManager: this.certificateManager,
      serverInfo: {
        applicationUri: SERVER_IDENTITY.applicationUri,
        applicationName: { text: SERVER_IDENTITY.applicationName, locale: 'fr' },
        productUri: 'Sulfur-OPCUA-Server'
      },
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
      this.config = { ...config, security, variables: [] }
      this.folder = addressSpace.getOwnNamespace().addFolder(addressSpace.rootFolder.objects, {
        browseName: config.rootFolder
      })
      for (const def of config.variables) this.createVariable({ ...def, id: def.id ?? randomUUID() })
      await server.start()
    } catch (err) {
      this.reset()
      await server.shutdown(0).catch(() => {})
      await this.disposeCertificateManager()
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
    await this.disposeCertificateManager()
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

  async disposeCertificateManager() {
    const cm = this.certificateManager
    this.certificateManager = null
    await cm?.dispose().catch(() => {})
  }

  requireRunning() {
    if (!this.server) throw new Error(t('errors.notStarted'))
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
    if (!def.name?.trim()) throw new Error(t('opcua.errors.emptyName'))
    for (const [id, v] of this.vars) {
      if (id !== def.id && v.def.name === def.name) throw new Error(t('opcua.errors.exists', { name: def.name }))
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
    if (!entry) throw new Error(t('opcua.errors.unknownVariable'))
    entry.value = coerce(raw, entry.def.dataType)
    this.onValues(this.values())
    return toPlain(entry.value)
  }

  setUpdateRate(rate) {
    this.requireRunning()
    const n = Number(rate)
    if (!Number.isFinite(n) || n < 10) throw new Error(t('errors.minPeriod', { min: 10 }))
    this.config = { ...this.config, updateRate: n }
    this.startSimulation()
    this.onStatus(this.status())
    return this.status()
  }

  // --- Interne ----------------------------------------------------------------

  createVariable(def) {
    const dataType = DataType[def.dataType]
    if (dataType === undefined) throw new Error(t('opcua.errors.unknownType', { type: def.dataType }))
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
      const elapsed = Date.now() - this.t0
      for (const entry of this.vars.values()) {
        if (entry.def.simulation === 'none') continue
        entry.value = simulate(entry.def, entry.value, elapsed, dt)
      }
    }, dt)
  }
}
