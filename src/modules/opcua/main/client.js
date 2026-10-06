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
  Variant
} from 'node-opcua'
import { coerce, dataValueToPlain, toPlain } from './serialize'

/** Client OPC UA : connexion, navigation, lecture/écriture et abonnements. */
export class SimulationClient {
  client = null
  session = null
  subscription = null
  monitored = new Map()
  endpointUrl = null

  constructor(onStatus, onDataChange) {
    this.onStatus = onStatus
    this.onDataChange = onDataChange
  }

  status() {
    return {
      connected: !!this.session,
      endpointUrl: this.endpointUrl,
      monitored: [...this.monitored.keys()]
    }
  }

  async connect(endpointUrl) {
    if (this.session) await this.disconnect()

    const client = OPCUAClient.create({
      applicationName: 'Sulfur OPC UA Client',
      endpointMustExist: false,
      securityMode: MessageSecurityMode.None,
      securityPolicy: SecurityPolicy.None,
      connectionStrategy: { maxRetry: 1, initialDelay: 500, maxDelay: 2000 }
    })
    client.on('connection_lost', () => this.onStatus({ ...this.status(), connected: false, lost: true }))
    client.on('connection_reestablished', () => this.onStatus(this.status()))

    try {
      await client.connect(endpointUrl)
      this.session = await client.createSession()
    } catch (err) {
      await client.disconnect().catch(() => {})
      throw err
    }
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
      this.onStatus(this.status())
    }
    return this.status()
  }

  requireSession() {
    if (!this.session) throw new Error('Client non connecté')
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
    if (!statusCode.isGood()) throw new Error(`Écriture refusée : ${statusCode.name}`)
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
