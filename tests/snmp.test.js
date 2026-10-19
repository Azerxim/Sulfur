import dgram from 'dgram'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { SnmpAgent, validateObject } from '@modules/snmp/main/agent'
import { SnmpManager } from '@modules/snmp/main/manager'
import { createPointsApi } from '@modules/snmp/main/points'
import { convertValue } from '@modules/snmp/main/values'
import { errorOf, sleep } from './helpers'

let agent, manager, port

const BASE = '1.3.6.1.4.1.32473.9'

const object = (extra = {}) => ({
  id: 'temp',
  name: 'temp',
  oid: `${BASE}.1`,
  type: 'Integer',
  initialValue: 21,
  simulation: 'none',
  period: 1000,
  min: 0,
  max: 100,
  writable: true,
  ...extra
})

const USER = {
  name: 'admin',
  level: 'authPriv',
  authProtocol: 'sha',
  authKey: 'authpass123',
  privProtocol: 'aes',
  privKey: 'privpass123'
}

/** Port UDP libre. */
function freeUdpPort() {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4')
    socket.bind(0, '127.0.0.1', () => {
      const { port: p } = socket.address()
      socket.close(() => resolve(p))
    })
  })
}

async function start(extra = {}) {
  port = await freeUdpPort()
  return agent.start({
    host: '127.0.0.1',
    port,
    users: [USER],
    objects: [
      object(),
      object({ id: 'name', oid: `${BASE}.2`, type: 'OctetString', initialValue: 'pump', writable: false })
    ],
    traps: { oid: `${BASE}.0.1`, objects: ['temp'], targets: [] },
    ...extra
  })
}

const target = (extra = {}) => ({
  host: '127.0.0.1',
  port,
  version: 'v2c',
  community: 'public',
  timeout: 500,
  retries: 0,
  ...extra
})
const request = (operation, oid, extra = {}, targetExtra = {}) =>
  manager.request(target(targetExtra), { operation, oid, ...extra })

beforeAll(() => {
  agent = new SnmpAgent()
  manager = new SnmpManager()
})

afterEach(async () => {
  agent.setFaults([])
  await manager.close()
  manager.clearTraps()
  await agent.stop()
})

describe('Valeurs et objets', () => {
  it('convertit les valeurs selon le type', () => {
    expect(convertValue('Integer', '42')).toBe(42)
    expect(convertValue('Counter32', 3.6)).toBe(4)
    expect(() => convertValue('Gauge32', -1)).toThrow()
    expect(convertValue('IpAddress', '10.0.0.1')).toBe('10.0.0.1')
    expect(() => convertValue('IpAddress', '10.0.0')).toThrow()
    expect(convertValue('OID', '.1.3.6')).toBe('1.3.6')
  })

  it('refuse les OID invalides, système ou qui se chevauchent', () => {
    expect(() => validateObject(object({ oid: '1.3.x' }))).toThrow(/Invalid OID/)
    expect(() => validateObject(object({ oid: '1.3.6.1.2.1.1.9' }))).toThrow(/system group/)
    expect(() => validateObject(object({ id: 'b', oid: `${BASE}.1.5` }), [object()])).toThrow(/overlaps/)
  })
})

describe('Agent et manager', () => {
  it('Get, GetNext, GetBulk et walk en v2c', async () => {
    const status = await start()
    expect(status.engineId).toMatch(/^[0-9a-f]+$/)
    const get = await request('get', `1.3.6.1.2.1.1.5.0 ${BASE}.1.0 ${BASE}.2.0`)
    expect(get.varbinds.map((vb) => [vb.type, vb.value])).toEqual([
      ['OctetString', 'sulfur-agent'],
      ['Integer', 21],
      ['OctetString', 'pump']
    ])
    const next = await request('getNext', `${BASE}.1.0`)
    expect(next.varbinds[0]).toMatchObject({ oid: `${BASE}.2.0`, value: 'pump' })
    const bulk = await request('getBulk', '1.3.6.1.2.1.1', { maxRepetitions: 3 })
    expect(bulk.varbinds.map((vb) => vb.oid)).toEqual(['1.3.6.1.2.1.1.1.0', '1.3.6.1.2.1.1.2.0', '1.3.6.1.2.1.1.3.0'])
    const walk = await request('walk', '1.3.6.1.2.1.1')
    expect(walk.varbinds).toHaveLength(7)
    expect((await request('get', '1.3.6.1.2.1.1.3.0')).varbinds[0].type).toBe('TimeTicks')
    expect((await request('get', `${BASE}.7.0`)).varbinds[0].error).toBe(true)
    expect(agent.requests).toBeGreaterThanOrEqual(6)
  })

  it('Set : communauté en écriture, objet en lecture seule, type invalide', async () => {
    await start()
    expect(await errorOf(request('set', `${BASE}.1.0`, { type: 'Integer', value: 50 }))).toMatch(/Error returned/)
    await request('set', `${BASE}.1.0`, { type: 'Integer', value: 50 }, { community: 'private' })
    expect(agent.values().temp).toBe(50)
    expect(
      await errorOf(request('set', `${BASE}.2.0`, { type: 'OctetString', value: 'x' }, { community: 'private' }))
    ).toMatch(/Error returned/)
    await request('set', '1.3.6.1.2.1.1.6.0', { type: 'OctetString', value: 'Bench 2' }, { community: 'private' })
    expect((await request('get', '1.3.6.1.2.1.1.6.0')).varbinds[0].value).toBe('Bench 2')
  })

  it('SNMPv3 authPriv et v1, communauté inconnue', async () => {
    await start()
    const v3 = await request('get', `${BASE}.1.0`, {}, { version: 'v3', user: USER })
    expect(v3.varbinds[0].value).toBe(21)
    expect(
      await errorOf(request('get', `${BASE}.1.0`, {}, { version: 'v3', user: { ...USER, privKey: 'wrongpass1' } }))
    ).not.toBe('OK')
    expect((await request('get', `${BASE}.2.0`, {}, { version: 'v1' })).varbinds[0].value).toBe('pump')
    expect(await errorOf(request('getBulk', '1.3', {}, { version: 'v1' }))).toMatch(/SNMPv1/)
    expect(await errorOf(request('get', `${BASE}.1.0`, {}, { community: 'nope' }))).toMatch(/No response/)
  })

  it('simulation, valeurs figées et défauts', async () => {
    // Valeur initiale hors de la plage de la rampe (0 à 100) : toute valeur simulée en diffère.
    await start({ updateRate: 20, objects: [object({ simulation: 'ramp', period: 500, initialValue: -1 })] })
    await sleep(120)
    const points = createPointsApi({ agent, manager })
    expect(points.read(['server:temp'])['server:temp']).not.toBe(-1)
    points.setFaults([{ id: 'f', type: 'freeze', points: ['server:temp'] }])
    const frozen = agent.values().temp
    await sleep(80)
    expect(agent.values().temp).toBe(frozen)

    agent.setFaults([{ id: 'e', type: 'exception', params: { code: 5, scope: 'read' } }])
    expect(await errorOf(request('get', `${BASE}.1.0`))).toMatch(/GeneralError/)
    agent.setFaults([{ id: 'n', type: 'noResponse' }])
    expect(await errorOf(request('get', `${BASE}.1.0`))).toMatch(/No response/)
    agent.setFaults([{ id: 'd', type: 'delay', params: { ms: 200 } }])
    const t0 = Date.now()
    await request('get', `${BASE}.1.0`, {}, { timeout: 1000 })
    expect(Date.now() - t0).toBeGreaterThanOrEqual(190)
    expect(agent.logs().some((e) => e.dropped)).toBe(true)
  })

  it('surveillance : points du manager et écriture par Set', async () => {
    await start()
    const config = target({
      community: 'private',
      monitors: [{ id: 'm1', oid: `${BASE}.1.0`, label: 't' }],
      pollInterval: 10
    })
    await manager.startPolling(config)
    const points = createPointsApi({ agent, manager })
    expect(points.read(['client:m1'])['client:m1']).toBe(21)
    await points.write('client:m1', 33)
    expect(agent.values().temp).toBe(33)
    expect(points.read(['client:m1'])['client:m1']).toBe(33)
  })

  it('notifications v1, v2c et v3 (traps et informs) reçues par le récepteur', async () => {
    const trapPort = await freeUdpPort()
    await start({
      traps: {
        oid: `${BASE}.0.1`,
        objects: ['temp'],
        targets: [
          { id: 'a', host: '127.0.0.1', port: trapPort, version: 'v2c', community: 'public', inform: false },
          { id: 'b', host: '127.0.0.1', port: trapPort, version: 'v2c', community: 'public', inform: true },
          { id: 'c', host: '127.0.0.1', port: trapPort, version: 'v1', community: 'public', inform: false },
          { id: 'd', host: '127.0.0.1', port: trapPort, version: 'v3', user: 'admin', inform: false },
          { id: 'e', host: '127.0.0.1', port: trapPort, version: 'v3', user: 'admin', inform: true },
          { id: 'f', host: '127.0.0.1', port: trapPort, version: 'v3', user: 'nobody', inform: false }
        ]
      }
    })
    await manager.startReceiver({ receiver: { host: '127.0.0.1', port: trapPort }, user: USER })
    const results = await agent.sendTrap()
    expect(results.map((r) => r.ok)).toEqual([true, true, true, true, true, false])
    expect(results[5].error).toMatch(/nobody/)
    for (let i = 0; i < 50 && manager.traps.length < 5; i++) await sleep(20)
    const byType = manager.traps.map((n) => `${n.version}/${n.type}`).sort()
    expect(byType).toEqual(['v1/trap', 'v2c/inform', 'v2c/trap', 'v3/inform', 'v3/trap'])
    const v3 = manager.traps.find((n) => n.version === 'v3' && n.type === 'trap')
    expect(v3).toMatchObject({ user: 'admin', trapOid: `${BASE}.0.1` })
    expect(v3.varbinds).toEqual([{ oid: `${BASE}.1.0`, type: 'Integer', value: 21 }])
    const v2 = manager.traps.find((n) => n.version === 'v2c')
    expect(v2.trapOid).toBe(`${BASE}.0.1`)
    expect(v2.varbinds).toEqual([{ oid: `${BASE}.1.0`, type: 'Integer', value: 21 }])
    expect(agent.status().trapsSent).toBe(5)
  })

  it('port occupé et configuration invalide', async () => {
    await start()
    const other = new SnmpAgent()
    expect(await errorOf(other.start({ host: '127.0.0.1', port }))).toMatch(/already in use/)
    expect(await errorOf(other.start({ port: 70000 }))).toMatch(/Invalid port/)
    expect(await errorOf(other.start({ users: [{ ...USER, authKey: 'short' }] }))).toMatch(/at least 8/)
    expect(await errorOf(other.start({ engineId: 'xyz' }))).toMatch(/engine ID/)
    expect(other.running).toBe(false)
  })
})
