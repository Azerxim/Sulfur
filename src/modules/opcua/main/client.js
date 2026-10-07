import {
  OPCUAClient,
  AttributeIds,
  BrowseDirection,
  ClientMonitoredItem,
  ClientSubscription,
  DataType,
  MessageSecurityMode,
  NodeClass,
  SecurityPolicy,
  TimestampsToReturn,
  UserTokenType,
  Variant,
  VariantArrayType,
  constructEventFilter,
  findBasicDataType,
  resolveNodeId
} from 'node-opcua'
import { t } from '../shared/i18n'
import { DEFAULT_CLIENT_SECURITY } from '../shared/constants'
import { coerce, coerceArray, dataValueToPlain, toPlain } from './serialize'

/** Objet Server : source de tous les événements du serveur. */
const SERVER_OBJECT = 'i=2253'
/** ConditionType.ConditionRefresh : renvoie l'état courant des alarmes à l'abonnement. */
const CONDITION_TYPE = 'i=2782'
const CONDITION_REFRESH = 'i=3875'

/** Champs demandés pour chaque événement (clés des objets transmis à l'interface). */
const EVENT_FIELDS = {
  eventId: 'EventId',
  eventType: 'EventType',
  sourceName: 'SourceName',
  time: 'Time',
  message: 'Message',
  severity: 'Severity',
  conditionId: 'ConditionId',
  conditionName: 'ConditionName',
  active: 'ActiveState.Id',
  acked: 'AckedState.Id',
  retain: 'Retain'
}

const HISTORY_READ = 0x04

/** Client OPC UA : connexion, navigation, lecture/écriture, abonnements, méthodes, historique et événements. */
export class SimulationClient {
  client = null
  session = null
  subscription = null
  monitored = new Map()
  /** Dernière valeur reçue par variable surveillée : nodeId -> { value, dataType, statusCode, … } */
  last = new Map()
  eventItem = null
  endpointUrl = null
  security = null
  certificateManager = null
  /** NodeId de type -> nom affiché (types de données, types d'événements). */
  names = new Map()

  constructor(pki, onStatus, onDataChange, onEvent = () => {}) {
    this.pki = pki
    this.onStatus = onStatus
    this.onDataChange = onDataChange
    this.onEvent = onEvent
  }

  status() {
    return {
      connected: !!this.session,
      endpointUrl: this.endpointUrl,
      security: this.security && { mode: this.security.mode, policy: this.security.policy, auth: this.security.auth },
      monitored: [...this.monitored.keys()],
      events: !!this.eventItem
    }
  }

  createClient(security, certificateManager) {
    const secure = security.mode !== 'None'
    return OPCUAClient.create({
      applicationName: 'Sulfur OPC UA Client',
      endpointMustExist: false,
      securityMode: MessageSecurityMode[security.mode],
      securityPolicy: secure ? SecurityPolicy[security.policy] : SecurityPolicy.None,
      clientCertificateManager: certificateManager,
      connectionStrategy: { maxRetry: 1, initialDelay: 500, maxDelay: 2000 }
    })
  }

  /** Liste les endpoints (mode / politique / authentifications) proposés par un serveur. */
  async discover(endpointUrl) {
    const cm = await this.pki.createManager(true)
    const client = this.createClient(DEFAULT_CLIENT_SECURITY, cm)
    try {
      await client.connect(endpointUrl)
      const endpoints = await client.getEndpoints()
      return endpoints.map((e) => ({
        endpointUrl: e.endpointUrl,
        mode: MessageSecurityMode[e.securityMode],
        policy: e.securityPolicyUri.split('#')[1] ?? 'None',
        securityLevel: e.securityLevel,
        userTokens: [...new Set((e.userIdentityTokens ?? []).map((token) => UserTokenType[token.tokenType]))]
      }))
    } finally {
      await client.disconnect().catch(() => {})
      await cm.dispose().catch(() => {})
    }
  }

  async connect(endpointUrl, options = {}) {
    if (this.session) await this.disconnect()
    const security = { ...DEFAULT_CLIENT_SECURITY, ...options }
    if (security.mode !== 'None' && !SecurityPolicy[security.policy]) {
      throw new Error(t('opcua.errors.choosePolicy'))
    }

    const cm = await this.pki.createManager(!!security.autoAcceptCertificates)
    const client = this.createClient(security, cm)
    client.on('connection_lost', () => this.onStatus({ ...this.status(), connected: false, lost: true }))
    client.on('connection_reestablished', () => this.onStatus(this.status()))

    const identity =
      security.auth === 'username'
        ? { type: UserTokenType.UserName, userName: security.username, password: security.password }
        : { type: UserTokenType.Anonymous }

    try {
      await client.connect(endpointUrl)
      this.session = await client.createSession(identity)
    } catch (err) {
      await client.disconnect().catch(() => {})
      await cm.dispose().catch(() => {})
      throw new Error(explain(err), { cause: err })
    }
    this.certificateManager = cm
    // Le mot de passe n'est pas conservé une fois la session ouverte.
    this.security = { ...security, password: undefined }
    this.client = client
    this.endpointUrl = endpointUrl

    this.subscription = ClientSubscription.create(this.session, {
      requestedPublishingInterval: 250,
      requestedLifetimeCount: 100,
      requestedMaxKeepAliveCount: 10,
      maxNotificationsPerPublish: 100,
      publishingEnabled: true,
      priority: 10
    })
    // Sans écouteur, une erreur de l'abonnement (connexion coupée) ferait tomber le process principal ;
    // la perte de connexion est déjà signalée par `connection_lost`.
    this.subscription.on('error', () => {})

    this.onStatus(this.status())
    return this.status()
  }

  async disconnect() {
    this.monitored.clear()
    this.last.clear()
    this.eventItem = null
    this.names.clear()
    try {
      await this.subscription?.terminate()
      await this.session?.close()
      await this.client?.disconnect()
    } finally {
      this.subscription = null
      this.session = null
      this.client = null
      this.security = null
      await this.certificateManager?.dispose().catch(() => {})
      this.certificateManager = null
      this.onStatus(this.status())
    }
    return this.status()
  }

  requireSession() {
    if (!this.session) throw new Error(t('errors.notConnected'))
    return this.session
  }

  async browse(nodeId) {
    const result = await this.requireSession().browse({
      nodeId,
      browseDirection: BrowseDirection.Forward,
      referenceTypeId: 'HierarchicalReferences',
      includeSubtypes: true,
      nodeClassMask: 0,
      resultMask: 63
    })
    return (result.references ?? []).map((ref) => ({
      nodeId: ref.nodeId.toString(),
      browseName: ref.browseName.toString(),
      displayName: ref.displayName.text ?? ref.browseName.name,
      nodeClass: NodeClass[ref.nodeClass]
    }))
  }

  /** Nom d'un type (BrowseName), mis en cache pour la durée de la session. */
  async typeName(nodeId) {
    const key = nodeId.toString()
    if (!this.names.has(key)) {
      const dv = await this.requireSession().read({ nodeId, attributeId: AttributeIds.BrowseName })
      this.names.set(key, dv.value?.value?.name ?? key)
    }
    return this.names.get(key)
  }

  /** Type attendu par une variable ou un argument : { builtIn, array, dataTypeId, type (nom affiché) } */
  async typeInfo(dataTypeId, valueRank = -1) {
    const session = this.requireSession()
    const builtIn = DataType[await findBasicDataType(session, dataTypeId)]
    const array = valueRank >= 0
    return { builtIn, array, dataTypeId, type: `${await this.typeName(dataTypeId)}${array ? '[]' : ''}` }
  }

  /** Construit la valeur à écrire ou à passer en argument à partir de la saisie de l'utilisateur. */
  async toVariant(info, raw) {
    if (info.builtIn === 'ExtensionObject') {
      if (info.array) throw new Error(t('opcua.errors.writeUnsupported', { type: info.type }))
      let fields
      try {
        fields = typeof raw === 'string' ? JSON.parse(raw) : raw
      } catch {
        throw new Error(t('opcua.errors.invalidStruct', { value: raw }))
      }
      const value = await this.requireSession().constructExtensionObject(resolveNodeId(info.dataTypeId), fields ?? {})
      return new Variant({ dataType: DataType.ExtensionObject, value })
    }
    return new Variant({
      dataType: DataType[info.builtIn],
      arrayType: info.array ? VariantArrayType.Array : VariantArrayType.Scalar,
      value: info.array ? coerceArray(raw, info.builtIn) : coerce(raw, info.builtIn)
    })
  }

  async read(nodeId) {
    const session = this.requireSession()
    const [value, description, accessLevel, dataType, valueRank] = await session.read(
      [
        AttributeIds.Value,
        AttributeIds.Description,
        AttributeIds.UserAccessLevel,
        AttributeIds.DataType,
        AttributeIds.ValueRank
      ].map((attributeId) => ({ nodeId, attributeId }))
    )
    const plain = dataValueToPlain(value)
    const typeId = dataType.value?.value
    const access = accessLevel.value?.value ?? 0
    return {
      nodeId,
      ...plain,
      dataType: typeId ? (await this.typeInfo(typeId, valueRank.value?.value ?? -1)).type : plain.dataType,
      description: description.value?.value?.text ?? null,
      writable: (access & 0x02) !== 0,
      historizing: (access & HISTORY_READ) !== 0
    }
  }

  async write(nodeId, rawValue) {
    const session = this.requireSession()
    const [dataType, valueRank] = await session.read([
      { nodeId, attributeId: AttributeIds.DataType },
      { nodeId, attributeId: AttributeIds.ValueRank }
    ])
    const variant = await this.toVariant(
      await this.typeInfo(dataType.value.value, valueRank.value?.value ?? -1),
      rawValue
    )
    const statusCode = await session.write({ nodeId, attributeId: AttributeIds.Value, value: { value: variant } })
    if (!statusCode.isGood()) throw new Error(t('opcua.errors.writeRefused', { status: statusCode.name }))
    return { statusCode: statusCode.name, value: toPlain(variant.value) }
  }

  /** Valeurs historisées d'une variable entre `start` et `end` (ISO ou ms). */
  async history(nodeId, start, end = Date.now()) {
    const result = await this.requireSession().readHistoryValue(nodeId, new Date(start), new Date(end), {
      returnBounds: false
    })
    if (!result.statusCode.isGood())
      throw new Error(t('opcua.errors.historyRefused', { status: result.statusCode.name }))
    return (result.historyData?.dataValues ?? []).map(dataValueToPlain)
  }

  // --- Méthodes ------------------------------------------------------------------

  /** Objet parent et arguments d'une méthode. */
  async methodInfo(methodId) {
    const session = this.requireSession()
    const parents = await session.browse({
      nodeId: methodId,
      browseDirection: BrowseDirection.Inverse,
      referenceTypeId: 'HasComponent',
      includeSubtypes: true,
      nodeClassMask: 0,
      resultMask: 63
    })
    const objectId = parents.references?.[0]?.nodeId.toString()
    if (!objectId) throw new Error(t('opcua.errors.noMethodParent'))
    const { inputArguments = [], outputArguments = [] } = await session.getArgumentDefinition(resolveNodeId(methodId))
    const describe = (args) =>
      Promise.all(
        args.map(async (a) => ({
          name: a.name,
          description: a.description?.text ?? null,
          ...(await this.typeInfo(a.dataType, a.valueRank)),
          dataTypeId: a.dataType.toString()
        }))
      )
    return { objectId, methodId, inputs: await describe(inputArguments), outputs: await describe(outputArguments) }
  }

  /** Appelle une méthode ; `inputs` : saisies de l'utilisateur, dans l'ordre des arguments. */
  async call(methodId, inputs = []) {
    const info = await this.methodInfo(methodId)
    const inputArguments = await Promise.all(info.inputs.map((arg, i) => this.toVariant(arg, inputs[i] ?? '')))
    const result = await this.requireSession().call({ objectId: info.objectId, methodId, inputArguments })
    return {
      statusCode: result.statusCode.name,
      outputs: (result.outputArguments ?? []).map((v, i) => ({
        name: info.outputs[i]?.name ?? `#${i}`,
        value: toPlain(v.value)
      }))
    }
  }

  // --- Événements et alarmes -------------------------------------------------------

  /** S'abonne aux événements de l'objet Server, puis demande l'état courant des alarmes. */
  async subscribeEvents() {
    const session = this.requireSession()
    if (this.eventItem) return this.status()
    const keys = Object.keys(EVENT_FIELDS)
    const item = ClientMonitoredItem.create(
      this.subscription,
      { nodeId: SERVER_OBJECT, attributeId: AttributeIds.EventNotifier },
      {
        samplingInterval: 0,
        discardOldest: true,
        queueSize: 1000,
        filter: constructEventFilter(Object.values(EVENT_FIELDS))
      },
      TimestampsToReturn.Both
    )
    item.on('changed', (fields) => {
      // Une alarme désactivée (ou supprimée) renvoie un code d'état à la place de ses champs.
      const disabled = fields.some((f) => f?.dataType === DataType.StatusCode)
      const raw = Object.fromEntries(
        keys.map((key, i) => [key, fields[i]?.dataType === DataType.StatusCode ? null : (fields[i]?.value ?? null)])
      )
      this.eventToPlain(raw, disabled).then(this.onEvent, () => {})
    })
    this.eventItem = item
    await new Promise((resolve) => (item.monitoredItemId ? resolve() : item.once('initialized', resolve)))
    await session
      .call({
        objectId: CONDITION_TYPE,
        methodId: CONDITION_REFRESH,
        inputArguments: [{ dataType: DataType.UInt32, value: this.subscription.subscriptionId }]
      })
      .catch(() => {})
    this.onStatus(this.status())
    return this.status()
  }

  async unsubscribeEvents() {
    const item = this.eventItem
    this.eventItem = null
    await item?.terminate().catch(() => {})
    this.onStatus(this.status())
    return this.status()
  }

  async eventToPlain(raw, disabled) {
    return {
      disabled,
      eventId: raw.eventId ? raw.eventId.toString('hex') : null,
      eventType: raw.eventType ? await this.typeName(raw.eventType).catch(() => raw.eventType.toString()) : null,
      sourceName: raw.sourceName,
      time: raw.time?.toISOString() ?? null,
      message: raw.message?.text ?? null,
      severity: raw.severity,
      conditionId: raw.conditionId?.toString() ?? null,
      conditionName: raw.conditionName,
      active: raw.active,
      acked: raw.acked,
      retain: raw.retain
    }
  }

  /** Acquitte une alarme (`eventId` : identifiant hexadécimal du dernier événement de l'alarme). */
  async acknowledge(conditionId, eventId, comment = '') {
    const statusCode = await this.requireSession().acknowledgeCondition(
      resolveNodeId(conditionId),
      Buffer.from(eventId, 'hex'),
      String(comment)
    )
    if (!statusCode.isGood()) throw new Error(t('opcua.errors.ackRefused', { status: statusCode.name }))
    return statusCode.name
  }

  async subscribe(nodeId) {
    this.requireSession()
    if (this.monitored.has(nodeId)) return this.status()
    const item = ClientMonitoredItem.create(
      this.subscription,
      { nodeId, attributeId: AttributeIds.Value },
      { samplingInterval: 100, discardOldest: true, queueSize: 10 },
      TimestampsToReturn.Both
    )
    item.on('changed', (dv) => {
      const change = { nodeId, ...dataValueToPlain(dv) }
      this.last.set(nodeId, change)
      this.onDataChange(change)
    })
    item.on('err', (message) => this.onDataChange({ nodeId, value: null, statusCode: String(message) }))
    this.monitored.set(nodeId, item)
    this.onStatus(this.status())
    return this.status()
  }

  async unsubscribe(nodeId) {
    const item = this.monitored.get(nodeId)
    this.last.delete(nodeId)
    if (item) {
      this.monitored.delete(nodeId)
      await item.terminate().catch(() => {})
    }
    this.onStatus(this.status())
    return this.status()
  }
}

/** Rend les erreurs de sécurité les plus courantes compréhensibles. */
function explain(err) {
  const msg = err?.message ?? String(err)
  if (/BadIdentityTokenRejected|BadUserAccessDenied|BadIdentityTokenInvalid/.test(msg)) {
    return t('opcua.errors.authRefused', { details: msg })
  }
  if (/BadSecurityChecksFailed|BadCertificateUntrusted|BadCertificate/.test(msg)) {
    return t('opcua.errors.certRefused', { details: msg })
  }
  if (/ANONYMOUS user token policy/i.test(msg)) {
    return t('opcua.errors.noAnonymous')
  }
  if (/USERNAME user token policy/i.test(msg)) {
    return t('opcua.errors.noUsername')
  }
  if (/End point must exist|cannot find endpoint|BadSecurityPolicyRejected|BadSecurityModeRejected/i.test(msg)) {
    return t('opcua.errors.noEndpoint')
  }
  return msg
}
