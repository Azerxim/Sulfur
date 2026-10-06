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
  Variant
} from 'node-opcua'
import { t } from '../shared/i18n'
import { DEFAULT_CLIENT_SECURITY } from '../shared/constants'
import { coerce, dataValueToPlain, toPlain } from './serialize'

/** Client OPC UA : connexion, navigation, lecture/écriture et abonnements. */
export class SimulationClient {
  client = null
  session = null
  subscription = null
  monitored = new Map()
  endpointUrl = null
  security = null
  certificateManager = null

  constructor(pki, onStatus, onDataChange) {
    this.pki = pki
    this.onStatus = onStatus
    this.onDataChange = onDataChange
  }

  status() {
    return {
      connected: !!this.session,
      endpointUrl: this.endpointUrl,
      security: this.security && { mode: this.security.mode, policy: this.security.policy, auth: this.security.auth },
      monitored: [...this.monitored.keys()]
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

    this.onStatus(this.status())
    return this.status()
  }

  async disconnect() {
    this.monitored.clear()
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

  async read(nodeId) {
    const session = this.requireSession()
    const [value, description, accessLevel] = await session.read([
      { nodeId, attributeId: AttributeIds.Value },
      { nodeId, attributeId: AttributeIds.Description },
      { nodeId, attributeId: AttributeIds.UserAccessLevel }
    ])
    return {
      nodeId,
      ...dataValueToPlain(value),
      description: description.value?.value?.text ?? null,
      writable: ((accessLevel.value?.value ?? 0) & 0x02) !== 0
    }
  }

  async write(nodeId, rawValue) {
    const session = this.requireSession()
    const current = await session.read({ nodeId, attributeId: AttributeIds.Value })
    const dataTypeName = DataType[current.value.dataType]
    const value = coerce(rawValue, dataTypeName)
    const statusCode = await session.write({
      nodeId,
      attributeId: AttributeIds.Value,
      value: { value: new Variant({ dataType: current.value.dataType, value }) }
    })
    if (!statusCode.isGood()) throw new Error(t('opcua.errors.writeRefused', { status: statusCode.name }))
    return { statusCode: statusCode.name, value: toPlain(value) }
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
    item.on('changed', (dv) => this.onDataChange({ nodeId, ...dataValueToPlain(dv) }))
    item.on('err', (message) => this.onDataChange({ nodeId, value: null, statusCode: String(message) }))
    this.monitored.set(nodeId, item)
    this.onStatus(this.status())
    return this.status()
  }

  async unsubscribe(nodeId) {
    const item = this.monitored.get(nodeId)
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
