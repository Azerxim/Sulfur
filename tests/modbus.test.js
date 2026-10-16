import net from 'net'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ModbusServer } from '@modules/modbus/main/server'
import { ModbusClient } from '@modules/modbus/main/client'
import { ModbusPki } from '@modules/modbus/main/pki'
import { DEFAULT_SERVER_CONFIG, DEFAULT_SERVER_SECURITY } from '@modules/modbus/shared/constants'
import { t } from '@modules/modbus/shared/i18n'
import { migrateModbusConfig } from '@modules/modbus/shared/units'
import { errorOf, freePort, sleep, tempDir } from './helpers'

let tmp, serverPki, clientPki, server, logs, port
const DEFAULT_UNIT = DEFAULT_SERVER_CONFIG.units[0]
const DEFAULT_POINTS = DEFAULT_UNIT.points
const clients = []

/** Client suivi pour être déconnecté après chaque test. */
function newClient() {
  const client = new ModbusClient(clientPki, { onStatus() {}, onData() {} })
  clients.push(client)
  return client
}

async function start(security = {}, extra = {}) {
  port = await freePort()
  return server.start({
    ...DEFAULT_SERVER_CONFIG,
    port,
    ...extra,
    security: { ...DEFAULT_SERVER_SECURITY, ...security }
  })
}

const connect = (client, extra = {}) => client.connect({ host: '127.0.0.1', port, unitId: 1, timeout: 1000, ...extra })

const tls = (role, autoAcceptCertificates = true) => ({ security: { mode: 'tls', role, autoAcceptCertificates } })

beforeAll(async () => {
  tmp = await tempDir('modbus')
  serverPki = new ModbusPki(`${tmp.dir}/server`)
  clientPki = new ModbusPki(`${tmp.dir}/client`)
})

afterEach(async () => {
  for (const client of clients.splice(0)) await client.disconnect().catch(() => {})
  await server?.stop()
})

afterAll(() => tmp.cleanup())

function newServer() {
  logs = []
  server = new ModbusServer(serverPki, { onStatus() {}, onValues() {}, onLog: (entry) => logs.push(entry) })
}

describe('Modbus TCP', () => {
  beforeAll(newServer)

  it('lit les quatre tables et décode un Float32', async () => {
    await start()
    const client = newClient()
    await connect(client)
    const temperature = await client.readValue('holdingRegisters', 0, 'Float32', 'ABCD')
    expect(temperature).toBeGreaterThanOrEqual(14.99)
    expect(temperature).toBeLessThanOrEqual(25.01)
    expect(typeof (await client.readValue('coils', 0, 'Boolean'))).toBe('boolean')
    expect(await client.read('discreteInputs', 0, 8)).toHaveLength(8)
    expect(await client.read('inputRegisters', 0, 4)).toHaveLength(4)
  })

  it('écrit des registres et des coils, et met à jour les points du serveur', async () => {
    await start()
    const client = newClient()
    await connect(client)
    await client.writeValue('holdingRegisters', 10, -42, 'Int16')
    await sleep(50)
    expect(server.values()['pt-2']).toBe(-42)
    await client.write('holdingRegisters', 100, [1, 2, 3, 65535])
    expect(await client.read('holdingRegisters', 100, 4)).toEqual([1, 2, 3, 65535])
    await client.write('coils', 20, [true, false, true])
    expect(await client.read('coils', 20, 3)).toEqual([true, false, true])
  })

  it('refuse les écritures invalides', async () => {
    await start()
    const client = newClient()
    await connect(client)
    expect(await errorOf(client.write('inputRegisters', 0, [1]))).toBe(t('modbus.errors.readOnlyTable'))
    server.upsertPoint({ ...DEFAULT_POINTS[1], writable: false })
    expect(await errorOf(client.writeValue('holdingRegisters', 10, 5, 'Int16'))).toMatch(/^Exception 2\b/)
    expect(await errorOf(client.read('holdingRegisters', 9995, 10))).toMatch(/^Exception 2\b/)
  })

  it('modifie les points à chaud', async () => {
    await start()
    const client = newClient()
    await connect(client)
    const overlap = {
      id: 'x',
      name: 'Overlap',
      table: 'holdingRegisters',
      address: 1,
      dataType: 'UInt16',
      initialValue: 0,
      simulation: 'none',
      writable: true
    }
    expect(await errorOf(() => server.upsertPoint(overlap))).toBe(
      t('modbus.errors.pointsOverlap', { a: 'Temperature', b: 'Overlap' })
    )
    server.upsertPoint({
      id: 'n1',
      name: 'New',
      table: 'holdingRegisters',
      address: 200,
      dataType: 'UInt32',
      initialValue: 123456,
      simulation: 'none',
      writable: true
    })
    expect(await client.readValue('holdingRegisters', 200, 'UInt32')).toBe(123456)
    server.setValue('n1', 70000)
    expect(await client.readValue('holdingRegisters', 200, 'UInt32')).toBe(70000)
    server.removePoint('n1')
    expect(server.status().config.units[0].points.find((p) => p.id === 'n1')).toBeUndefined()
  })

  it("répond par l'exception 11 à un Unit ID inconnu", async () => {
    await start()
    const client = newClient()
    await connect(client, { unitId: 5 })
    expect(await errorOf(client.read('coils', 0, 1))).toMatch(/^Exception 11\b/)
  })

  it('ferme la connexion sur une trame invalide', async () => {
    await start()
    const raw = net.connect(port, '127.0.0.1')
    await new Promise((resolve) => raw.once('connect', resolve))
    raw.write(Buffer.from([0, 1, 0, 9, 0, 6, 1, 3, 0, 0, 0, 1])) // identifiant de protocole ≠ 0
    const closed = await new Promise((resolve) => {
      raw.once('close', () => resolve(true))
      setTimeout(() => resolve(false), 1000)
    })
    raw.destroy()
    expect(closed).toBe(true)
  })

  it("respecte l'ordre des mots configuré (CDAB)", async () => {
    const point = {
      id: 'f',
      name: 'F',
      table: 'holdingRegisters',
      address: 0,
      dataType: 'Float32',
      initialValue: 3.5,
      simulation: 'none',
      writable: true
    }
    await start({}, { wordOrder: 'CDAB', units: [{ ...DEFAULT_UNIT, points: [point] }] })
    const client = newClient()
    await connect(client)
    expect(await client.readValue('holdingRegisters', 0, 'Float32', 'CDAB')).toBe(3.5)
    expect(await client.readValue('holdingRegisters', 0, 'Float32', 'ABCD')).not.toBe(3.5)
  })
})

describe('Passerelle : plusieurs Unit ID', () => {
  beforeAll(newServer)

  const point = (id, name, address, initialValue) => ({
    id,
    name,
    table: 'holdingRegisters',
    address,
    dataType: 'UInt16',
    initialValue,
    simulation: 'none',
    writable: true
  })
  const units = [
    { id: 'u1', unitId: 1, name: 'Pompe', points: [point('p1', 'Vitesse', 0, 11)] },
    {
      id: 'u2',
      unitId: 7,
      name: 'Vanne',
      identity: { vendorName: 'ACME', productCode: 'V-200', revision: '2.3', productName: 'Vanne' },
      points: [point('p2', 'Vitesse', 0, 22), { ...point('p3', 'Fixe', 5, 3), writable: false }]
    }
  ]

  it('sert chaque équipement avec sa propre mémoire et refuse les autres Unit ID', async () => {
    await start({}, { units })
    const one = newClient()
    const seven = newClient()
    await connect(one, { unitId: 1 })
    await connect(seven, { unitId: 7 })
    expect(await one.read('holdingRegisters', 0, 1)).toEqual([11])
    expect(await seven.read('holdingRegisters', 0, 1)).toEqual([22])
    await seven.write('holdingRegisters', 0, [99])
    expect(server.values()).toMatchObject({ p1: 11, p2: 99 })

    const other = newClient()
    await connect(other, { unitId: 3 })
    expect(await errorOf(other.read('holdingRegisters', 0, 1))).toMatch(/^Exception 11\b/)
    expect(logs.some((l) => l.message.includes('1, 7'))).toBe(true)
  })

  it('répond au premier équipement pour tout Unit ID si demandé', async () => {
    await start({}, { units, anyUnitId: true })
    const client = newClient()
    await connect(client, { unitId: 42 })
    expect(await client.read('holdingRegisters', 0, 1)).toEqual([11])
  })

  it('ajoute, modifie et retire des équipements à chaud', async () => {
    await start({}, { units })
    server.addUnit({ id: 'u3', unitId: 9, name: 'Nouveau', points: [point('p4', 'X', 2, 5)] })
    const client = newClient()
    await connect(client, { unitId: 9 })
    expect(await client.read('holdingRegisters', 2, 1)).toEqual([5])
    expect(() => server.addUnit({ unitId: 7 })).toThrow(t('modbus.errors.unitExists', { unitId: 7 }))

    server.updateUnit({ id: 'u3', unitId: 10 })
    expect(await errorOf(client.read('holdingRegisters', 2, 1))).toMatch(/^Exception 11\b/)
    server.removeUnit('u3')
    expect(server.status().config.units.map((u) => u.id)).toEqual(['u1', 'u2'])
    expect(server.values().p4).toBeUndefined()
    server.removeUnit('u2')
    expect(() => server.removeUnit('u1')).toThrow(t('modbus.errors.lastUnit'))
  })

  it('accepte encore une configuration à un seul équipement (ancienne forme) et la convertit', async () => {
    const { units: _units, port: _port, ...legacy } = DEFAULT_SERVER_CONFIG
    await start({}, { ...legacy, unitId: 4, points: DEFAULT_POINTS, units: undefined })
    expect(server.status().config.units).toMatchObject([
      { unitId: 4, points: DEFAULT_POINTS.map((p) => ({ id: p.id })) }
    ])
    const migrated = migrateModbusConfig({ server: { ...legacy, unitId: 4, points: DEFAULT_POINTS }, client: {} })
    expect(migrated.server.units[0]).toMatchObject({ id: 'unit-1', unitId: 4 })
    expect(migrated.server.points).toBeUndefined()
    expect(migrateModbusConfig(migrated)).toBe(migrated)
  })

  it('lit et écrit en une requête (fonction 23), en respectant les points protégés', async () => {
    await start({}, { units })
    const client = newClient()
    await connect(client, { unitId: 7 })
    // Écriture faite avant la lecture : la plage lue contient déjà les valeurs écrites.
    expect(await client.readWrite(0, 3, 1, [100, 200])).toEqual([22, 100, 200])
    expect(await errorOf(client.readWrite(0, 1, 5, [1]))).toMatch(/^Exception 2\b/) // point Fixe protégé
    expect(await errorOf(client.readWrite(9999, 2, 0, [1]))).toMatch(/^Exception 2\b/)
  })

  it('identifie chaque équipement (fonction 43 / 14)', async () => {
    await start({}, { units })
    const seven = newClient()
    await connect(seven, { unitId: 7 })
    const regular = await seven.readDeviceIdentification(2)
    expect(regular.conformity).toBe(0x82)
    expect(Object.fromEntries(regular.objects.map((o) => [o.id, o.value]))).toMatchObject({
      0: 'ACME',
      1: 'V-200',
      2: '2.3',
      4: 'Vanne'
    })
    const basic = await seven.readDeviceIdentification(1)
    expect(basic.objects.map((o) => o.id)).toEqual([0, 1, 2])
    expect(await errorOf(seven.readDeviceIdentification(3))).toMatch(/^Exception 3\b/)

    const one = newClient()
    await connect(one, { unitId: 1 })
    const defaults = await one.readDeviceIdentification(2)
    expect(defaults.objects.find((o) => o.id === 0).value).toBe('Sulfur')
  })

  it('explore et modifie la mémoire brute d’un équipement', async () => {
    await start({}, { units })
    expect(server.registers('u2', 'holdingRegisters', 0, 6)).toEqual([22, 0, 0, 0, 0, 3])
    expect(server.registers('u2', 'holdingRegisters', 9998, 10)).toHaveLength(2)
    server.writeRegister('u2', 'holdingRegisters', 0, 1234)
    expect(server.values().p2).toBe(1234)
    server.writeRegister('u1', 'discreteInputs', 3, true)
    expect(server.registers('u1', 'discreteInputs', 3, 1)).toEqual([true])
    expect(() => server.writeRegister('u1', 'holdingRegisters', 0, 70000)).toThrow()
    expect(() => server.registers('u1', 'holdingRegisters', 0, 5000)).toThrow()
  })
})

describe('Barrières de sécurité (TCP)', () => {
  beforeAll(newServer)

  it('mode lecture seule global → exception 1', async () => {
    await start({ readOnly: true })
    const client = newClient()
    await connect(client)
    expect(await errorOf(client.write('coils', 0, [true]))).toMatch(/^Exception 1\b/)
  })

  it('limite de requêtes par seconde → exception 6', async () => {
    await start({ maxRequestsPerSecond: 5 })
    const client = newClient()
    await connect(client)
    const results = await Promise.all(Array.from({ length: 20 }, () => errorOf(client.read('coils', 0, 1))))
    expect(results.filter((r) => /^Exception 6\b/.test(r)).length).toBeGreaterThanOrEqual(10)
  })

  it("liste blanche d'adresses IP", async () => {
    await start({ allowedIps: ['10.0.0.0/8'] })
    expect(await errorOf(connect(newClient()))).toBe(t('modbus.errors.closedPlain'))
    expect(logs.some((l) => l.message === t('modbus.log.ipRefused', { ip: '127.0.0.1' }))).toBe(true)
    await server.stop()
    await start({ allowedIps: ['127.0.0.0/8', '::1'] })
    expect(await errorOf(connect(newClient()))).toBe('OK')
  })

  it('refuse une entrée de liste blanche invalide', async () => {
    expect(await errorOf(start({ allowedIps: ['300.1.1.1'] }))).toBe(
      t('modbus.errors.invalidAllowedIp', { entry: '300.1.1.1' })
    )
  })

  it('nombre maximal de connexions', async () => {
    await start({ maxConnections: 1 })
    await connect(newClient())
    expect(await errorOf(connect(newClient()))).toBe(t('modbus.errors.closedPlain'))
  })
})

describe('Modbus/TCP Security (TLS)', () => {
  beforeAll(newServer)

  it('chiffre la connexion et applique le rôle Operator', async () => {
    await start({ mode: 'tls' })
    expect(server.status().certificate?.commonName).toBe('MODBUS@Sulfur')
    const client = newClient()
    await connect(client, tls('Operator'))
    expect(client.status().tls.protocol).toMatch(/^TLSv1\.[23]$/)
    expect(server.status().connections[0].tls.role).toBe('Operator')
    await client.writeValue('holdingRegisters', 10, 7, 'Int16')
    expect(await client.readValue('holdingRegisters', 10, 'Int16')).toBe(7)
  })

  it('rôle Viewer : lecture autorisée, écriture refusée', async () => {
    await start({ mode: 'tls' })
    const client = newClient()
    await connect(client, tls('Viewer'))
    expect(await client.read('coils', 0, 1)).toHaveLength(1)
    expect(await errorOf(client.write('coils', 0, [true]))).toMatch(/^Exception 1\b/)
  })

  it('refuse un rôle inconnu ou un certificat sans rôle', async () => {
    await start({ mode: 'tls' })
    expect(await errorOf(connect(newClient(), tls('Pirate')))).toBe(t('modbus.errors.closedTls'))
    expect(logs.some((l) => l.message.includes(t('modbus.log.roleRefused', { role: 'Pirate' })))).toBe(true)
    expect(await errorOf(connect(newClient(), tls('')))).toBe(t('modbus.errors.closedTls'))
  })

  it('applique le rôle par défaut aux certificats sans rôle', async () => {
    await start({ mode: 'tls', defaultRole: 'Viewer' })
    expect(await errorOf(connect(newClient(), tls('')))).toBe('OK')
    expect(server.status().connections[0].tls.role).toBe('Viewer')
  })

  it('un client non chiffré ne peut pas dialoguer avec un serveur TLS', async () => {
    await start({ mode: 'tls' })
    const client = newClient()
    await connect(client).catch(() => {})
    expect(await errorOf(client.read('coils', 0, 1))).not.toBe('OK')
  })

  it('serveur : certificat client inconnu refusé puis accepté après approbation', async () => {
    for (const cert of (await serverPki.list()).trusted) await serverPki.remove(cert.thumbprint)
    await start({ mode: 'tls', autoAcceptCertificates: false })
    expect(await errorOf(connect(newClient(), tls('Operator')))).toBe(t('modbus.errors.closedTls'))
    const rejected = (await serverPki.list()).rejected
    expect(rejected).toHaveLength(1)
    expect(rejected[0].role).toBe('Operator')
    await serverPki.trust(rejected[0].thumbprint)
    expect(await errorOf(connect(newClient(), tls('Operator')))).toBe('OK')
    expect(logs.some((l) => l.level === 'warn' && l.message.includes(t('modbus.errors.certNotTrusted')))).toBe(true)
  })

  it('client : certificat serveur inconnu refusé puis accepté après approbation', async () => {
    for (const cert of (await clientPki.list()).trusted) await clientPki.remove(cert.thumbprint)
    await start({ mode: 'tls' })
    expect(await errorOf(connect(newClient(), tls('Operator', false)))).toBe(
      t('modbus.errors.serverCertRefused', { name: 'MODBUS@Sulfur', reason: t('modbus.errors.certNotTrusted') })
    )
    await clientPki.trust((await clientPki.list()).rejected[0].thumbprint)
    expect(await errorOf(connect(newClient(), tls('Operator', false)))).toBe('OK')
  })

  it('régénère le certificat client quand le rôle change', async () => {
    await start({ mode: 'tls' })
    await connect(newClient(), tls('Operator'))
    const before = (await clientPki.list()).own[0]
    await connect(newClient(), tls('Viewer'))
    const after = (await clientPki.list()).own[0]
    expect(after.thumbprint).not.toBe(before.thumbprint)
    expect(after.role).toBe('Viewer')
  })
})
