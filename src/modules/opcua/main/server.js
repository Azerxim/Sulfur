import {
  OPCUAServer,
  Variant,
  VariantArrayType,
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
import {
  ALARM_LIMITS,
  DATA_TYPES,
  DEFAULT_SERVER_SECURITY,
  HISTORY_MAX_VALUES,
  METHOD_FAILURES,
  NUMERIC_TYPES
} from '../shared/constants'
import { coerce, coerceArray, coerceStruct, defaultValue, toPlain } from './serialize'
import { nodesetSources, structuresNodeset, TYPES_NAMESPACE, validateStructures } from './nodesets'
import { hashPassword, isPasswordHash, verifyPassword } from '@azerxim/sulfur-sdk/main'
import { simulate } from '@azerxim/sulfur-sdk'
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

const accessLevel = (def) =>
  makeAccessLevelFlag(
    ['CurrentRead', def.writable && 'CurrentWrite', def.historizing && 'HistoryRead'].filter(Boolean).join(' | ')
  )

const arrayLength = (def) => Math.max(0, Math.floor(Number(def.arrayLength) || 0))

/** Seuil défini (les champs vides ou non numériques sont ignorés). */
const limitValue = (raw) =>
  raw === '' || raw === null || raw === undefined || !Number.isFinite(Number(raw)) ? null : Number(raw)
const definedLimits = (def) => ALARM_LIMITS.filter((key) => limitValue(def[key]) !== null)
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)

const sameValue = (a, b) => {
  if (a === b) return true
  if (!(Array.isArray(a) || ArrayBuffer.isView(a)) || !(Array.isArray(b) || ArrayBuffer.isView(b))) return false
  return a.length === b.length && Array.prototype.every.call(a, (v, i) => v === b[i])
}

/** Valeur simulée d'une variable String : le nombre généré, en texte. */
const asText = (v) => (typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : String(v))

/**
 * Serveur OPC UA exposant des variables simulées sous Objects/<rootFolder>, ainsi que des méthodes,
 * des alarmes à seuils et des événements. Variables, méthodes et alarmes peuvent être ajoutées,
 * modifiées ou supprimées pendant que le serveur tourne ; les types structurés et les modèles
 * importés (NodeSet2) sont chargés au démarrage.
 */
export class SimulationServer {
  server = null
  folder = null
  simTimer = null
  emitTimer = null
  t0 = 0
  config = null
  /** Noms des fichiers NodeSet2 chargés. */
  nodesets = []
  /** id -> { def, node, value } */
  vars = new Map()
  /** id -> { def, node } */
  methods = new Map()
  /** id -> { def, node } (node null : alarme inactive, variable absente ou sans seuil) */
  alarms = new Map()
  /** nom -> { def, node } */
  structures = new Map()
  /** Défauts injectés par le simulateur : [{ id, type, params, points }] (points : ids de variables). */
  faults = []
  /** Connexions coupées (défaut « cut » appliqué aux endpoints). */
  cutApplied = false

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
      nodesets: this.nodesets,
      sessions: this.server?.currentSessionCount ?? 0
    }
  }

  /**
   * Démarre le serveur. `config.nodesets` : fichiers NodeSet2 importés
   * ([{ name, xml, models, requires }]), chargés avec le modèle standard.
   */
  async start(config) {
    if (this.server) throw new Error(t('errors.alreadyStarted'))
    const { nodesets: imported = [], ...rest } = config
    const structures = rest.structures ?? []
    const names = [...rest.variables, ...(rest.methods ?? []), ...(rest.alarms ?? [])].map((v) => v.name)
    if (new Set(names).size !== names.length) throw new Error(t('opcua.errors.duplicateNames'))
    validateStructures(structures)

    const sources = await nodesetSources(imported)
    if (structures.length) sources.push({ name: 'Sulfur types', source: structuresNodeset(structures) })

    const security = { ...DEFAULT_SERVER_SECURITY, ...rest.security }
    security.users = await hashUsers(security.users)
    const options = securityOptions(security)
    this.certificateManager = await this.pki.createManager(!!security.autoAcceptCertificates)
    await this.pki.ensureOwnCertificate(this.certificateManager, SERVER_IDENTITY)

    const server = new OPCUAServer({
      port: Number(rest.port),
      resourcePath: rest.resourcePath,
      nodesets: sources,
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
      // Méthodes standard des alarmes : ConditionRefresh, Acknowledge…
      addressSpace.installAlarmsAndConditionsService()
      this.server = server
      this.config = { ...rest, structures, security, variables: [], methods: [], alarms: [] }
      this.nodesets = imported.map((n) => n.name)
      const typesNs = structures.length ? addressSpace.getNamespace(TYPES_NAMESPACE) : null
      for (const def of structures) this.structures.set(def.name, { def, node: typesNs.findDataType(def.name) })
      // Le dossier est source d'événements : ils remontent jusqu'à l'objet Server.
      this.folder = addressSpace.getOwnNamespace().addFolder(addressSpace.rootFolder.objects, {
        browseName: rest.rootFolder,
        nodeId: `s=${rest.rootFolder}`,
        eventSourceOf: addressSpace.rootFolder.objects.server,
        eventNotifier: 1
      })
      const withId = (def) => ({ ...def, id: def.id ?? randomUUID() })
      for (const def of rest.variables) this.createVariable(withId(def))
      for (const def of rest.methods ?? []) this.createMethod(withId(def))
      for (const def of rest.alarms ?? []) this.createAlarm(withId(def))
      this.syncConfig()
      for (const endpoint of server.endpoints) endpoint.on('newChannel', (channel) => this.wrapChannel(channel))
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
    await this.applyCut()
    this.onStatus(this.status())
    return this.status()
  }

  async stop() {
    const server = this.server
    const cut = this.cutApplied
    this.reset()
    if (server && cut) await this.restoreEndpoints(server)
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
    this.nodesets = []
    this.cutApplied = false
    for (const map of [this.vars, this.methods, this.alarms, this.structures]) map.clear()
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

  /** Variables, méthodes et alarmes partagent le dossier racine : leurs noms doivent être uniques. */
  checkName(def) {
    if (!def.name?.trim()) throw new Error(t('opcua.errors.emptyName'))
    for (const map of [this.vars, this.methods, this.alarms]) {
      for (const [id, item] of map) {
        if (id !== def.id && item.def.name === def.name) throw new Error(t('opcua.errors.exists', { name: def.name }))
      }
    }
  }

  /**
   * Ajoute ou met à jour une variable. Un changement de nom, de type, de taille de tableau ou
   * d'historisation recrée le nœud (son NodeId peut changer) ; les autres paramètres sont appliqués
   * sans interruption.
   */
  upsertVariable(def) {
    this.requireRunning()
    this.checkName(def)

    const entry = this.vars.get(def.id)
    if (!entry) {
      this.createVariable(def)
    } else if (['name', 'dataType', 'arrayLength', 'historizing'].some((key) => entry.def[key] !== def[key])) {
      this.deleteVariable(def.id)
      this.createVariable(def)
    } else {
      entry.def = def
      entry.node.accessLevel = accessLevel(def)
      entry.node.userAccessLevel = accessLevel(def)
    }
    this.refreshAlarms(def.id)
    return this.changed()
  }

  removeVariable(id) {
    this.requireRunning()
    this.deleteVariable(id)
    this.refreshAlarms(id)
    return this.changed()
  }

  /** Force la valeur courante d'une variable (écrasée au prochain pas si elle est simulée). */
  setValue(id, raw) {
    this.requireRunning()
    const entry = this.vars.get(id)
    if (!entry) throw new Error(t('opcua.errors.unknownVariable'))
    this.assign(entry, raw)
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

  /** Ajoute ou remplace une méthode (le nœud est recréé). */
  upsertMethod(def) {
    this.requireRunning()
    this.checkName(def)
    this.deleteMethod(def.id)
    this.createMethod(def)
    return this.changed()
  }

  removeMethod(id) {
    this.requireRunning()
    this.deleteMethod(id)
    return this.changed()
  }

  /** Ajoute ou met à jour une alarme : un changement de seuil est appliqué sans recréer l'alarme. */
  upsertAlarm(def) {
    this.requireRunning()
    this.checkName(def)
    const entry = this.alarms.get(def.id)
    const sameShape =
      entry?.node &&
      entry.def.name === def.name &&
      entry.def.variable === def.variable &&
      definedLimits(entry.def).join() === definedLimits(def).join()
    if (sameShape) {
      entry.def = def
      for (const key of definedLimits(def)) entry.node[`set${capitalize(key)}Limit`](limitValue(def[key]))
      entry.node.updateState?.()
    } else {
      this.deleteAlarm(def.id)
      this.createAlarm(def)
    }
    return this.changed()
  }

  removeAlarm(id) {
    this.requireRunning()
    this.deleteAlarm(id)
    return this.changed()
  }

  /** Émet un événement (BaseEventType) depuis le dossier racine. */
  raiseEvent({ message = '', severity = 500 } = {}) {
    this.requireRunning()
    const level = Math.min(1000, Math.max(1, Math.round(Number(severity) || 500)))
    this.folder.raiseEvent('BaseEventType', {
      message: { dataType: DataType.LocalizedText, value: { text: String(message) } },
      severity: { dataType: DataType.UInt16, value: level }
    })
  }

  // --- Défauts injectés (module simulateur) ---------------------------------------

  /** Remplace les défauts actifs et les applique immédiatement. */
  async setFaults(faults = []) {
    this.faults = faults
    if (!this.server) return
    // Code d'état forcé : les valeurs courantes sont republiées avec le bon code.
    for (const entry of this.vars.values())
      entry.node.setValueFromSource(this.variantOf(entry.def, entry.value), this.statusOf(entry))
    await this.applyCut()
  }

  /** Défaut actif d'un type donné, éventuellement limité à une variable. */
  fault(type, variableId) {
    return this.faults.find(
      (f) => f.type === type && (variableId === undefined || !f.points?.length || f.points.includes(variableId))
    )
  }

  statusOf(entry) {
    const code = this.fault('badStatus', entry.def.id)?.params?.code
    return (code && StatusCodes[code]) || StatusCodes.Good
  }

  /** Retarde ou supprime les réponses d'un canal selon les défauts actifs. */
  wrapChannel(channel) {
    const send = channel.send_response.bind(channel)
    channel.send_response = (...args) => {
      if (this.fault('noResponse')) return
      const delay = Number(this.fault('delay')?.params?.ms) || 0
      if (delay > 0) return void setTimeout(() => send(...args), delay)
      return send(...args)
    }
  }

  /** Coupure : ferme les connexions et refuse les nouvelles tant que le défaut est actif. */
  async applyCut() {
    const cut = !!this.fault('cut')
    if (!this.server || cut === this.cutApplied) return
    this.cutApplied = cut
    if (!cut) return this.restoreEndpoints(this.server)
    for (const endpoint of this.server.endpoints) {
      // La suspension cesse aussitôt d'accepter les connexions mais n'aboutit qu'une fois les
      // connexions existantes fermées : on les coupe pendant qu'elle est en cours.
      const suspended = new Promise((resolve) => endpoint.suspendConnection(() => resolve()))
      endpoint.abruptlyInterruptChannels()
      await suspended
    }
  }

  async restoreEndpoints(server) {
    for (const endpoint of server.endpoints) {
      await new Promise((resolve) => endpoint.restoreConnection(() => resolve()))
    }
  }

  // --- Interne ----------------------------------------------------------------

  changed() {
    this.syncConfig()
    this.onStatus(this.status())
    return this.status()
  }

  nodeId(name) {
    return `s=${this.config.rootFolder}.${name}`
  }

  /** Convertit une saisie vers la valeur attendue par la variable (scalaire, tableau ou structure). */
  coerceFor(def, raw) {
    const struct = this.structures.get(def.dataType)
    if (struct) {
      return this.server.engine.addressSpace.constructExtensionObject(struct.node, coerceStruct(raw, struct.def.fields))
    }
    const length = arrayLength(def)
    return length ? coerceArray(raw, def.dataType, length) : coerce(raw, def.dataType)
  }

  variantOf(def, value) {
    const struct = this.structures.has(def.dataType)
    return new Variant({
      dataType: struct ? DataType.ExtensionObject : DataType[def.dataType],
      arrayType: !struct && arrayLength(def) ? VariantArrayType.Array : VariantArrayType.Scalar,
      value
    })
  }

  assign(entry, raw) {
    entry.value = this.coerceFor(entry.def, raw)
    entry.node.setValueFromSource(this.variantOf(entry.def, entry.value), this.statusOf(entry))
  }

  createVariable(def) {
    const struct = this.structures.get(def.dataType)
    if (!struct && !DATA_TYPES.includes(def.dataType)) {
      throw new Error(t('opcua.errors.unknownType', { type: def.dataType }))
    }
    const length = struct ? 0 : arrayLength(def)
    const addressSpace = this.server.engine.addressSpace
    const entry = { def, value: this.coerceFor(def, def.initialValue), node: null }

    entry.node = addressSpace.getOwnNamespace().addVariable({
      componentOf: this.folder,
      browseName: def.name,
      nodeId: this.nodeId(def.name),
      dataType: struct ? struct.node : def.dataType,
      valueRank: length ? 1 : -1,
      arrayDimensions: length ? [length] : undefined,
      accessLevel: accessLevel(def),
      userAccessLevel: accessLevel(def),
      minimumSamplingInterval: 50
    })
    entry.node.setValueFromSource(this.variantOf(def, entry.value), this.statusOf(entry))
    if (def.historizing) addressSpace.installHistoricalDataNode(entry.node, { maxOnlineValues: HISTORY_MAX_VALUES })
    // Écritures des clients (les droits d'accès sont vérifiés par node-opcua).
    entry.node.on('value_changed', (dataValue) => {
      entry.value = dataValue.value.value
    })
    this.vars.set(def.id, entry)
  }

  deleteVariable(id) {
    const entry = this.vars.get(id)
    if (!entry) return
    this.server.engine.addressSpace.deleteNode(entry.node)
    this.vars.delete(id)
  }

  createMethod(def) {
    const argument = (a) => {
      if (!a.name || !DATA_TYPES.includes(a.dataType))
        throw new Error(t('opcua.errors.invalidArgument', { name: def.name }))
      return {
        name: a.name,
        dataType: DataType[a.dataType],
        valueRank: a.array ? 1 : -1,
        ...(a.array ? { arrayDimensions: [0] } : {})
      }
    }
    const entry = { def, node: null }
    entry.node = this.server.engine.addressSpace.getOwnNamespace().addMethod(this.folder, {
      browseName: def.name,
      nodeId: this.nodeId(def.name),
      inputArguments: (def.inputs ?? []).map(argument),
      outputArguments: (def.outputs ?? []).map(argument)
    })
    // node-opcua distingue une fonction asynchrone d'une fonction à rappel par son nombre d'arguments.
    entry.node.bindMethod(async (inputs, _context) => this.callMethod(entry.def, inputs))
    this.methods.set(def.id, entry)
  }

  deleteMethod(id) {
    const entry = this.methods.get(id)
    if (!entry) return
    this.server.engine.addressSpace.deleteNode(entry.node)
    this.methods.delete(id)
  }

  /**
   * Exécute une méthode simulée :
   *  - echo : les sorties reprennent les entrées, dans l'ordre ;
   *  - variables : chaque entrée est écrite dans la variable du même nom, chaque sortie renvoie la
   *    variable du même nom (ou, à défaut, l'entrée du même nom) ;
   *  - fail : renvoie le code d'erreur configuré.
   */
  callMethod(def, inputs) {
    if (def.behavior === 'fail') {
      const code = METHOD_FAILURES.includes(def.statusCode) ? def.statusCode : 'BadInternalError'
      return { statusCode: StatusCodes[code] }
    }
    const args = Object.fromEntries((def.inputs ?? []).map((a, i) => [a.name, inputs[i]?.value]))
    const variable = (name) => [...this.vars.values()].find((v) => v.def.name === name)

    if (def.behavior === 'variables') {
      try {
        for (const [name, value] of Object.entries(args)) {
          const target = variable(name)
          if (target) this.assign(target, value)
        }
      } catch {
        return { statusCode: StatusCodes.BadInvalidArgument }
      }
    }

    try {
      const outputArguments = (def.outputs ?? []).map((out, i) => {
        const raw = def.behavior === 'echo' ? inputs[i]?.value : (variable(out.name)?.value ?? args[out.name])
        const value = out.array
          ? coerceArray(raw ?? [], out.dataType)
          : raw === undefined || raw === null
            ? defaultValue(out.dataType)
            : coerce(raw, out.dataType)
        return {
          dataType: DataType[out.dataType],
          arrayType: out.array ? VariantArrayType.Array : VariantArrayType.Scalar,
          value
        }
      })
      return { statusCode: StatusCodes.Good, outputArguments }
    } catch {
      return { statusCode: StatusCodes.BadTypeMismatch }
    }
  }

  /** Alarme à seuils exclusifs (ExclusiveLimitAlarmType) sur une variable numérique scalaire. */
  createAlarm(def) {
    const entry = { def, node: null }
    this.alarms.set(def.id, entry)
    const input = this.vars.get(def.variable)
    const limits = definedLimits(def)
    if (!input || !NUMERIC_TYPES.includes(input.def.dataType) || arrayLength(input.def) || !limits.length) return

    entry.node = this.server.engine.addressSpace
      .getOwnNamespace()
      .instantiateExclusiveLimitAlarm('ExclusiveLimitAlarmType', {
        browseName: def.name,
        nodeId: this.nodeId(def.name),
        conditionName: def.name,
        componentOf: this.folder,
        conditionSource: this.folder,
        conditionOf: this.folder,
        inputNode: input.node,
        ...Object.fromEntries(limits.map((key) => [`${key}Limit`, limitValue(def[key])]))
      })
    entry.node.updateState?.()
  }

  deleteAlarm(id) {
    const entry = this.alarms.get(id)
    if (!entry) return
    if (entry.node) {
      // L'alarme désactivée ignore les changements de sa variable, dont elle reste abonnée.
      entry.node.setEnabledState(false)
      this.server.engine.addressSpace.deleteNode(entry.node)
    }
    this.alarms.delete(id)
  }

  /** Recrée les alarmes d'une variable recréée, ajoutée ou supprimée. */
  refreshAlarms(variableId) {
    for (const { def } of [...this.alarms.values()].filter((a) => a.def.variable === variableId)) {
      this.deleteAlarm(def.id)
      this.createAlarm(def)
    }
  }

  syncConfig() {
    const defs = (map) => [...map.values()].map((v) => v.def)
    this.config = { ...this.config, variables: defs(this.vars), methods: defs(this.methods), alarms: defs(this.alarms) }
  }

  startSimulation() {
    clearInterval(this.simTimer)
    const dt = Number(this.config.updateRate) || 100
    this.simTimer = setInterval(() => {
      const elapsed = Date.now() - this.t0
      for (const entry of this.vars.values()) {
        const { def } = entry
        if (def.simulation === 'none' || this.structures.has(def.dataType) || this.fault('freeze', def.id)) continue
        const step = (current, t) => {
          const v = simulate(def, current, t, dt)
          return def.dataType === 'String' ? asText(v) : v
        }
        const length = arrayLength(def)
        // Éléments d'un tableau : même générateur, déphasé d'un élément à l'autre.
        const next = length
          ? Array.from({ length }, (_, i) =>
              step(entry.value?.[i], elapsed + (i * (Number(def.period) || 1000)) / length)
            )
          : step(entry.value, elapsed)
        if (sameValue(next, entry.value)) continue
        try {
          this.assign(entry, next)
        } catch {
          // valeur hors du type (ex. bornes négatives pour un entier non signé) : ce pas est ignoré
        }
      }
    }, dt)
  }
}
