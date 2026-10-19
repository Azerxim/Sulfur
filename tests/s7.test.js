import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { S7Server } from '@modules/s7/main/server'
import { S7Client } from '@modules/s7/main/client'
import { createPointsApi } from '@modules/s7/main/points'
import { DEFAULT_SERVER_CONFIG } from '@modules/s7/shared/constants'
import { formatAddress, parseAddress, resolveAddress } from '@modules/s7/shared/address'
import { decodeValue, encodeValue } from '@modules/s7/shared/codec'
import { parseTsap, remoteTsap } from '@modules/s7/main/protocol'
import { errorOf, freePort, sleep } from './helpers'

describe('Adresses S7', () => {
  it('lit les notations internationale et allemande', () => {
    expect(parseAddress('DB1.DBX2.3')).toEqual({ area: 'DB', db: 1, size: 'X', offset: 2, bit: 3 })
    expect(parseAddress('%db10.dbd4')).toEqual({ area: 'DB', db: 10, size: 'D', offset: 4, bit: null })
    expect(parseAddress('E0.1')).toEqual({ area: 'I', db: 0, size: 'X', offset: 0, bit: 1 })
    expect(parseAddress('AW2')).toMatchObject({ area: 'Q', size: 'W', offset: 2 })
    expect(parseAddress('MD10')).toMatchObject({ area: 'M', size: 'D', offset: 10 })
    expect(parseAddress('IB3')).toMatchObject({ area: 'I', size: 'B', offset: 3, bit: null })
  })

  it('refuse les adresses invalides', async () => {
    expect(await errorOf(() => parseAddress('DB1.DBX0'))).toMatch(/DB1\.DBX0/)
    expect(await errorOf(() => parseAddress('M0.8'))).not.toBe('OK')
    expect(await errorOf(() => parseAddress('DB0.DBW0'))).not.toBe('OK')
    expect(await errorOf(() => parseAddress('Z10'))).not.toBe('OK')
    expect(await errorOf(() => resolveAddress('MW0', 'Bool'))).not.toBe('OK')
    expect(await errorOf(() => resolveAddress('M0.0', 'Int'))).not.toBe('OK')
  })

  it('formate les adresses selon le type', () => {
    expect(formatAddress(parseAddress('DB1.DBB4'), 'Real')).toBe('DB1.DBD4')
    expect(formatAddress(parseAddress('I0.1'), 'Bool')).toBe('I0.1')
    expect(formatAddress(parseAddress('MB10'), 'Int')).toBe('MW10')
    expect(resolveAddress('db2.dbb0', 'String', 10)).toMatchObject({ size: 12, length: 10, text: 'DB2.DBB0' })
  })

  it('calcule les TSAP', () => {
    expect(remoteTsap(1, 0, 2)).toBe(0x0102)
    expect(remoteTsap(3, 1, 1)).toBe(0x0321)
    expect(parseTsap('03.01')).toBe(0x0301)
  })
})

describe('Codec S7', () => {
  it('encode en big-endian et décode', () => {
    expect([...encodeValue(1.5, 'Real')]).toEqual([0x3f, 0xc0, 0, 0])
    expect([...encodeValue(-2, 'Int')]).toEqual([0xff, 0xfe])
    expect([...encodeValue(70000, 'Int')]).toEqual([0x7f, 0xff])
    expect(decodeValue([0xff, 0xfe], 'Int')).toBe(-2)
    expect(decodeValue([0x00, 0x00, 0x01, 0x00], 'DInt')).toBe(256)
    expect(decodeValue([0b00001000], 'Bool', { bit: 3 })).toBe(true)
    expect([...encodeValue('AB', 'String', 4)]).toEqual([4, 2, 0x41, 0x42, 0, 0])
    expect(decodeValue([4, 2, 0x41, 0x42, 0, 0], 'String')).toBe('AB')
  })
})

describe('Serveur et client S7', () => {
  let server
  let client
  let port

  beforeEach(async () => {
    port = await freePort()
    server = new S7Server()
    client = new S7Client()
    await server.start({ ...DEFAULT_SERVER_CONFIG, host: '127.0.0.1', port, pduSize: 240 })
  })

  afterEach(async () => {
    await client.disconnect()
    await server.stop()
  })

  const connect = (options = {}) => client.connect({ host: '127.0.0.1', port, rack: 0, slot: 2, ...options })

  it('se connecte, négocie la PDU et lit l’identification', async () => {
    const status = await connect()
    expect(status.connected).toBe(true)
    expect(status.pduSize).toBe(240)
    expect(status.tsap).toEqual({ local: '01.00', remote: '01.02' })
    expect(status.identity).toMatchObject({
      orderCode: '6ES7 516-3AN02-0AB0',
      moduleName: 'CPU 1516-3 PN/DP',
      serialNumber: 'S C-SULFUR0001',
      version: 'V3.1.0'
    })
    expect(status.cpuState).toBe('run')
    expect(server.status().connections[0].tsap.remote).toBe('01.02')
  })

  it('lit et écrit des valeurs typées', async () => {
    await connect()
    expect(await client.readValue('DB2.DBD0', 'Real')).toBe(50)
    await client.writeValue('DB2.DBD0', 'Real', '12.5')
    expect(server.values()['s7-pt-3']).toBe(12.5)
    await client.writeValue('DB1.DBX10.3', 'Bool', true)
    expect(await client.readValue('DB1.DBB10', 'Byte')).toBe(8)
    expect(await client.readValue('DB1.DBX10.3', 'Bool')).toBe(true)
    await client.writeValue('MW100', 'Int', -1234)
    expect(await client.readValue('MW100', 'Int')).toBe(-1234)
    await client.writeValue('DB1.DBB20', 'String', 'Sulfur', 16)
    expect(await client.readValue('DB1.DBB20', 'String', 16)).toBe('Sulfur')
  })

  it('découpe les lectures et écritures plus grandes que la PDU', async () => {
    await connect()
    const bytes = Array.from({ length: 600 }, (_, i) => i % 256)
    await client.writeArea('M', 0, 1000, bytes)
    expect(await client.readArea('M', 0, 1000, 600)).toEqual(bytes)
  })

  it('regroupe les lectures de surveillance et signale les erreurs par élément', async () => {
    await connect()
    const addresses = [
      resolveAddress('DB1.DBD0', 'Real'),
      resolveAddress('DB9.DBW0', 'Int'),
      resolveAddress('DB1.DBW300', 'Int'),
      ...Array.from({ length: 30 }, (_, i) => resolveAddress(`MB${200 + i}`, 'Byte'))
    ]
    const results = await client.readValues(addresses)
    expect(results).toHaveLength(33)
    expect(typeof results[0].value).toBe('number')
    expect(results[1].error).toMatch(/0x0A/)
    expect(results[2].error).toMatch(/0x05/)
    expect(results.slice(3).every((r) => r.value === 0)).toBe(true)
  })

  it('arrête et démarre la CPU', async () => {
    await connect()
    expect(await client.stopCpu()).toBe('stop')
    expect(server.status().cpuState).toBe('stop')
    expect(await client.startCpu()).toBe('run')
    server.config.readOnly = true
    expect(await errorOf(client.stopCpu())).toMatch(/0xD602/)
    expect(await errorOf(client.writeValue('MW0', 'Int', 1))).toMatch(/0x03/)
  })

  it('applique les défauts injectés', async () => {
    await connect()
    server.setFaults([{ id: 'f', type: 'exception', params: { code: 0x01, scope: 'read' }, points: [] }])
    expect(await errorOf(client.readValue('MW0', 'Int'))).toMatch(/0x01/)
    expect(await errorOf(client.writeValue('MW0', 'Int', 3))).toBe('OK')
    server.setFaults([{ id: 'f', type: 'cut', params: {}, points: [] }])
    await sleep(100)
    expect(client.status().connected).toBe(false)
    expect(await errorOf(connect({ timeout: 500 }))).not.toBe('OK')
    server.setFaults([])
  })

  it('publie les points du serveur et les surveillances du client', async () => {
    await connect()
    client.addWatch({ address: 'DB2.DBD0', dataType: 'Real', label: 'Consigne' })
    await sleep(200)
    const api = createPointsApi({ server, client })
    const points = api.points()
    const watch = points.find((p) => p.group === 'client')
    expect(watch.name).toBe('Consigne (DB2.DBD0)')
    expect(points.find((p) => p.id === 'server:s7-pt-3').name).toBe('Setpoint (DB2.DBD0)')
    expect(api.read([watch.id])[watch.id]).toBe(50)
    await api.write('server:s7-pt-3', 75)
    await api.write(watch.id, 80)
    expect(server.values()['s7-pt-3']).toBe(80)
  })
})
