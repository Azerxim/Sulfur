import { EventEmitter } from 'events'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ModbusServer } from '@modules/modbus/main/server'
import { ModbusClient } from '@modules/modbus/main/client'
import { ModbusPki } from '@modules/modbus/main/pki'
import {
  AsciiReader,
  RtuReader,
  charTime,
  crc16,
  encodeAscii,
  encodeRtu,
  lrc,
  rtuFrameLength
} from '@modules/modbus/main/framing'
import { identificationRequest, readRequest } from '@modules/modbus/main/protocol'
import { normalizeSerial, serialLabel } from '@modules/modbus/main/serial'
import { DEFAULT_SERVER_CONFIG } from '@modules/modbus/shared/constants'
import { errorOf, freePort, sleep, tempDir } from './helpers'

/**
 * Paire de ports série reliés (null modem) : ce qui est écrit d'un côté est reçu de l'autre.
 * `split` : les octets arrivent un par un, comme sur une vraie liaison lente.
 */
function serialPair({ split = false } = {}) {
  class End extends EventEmitter {
    isOpen = true
    written = []
    write(buffer) {
      const bytes = Buffer.from(buffer)
      this.written.push(bytes)
      const chunks = split ? [...bytes].map((b) => Buffer.from([b])) : [bytes]
      for (const chunk of chunks) setImmediate(() => this.peer.isOpen && this.peer.emit('data', chunk))
      return true
    }
    close(callback) {
      if (this.isOpen) {
        this.isOpen = false
        this.emit('close')
      }
      callback?.()
    }
    destroy() {
      this.close()
    }
  }
  const a = new End()
  const b = new End()
  a.peer = b
  b.peer = a
  return [a, b]
}

const SERIAL = { path: '/dev/ttyTEST', baudRate: 115200, dataBits: 8, parity: 'even', stopBits: 1 }

describe('Trames RTU et ASCII', () => {
  it('calcule le CRC-16 et le LRC Modbus', () => {
    const request = Buffer.from([0x01, 0x03, 0x00, 0x00, 0x00, 0x0a])
    expect(crc16(request)).toBe(0xcdc5)
    expect(encodeRtu(1, request.subarray(1)).toString('hex')).toBe('01030000000ac5cd')
    expect(lrc(Buffer.from([0x01, 0x03, 0x00, 0x00, 0x00, 0x01]))).toBe(0xfb)
    expect(encodeAscii(1, readRequest('holdingRegisters', 0, 1)).toString('latin1')).toBe(':010300000001FB\r\n')
  })

  it('déduit la longueur des trames du code fonction', () => {
    const write16 = encodeRtu(1, Buffer.from([16, 0, 0, 0, 2, 4, 0, 1, 0, 2]))
    expect(rtuFrameLength(write16, 'request')).toBe(write16.length)
    expect(rtuFrameLength(write16.subarray(0, 5), 'request')).toBe(0)
    expect(rtuFrameLength(encodeRtu(1, identificationRequest(1)), 'request')).toBe(7)
    expect(rtuFrameLength(Buffer.from([1, 0x83, 2, 0, 0]), 'response')).toBe(5)
    expect(rtuFrameLength(Buffer.from([1, 0x41, 0, 0]), 'request')).toBeNull()
    // Identification : en-tête de 8 octets, deux objets de 3 et 2 octets, CRC.
    const ident = Buffer.from([1, 43, 14, 1, 0x82, 0, 0, 2, 0, 3, 65, 66, 67, 1, 2, 68, 69])
    expect(rtuFrameLength(ident, 'response')).toBe(ident.length + 2)
  })

  it('reconstitue les trames RTU découpées et se resynchronise après un parasite', () => {
    const reader = new RtuReader('request')
    const frame = encodeRtu(7, readRequest('inputRegisters', 10, 2))
    expect(reader.push(frame.subarray(0, 3))).toEqual([])
    expect(reader.push(frame.subarray(3))).toEqual([
      { transactionId: null, unitId: 7, pdu: readRequest('inputRegisters', 10, 2) }
    ])
    // Octet parasite devant une trame valide : abandonné, la trame suivante est lue.
    const frames = reader.push(Buffer.concat([Buffer.from([0x00]), frame]))
    expect(frames.map((f) => f.unitId)).toEqual([7])
    expect(reader.errors).toBeGreaterThan(0)
  })

  it('rejette un CRC faux en RTU over TCP', () => {
    const reader = new RtuReader('request', { strict: true })
    const frame = encodeRtu(1, readRequest('coils', 0, 8))
    frame[frame.length - 1] ^= 0xff
    expect(() => reader.push(frame)).toThrow(/CRC/)
  })

  it('termine par un silence une trame de fonction inconnue', () => {
    const reader = new RtuReader('request')
    const frame = encodeRtu(1, Buffer.from([0x41, 1, 2]))
    expect(reader.push(frame)).toEqual([])
    expect(reader.flush(10)).toEqual([{ transactionId: null, unitId: 1, pdu: Buffer.from([0x41, 1, 2]) }])
    // Trame incomplète de longueur connue : gardée pendant un silence court, abandonnée ensuite.
    reader.push(frame.subarray(0, 0))
    reader.push(encodeRtu(1, readRequest('coils', 0, 1)).subarray(0, 5))
    expect(reader.flush(10)).toEqual([])
    expect(reader.pending).toBe(true)
    expect(reader.flush(5000)).toEqual([])
    expect(reader.pending).toBe(false)
  })

  it('lit les trames ASCII et ignore celles dont le LRC est faux', () => {
    const reader = new AsciiReader()
    const good = encodeAscii(3, readRequest('holdingRegisters', 4, 2))
    const bad = Buffer.from(':0103000000010A\r\n', 'latin1')
    const frames = reader.push(Buffer.concat([bad, Buffer.from('bruit'), good.subarray(0, 6)]))
    expect(frames).toEqual([])
    expect(reader.push(good.subarray(6))).toEqual([
      { transactionId: null, unitId: 3, pdu: readRequest('holdingRegisters', 4, 2) }
    ])
    expect(reader.errors).toBe(1)
  })

  it('valide les paramètres de liaison série', async () => {
    expect(normalizeSerial({ ...SERIAL, baudRate: '9600' }).baudRate).toBe(9600)
    expect(serialLabel(SERIAL)).toBe('115200 8E1')
    expect(await errorOf(() => normalizeSerial({ ...SERIAL, path: ' ' }))).toBe('Choose a serial port')
    expect(await errorOf(() => normalizeSerial({ ...SERIAL, dataBits: 6 }))).toBe('Data bits: 7 or 8')
    expect(charTime({ baudRate: 9600, dataBits: 8, parity: 'even', stopBits: 1 })).toBeCloseTo(11 / 9.6)
  })
})

describe('Serveur et client Modbus RTU / ASCII', () => {
  let tmp, pki, server, logs
  const clients = []

  beforeAll(async () => {
    tmp = await tempDir('modbus-rtu')
    pki = new ModbusPki(`${tmp.dir}/pki`)
  })
  afterEach(async () => {
    for (const client of clients.splice(0)) await client.disconnect().catch(() => {})
    await server?.stop()
  })
  afterAll(() => tmp.cleanup())

  function newServer(openSerial) {
    logs = []
    server = new ModbusServer(pki, { onStatus() {}, onValues() {}, onLog: (e) => logs.push(e), openSerial })
    return server
  }
  function newClient(openSerial) {
    const client = new ModbusClient(pki, { onStatus() {}, onData() {}, openSerial })
    clients.push(client)
    return client
  }

  /** Deux équipements (Unit ID 1 et 2) ; le premier porte les points par défaut. */
  const twoUnits = () => [
    DEFAULT_SERVER_CONFIG.units[0],
    { id: 'unit-2', unitId: 2, name: 'Second', identity: { vendorName: 'Second vendor' }, points: [] }
  ]

  it('échange en RTU over TCP et ignore les autres Unit ID', async () => {
    const port = await freePort()
    await newServer().start({ ...DEFAULT_SERVER_CONFIG, transport: 'rtuOverTcp', port, units: twoUnits() })
    expect(server.status().endpoint).toBe(`rtu+tcp://0.0.0.0:${port}`)

    const client = newClient()
    await client.connect({ transport: 'rtuOverTcp', host: '127.0.0.1', port, unitId: 1, timeout: 300 })
    const words = await client.read('holdingRegisters', 10, 1)
    expect(words).toEqual([50])
    await client.write('holdingRegisters', 10, [77])
    expect(await client.readValue('holdingRegisters', 10, 'Int16')).toBe(77)
    const ident = await client.readDeviceIdentification(1)
    expect(ident.objects.map((o) => o.value)).toEqual(['Sulfur', 'SULFUR-MB', '1.0'])

    // Esclave absent du bus : pas de réponse (et non une exception 0B comme en Modbus TCP).
    const other = newClient()
    await other.connect({ transport: 'rtuOverTcp', host: '127.0.0.1', port, unitId: 9, timeout: 300 })
    expect(await errorOf(other.read('holdingRegisters', 0, 1))).toMatch(/300/)
  })

  it('refuse un Unit ID hors de la plage série', async () => {
    const units = [{ ...DEFAULT_SERVER_CONFIG.units[0], unitId: 0 }]
    const [end] = serialPair()
    expect(
      await errorOf(
        newServer(async () => end).start({ ...DEFAULT_SERVER_CONFIG, transport: 'rtu', serial: SERIAL, units })
      )
    ).toMatch(/1 to 247/)
  })

  for (const transport of ['rtu', 'ascii']) {
    it(`sert un maître ${transport.toUpperCase()} sur une liaison série`, async () => {
      const [slaveEnd, masterEnd] = serialPair({ split: true })
      await newServer(async () => slaveEnd).start({
        ...DEFAULT_SERVER_CONFIG,
        transport,
        serial: SERIAL,
        units: twoUnits()
      })
      expect(server.status().endpoint).toBe(`${transport}:///dev/ttyTEST · 115200 8E1`)
      expect(server.status().connections).toHaveLength(1)

      const client = newClient(async () => masterEnd)
      await client.connect({ transport, serial: SERIAL, unitId: 2, timeout: 1000 })
      expect(client.status().endpoint).toBe('/dev/ttyTEST · 115200 8E1')
      // Requêtes simultanées : envoyées une à une, chacune reçoit sa réponse.
      const [a, b, ident] = await Promise.all([
        client.read('coils', 0, 4),
        client.write('holdingRegisters', 3, [1234]),
        client.readDeviceIdentification(1)
      ])
      expect(a).toEqual([false, false, false, false])
      expect(b).toEqual({ address: 3, count: 1 })
      expect(ident.objects[0].value).toBe('Second vendor')
      expect(await client.read('holdingRegisters', 3, 1)).toEqual([1234])
    })
  }

  it('applique une écriture en diffusion à tous les équipements, sans réponse', async () => {
    const [slaveEnd, masterEnd] = serialPair()
    await newServer(async () => slaveEnd).start({
      ...DEFAULT_SERVER_CONFIG,
      transport: 'rtu',
      serial: SERIAL,
      units: twoUnits()
    })
    const broadcaster = newClient(async () => masterEnd)
    await broadcaster.connect({ transport: 'rtu', serial: SERIAL, unitId: 0, timeout: 500 })
    await broadcaster.write('holdingRegisters', 20, [42])
    expect(await errorOf(broadcaster.read('holdingRegisters', 20, 1))).toMatch(/Broadcast/)
    // Rien n'a été renvoyé par l'esclave.
    expect(slaveEnd.written).toEqual([])
    expect(server.registers('unit-1', 'holdingRegisters', 20, 1)).toEqual([42])
    expect(server.registers('unit-2', 'holdingRegisters', 20, 1)).toEqual([42])
  })

  it("s'arrête quand le port série disparaît", async () => {
    const [slaveEnd] = serialPair()
    await newServer(async () => slaveEnd).start({ ...DEFAULT_SERVER_CONFIG, transport: 'rtu', serial: SERIAL })
    slaveEnd.close()
    await sleep(20)
    expect(server.status().running).toBe(false)
    expect(logs.some((l) => l.message.includes('/dev/ttyTEST closed'))).toBe(true)
  })
})
