import { connect as mqttConnect, connectAsync } from 'mqtt'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { MqttServer, convertValue, encodePayload } from '@modules/mqtt/main/server'
import { MqttClient } from '@modules/mqtt/main/client'
import { createPointsApi } from '@modules/mqtt/main/points'
import { isValidFilter, isValidTopic, matchTopic, payloadValue } from '@modules/mqtt/shared/topics'
import { ensureCertificate } from '@shared/certificate'
import { hashPassword } from '@shared/passwords'
import { errorOf, freePort, sleep, tempDir } from './helpers'

let server, client, pki, port

const topic = (extra = {}) => ({
  id: 'temp',
  topic: 'plant/temp',
  dataType: 'Number',
  initialValue: 21.5,
  simulation: 'none',
  period: 1000,
  min: 0,
  max: 100,
  interval: 0,
  qos: 0,
  retain: true,
  format: 'plain',
  writable: true,
  ...extra
})

async function start(extra = {}) {
  port = await freePort()
  return server.start({ host: '127.0.0.1', port, topics: [topic()], ...extra })
}

const connect = (extra = {}) =>
  client.connect({
    host: '127.0.0.1',
    port,
    subscriptions: [{ id: 's1', topic: 'plant/#', qos: 1, field: '' }],
    ...extra
  })

/** Attend qu'une condition soit vraie (2 s au plus). */
async function until(check) {
  for (let i = 0; i < 100 && !check(); i++) await sleep(20)
  return check()
}

beforeAll(async () => {
  pki = await tempDir('mqtt')
  server = new MqttServer(() => ensureCertificate(pki.dir, 'MQTT@Sulfur'))
  client = new MqttClient()
})

afterEach(async () => {
  await client.disconnect()
  server.setFaults([])
  await server.stop()
  server.clearLogs()
  client.clearMessages()
})

afterAll(() => pki.cleanup())

describe('Topics et contenus', () => {
  it('valide les topics et les filtres, applique les jokers', () => {
    expect(isValidTopic('a/b')).toBe(true)
    expect(isValidTopic('a/+')).toBe(false)
    expect(isValidFilter('a/+/c/#')).toBe(true)
    expect(isValidFilter('a/#/c')).toBe(false)
    expect(isValidFilter('a/b+')).toBe(false)
    expect(matchTopic('a/+/c', 'a/b/c')).toBe(true)
    expect(matchTopic('a/#', 'a')).toBe(true)
    expect(matchTopic('a/+', 'a/b/c')).toBe(false)
    expect(matchTopic('#', '$SYS/x')).toBe(false)
  })

  it('lit les valeurs des contenus et convertit les valeurs saisies', () => {
    expect(payloadValue('42.5')).toBe(42.5)
    expect(payloadValue('true')).toBe(true)
    expect(payloadValue('{"data":{"t":[1,2]}}', 'data.t.1')).toBe(2)
    expect(payloadValue('{oops')).toBe('{oops')
    expect(convertValue('Integer', '12')).toBe(12)
    expect(() => convertValue('Integer', '1.5')).toThrow()
    expect(convertValue('Boolean', 'on')).toBe(true)
    expect(encodePayload({ format: 'json' }, 3, Date.UTC(2026, 0, 1))).toBe(
      '{"value":3,"timestamp":"2026-01-01T00:00:00.000Z"}'
    )
  })
})

describe('Broker et client', () => {
  it('publie les topics simulés (retenus) et relaie les publications', async () => {
    await start()
    await connect()
    expect(await until(() => client.last.get('s1')?.value === 21.5)).toBe(true)
    expect(client.status().subscriptions[0].granted).toBe(1)
    await client.publish({ topic: 'plant/other', payload: 'hello', qos: 1 })
    expect(await until(() => client.last.get('s1')?.payload === 'hello')).toBe(true)
    expect(server.status().clients).toHaveLength(1)
    expect(server.topics().map((s) => s.topic)).toEqual(['plant/temp', 'plant/other'])
    expect(server.logs().map((e) => e.type)).toContain('subscribe')
  })

  it('modifie un topic simulé par <topic>/set et par un point', async () => {
    await start({ topics: [topic(), topic({ id: 'ro', topic: 'plant/ro', writable: false })] })
    await connect()
    await client.publish({ topic: 'plant/temp/set', payload: '{"value": 30}' })
    expect(await until(() => server.values().temp === 30)).toBe(true)
    await client.publish({ topic: 'plant/ro/set', payload: '5' })
    await sleep(100)
    expect(server.values().ro).toBe(21.5)

    const points = createPointsApi({ server, client })
    await points.write('server:temp', 40)
    expect(await until(() => client.last.get('s1')?.value === 40)).toBe(true)
    expect(points.read(['server:temp', 'server:$clients', 'client:s1'])).toEqual({
      'server:temp': 40,
      'server:$clients': 1,
      'client:s1': 40
    })
    expect(await errorOf(points.write('client:s1', 1))).toMatch(/read only/)
  })

  it('simulation périodique et défaut « valeurs figées »', async () => {
    await start({ updateRate: 20, topics: [topic({ simulation: 'ramp', period: 1000, interval: 50 })] })
    await sleep(200)
    const before = server.values().temp
    server.setFaults([{ id: 'f', type: 'freeze', points: ['temp'] }])
    const frozen = server.values().temp
    await sleep(150)
    expect(server.values().temp).toBe(frozen)
    expect(before).not.toBe(21.5)
  })

  it('authentification : anonyme refusé, mot de passe vérifié', async () => {
    const passwordHash = await hashPassword('secret')
    await start({ auth: { anonymous: false, users: [{ username: 'op', passwordHash }] } })
    expect(await errorOf(connect())).toMatch(/not authorized/)
    expect(await errorOf(connect({ username: 'op', password: 'wrong' }))).toMatch(/wrong user name or password/)
    expect(await errorOf(connect({ username: 'op', password: 'secret' }))).toBe('OK')
    expect(server.status().clients[0].username).toBe('op')
    expect(await errorOf(server.start({ auth: { anonymous: false, users: [] } }))).toMatch(/already/)
  })

  it('TLS avec certificat auto-signé', async () => {
    const status = await start({ tls: true })
    expect(status.url).toMatch(/^mqtts:/)
    expect(status.certificate.commonName).toBe('MQTT@Sulfur')
    expect(await errorOf(connect({ tls: true }))).toBe('OK')
    expect(await until(() => client.last.get('s1')?.value === 21.5)).toBe(true)
  })

  it('défauts : coupure, absence de réponse', async () => {
    await start()
    await connect()
    server.setFaults([{ id: 'f', type: 'cut' }])
    expect(await until(() => !client.connected)).toBe(true)
    await client.disconnect()
    expect(await errorOf(connect())).not.toBe('OK')
    server.setFaults([{ id: 'f', type: 'noResponse' }])
    expect(await errorOf(connect())).toMatch(/No response/)
  })

  it('refuse une configuration invalide', async () => {
    port = await freePort()
    expect(await errorOf(server.start({ port, topics: [topic({ topic: 'a/+' })] }))).toMatch(/Invalid topic/)
    expect(await errorOf(server.start({ port, topics: [topic(), topic({ id: 'b' })] }))).toMatch(/already simulated/)
    expect(await errorOf(server.start({ port, auth: { anonymous: false, users: [] } }))).toMatch(/Add a user/)
    expect(server.running).toBe(false)
    expect(await errorOf(connect({ subscriptions: [{ id: 'x', topic: 'a/#/b', qos: 0 }] }))).toMatch(/filter/)
  })
})

describe('Protocole du broker (3.1, 3.1.1, 5.0)', () => {
  const clients = []
  /** Client mqtt.js brut (fermé après chaque test). */
  async function raw(options = {}) {
    const c = await connectAsync({ host: '127.0.0.1', port, reconnectPeriod: 0, connectTimeout: 2000, ...options })
    clients.push(c)
    return c
  }
  /** Prochain message reçu par un client. */
  const next = (c) =>
    new Promise((resolve) =>
      c.once('message', (topic, payload, packet) => resolve({ topic, payload: payload.toString(), packet }))
    )

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((c) => c.endAsync(true).catch(() => {})))
  })

  it('MQTT 5.0 : propriétés transmises, identifiant attribué, identifiant d’abonnement', async () => {
    await start({ topics: [] })
    const sub = await raw({ protocolVersion: 5, clientId: '' })
    expect(server.status().clients[0].id).toMatch(/^sulfur_[0-9a-f]{12}$/)
    await sub.subscribeAsync('v5/#', { qos: 1, properties: { subscriptionIdentifier: 7 } })
    const pub = await raw({ protocolVersion: 5 })
    const received = next(sub)
    await pub.publishAsync('v5/a', 'x', {
      qos: 1,
      properties: { userProperties: { site: 'A' }, contentType: 'text/plain', messageExpiryInterval: 60 }
    })
    const { packet } = await received
    expect(packet.properties).toMatchObject({
      userProperties: { site: 'A' },
      contentType: 'text/plain',
      subscriptionIdentifier: 7
    })
    expect(packet.properties.messageExpiryInterval).toBeLessThanOrEqual(60)
    expect(
      server
        .status()
        .clients.map((c) => c.version)
        .sort()
    ).toEqual([5, 5])
  })

  it('MQTT 5.0 : alias de topic, no local, retain handling', async () => {
    await start({ topics: [] })
    const c = await raw({ protocolVersion: 5 })
    await c.subscribeAsync('alias/#', { qos: 0, nl: true })
    const other = await raw({ protocolVersion: 5 })
    await other.subscribeAsync('alias/#')
    let got = next(other)
    await c.publishAsync('alias/t', '1', { properties: { topicAlias: 3 } })
    expect((await got).topic).toBe('alias/t')
    got = next(other)
    await c.publishAsync('', '2', { properties: { topicAlias: 3 } })
    expect(await got).toMatchObject({ topic: 'alias/t', payload: '2' })
    // no local : `c` ne reçoit pas ses propres messages.
    let own = 0
    c.on('message', () => own++)
    await sleep(100)
    expect(own).toBe(0)

    await other.publishAsync('keep/me', 'R', { retain: true, qos: 1 })
    const late = await raw({ protocolVersion: 5 })
    let retained = 0
    late.on('message', () => retained++)
    await late.subscribeAsync('keep/#', { rh: 2 })
    await sleep(100)
    expect(retained).toBe(0)
    await late.subscribeAsync('keep/me', { rh: 0 })
    await sleep(100)
    expect(retained).toBe(1)
  })

  it('session persistante : messages QoS 1 conservés pendant la déconnexion', async () => {
    await start({ topics: [] })
    const first = await raw({
      protocolVersion: 5,
      clientId: 'persist',
      clean: false,
      properties: { sessionExpiryInterval: 60 }
    })
    await first.subscribeAsync('queue/#', { qos: 1 })
    await first.endAsync()
    const pub = await raw()
    await pub.publishAsync('queue/a', 'while offline', { qos: 1 })
    // Écouteurs posés avant la connexion : le message en attente arrive juste après le CONNACK.
    const again = mqttConnect({
      host: '127.0.0.1',
      port,
      reconnectPeriod: 0,
      protocolVersion: 5,
      clientId: 'persist',
      clean: false,
      properties: { sessionExpiryInterval: 60 }
    })
    clients.push(again)
    const connack = new Promise((resolve) => again.once('connect', resolve))
    const got = new Promise((resolve) => again.once('message', (topic, payload) => resolve(payload.toString())))
    expect((await connack).sessionPresent).toBe(true)
    expect(await got).toBe('while offline')
  })

  it('QoS 2 de bout en bout, MQTT 3.1 et 3.1.1', async () => {
    await start({ topics: [] })
    const v31 = await raw({ protocolVersion: 3, protocolId: 'MQIsdp', clientId: 'old-client' })
    await v31.subscribeAsync('q2/#', { qos: 2 })
    const pub = await raw({ protocolVersion: 4 })
    const got = next(v31)
    await pub.publishAsync('q2/x', 'exactly once', { qos: 2 })
    expect(await got).toMatchObject({ payload: 'exactly once', packet: { qos: 2 } })
    expect(server.status().clients.find((c) => c.id === 'old-client').version).toBe(3)
  })

  it('dernière volonté (délai MQTT 5.0) et reprise de session par un autre client', async () => {
    await start({ topics: [] })
    const watcher = await raw({ protocolVersion: 5 })
    await watcher.subscribeAsync('will/#')
    const dying = await raw({
      protocolVersion: 5,
      clientId: 'dying',
      will: {
        topic: 'will/dying',
        payload: Buffer.from('gone'),
        qos: 0,
        retain: false,
        properties: { willDelayInterval: 0 }
      }
    })
    const got = next(watcher)
    dying.stream.destroy()
    expect(await got).toMatchObject({ topic: 'will/dying', payload: 'gone' })

    const a = await raw({ clientId: 'same' })
    const closed = new Promise((resolve) => a.once('close', resolve))
    await raw({ clientId: 'same' })
    await closed
    expect(server.status().clients.filter((c) => c.id === 'same')).toHaveLength(1)
  })
})
