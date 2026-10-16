import { describe, expect, it } from 'vitest'
import { decodeValue, encodeValue } from '@modules/modbus/shared/codec'
import {
  FrameError,
  FrameReader,
  ModbusException,
  buildIdentificationResponse,
  buildResponse,
  encodeFrame,
  identificationRequest,
  parseRequest,
  parseResponse,
  packBits,
  readWriteRequest,
  unpackBits,
  writeRequest
} from '@modules/modbus/main/protocol'
import { RateLimiter, buildAllowList, isAllowed } from '@modules/modbus/main/security'

describe('Encodage des valeurs', () => {
  it.each(['ABCD', 'CDAB', 'BADC', 'DCBA'])('aller-retour Float32 / Int32 / Float64 en %s', (order) => {
    expect(decodeValue(encodeValue(3.5, 'Float32', order), 'Float32', order)).toBe(3.5)
    expect(decodeValue(encodeValue(-123456, 'Int32', order), 'Int32', order)).toBe(-123456)
    expect(decodeValue(encodeValue(Math.PI, 'Float64', order), 'Float64', order)).toBe(Math.PI)
  })

  it('ordre des mots : CDAB inverse les deux mots de ABCD', () => {
    const abcd = encodeValue(0x11223344, 'UInt32', 'ABCD')
    expect(abcd).toEqual([0x1122, 0x3344])
    expect(encodeValue(0x11223344, 'UInt32', 'CDAB')).toEqual([0x3344, 0x1122])
    expect(encodeValue(0x11223344, 'UInt32', 'BADC')).toEqual([0x2211, 0x4433])
    expect(encodeValue(0x11223344, 'UInt32', 'DCBA')).toEqual([0x4433, 0x2211])
  })

  it('borne les entiers à leur plage', () => {
    expect(encodeValue(70000, 'UInt16')).toEqual([0xffff])
    expect(decodeValue(encodeValue(-40000, 'Int16'), 'Int16')).toBe(-32768)
  })
})

describe('Protocole Modbus TCP', () => {
  it('découpe un flux en trames, y compris fragmentées', () => {
    const reader = new FrameReader()
    const frame = encodeFrame(7, 1, Buffer.from([3, 0, 0, 0, 2]))
    expect(reader.push(frame.subarray(0, 5))).toEqual([])
    const frames = reader.push(Buffer.concat([frame.subarray(5), frame]))
    expect(frames).toHaveLength(2)
    expect(frames[0]).toMatchObject({ transactionId: 7, unitId: 1 })
  })

  it('rejette un identifiant de protocole non nul', () => {
    expect(() => new FrameReader().push(Buffer.from([0, 1, 0, 9, 0, 6, 1, 3, 0, 0, 0, 1]))).toThrow(FrameError)
  })

  it('analyse les requêtes et produit les réponses', () => {
    const read = parseRequest(Buffer.from([3, 0, 10, 0, 2]))
    expect(read).toMatchObject({ fc: 3, table: 'holdingRegisters', address: 10, quantity: 2, write: false })
    expect([...buildResponse(read, [1, 0xffff])]).toEqual([3, 4, 0, 1, 0xff, 0xff])
    const write = parseRequest(writeRequest('coils', 5, [true, false, true]))
    expect(write).toMatchObject({ fc: 15, address: 5, quantity: 3, values: [true, false, true], write: true })
  })

  it('lève les exceptions Modbus attendues', () => {
    const code = (pdu) => {
      try {
        parseRequest(Buffer.from(pdu))
      } catch (err) {
        return err instanceof ModbusException ? err.code : err
      }
    }
    expect(code([99, 0, 0, 0, 1])).toBe(1) // fonction inconnue
    expect(code([3, 0, 0, 0, 200])).toBe(3) // quantité > 125
    expect(code([5, 0, 0, 0x12, 0x34])).toBe(3) // valeur de coil invalide
  })

  it('analyse une lecture / écriture multiple (fonction 23)', () => {
    const req = parseRequest(readWriteRequest(3, 2, 10, [7, 8, 9]))
    expect(req).toMatchObject({
      fc: 23,
      address: 3,
      quantity: 2,
      writeAddress: 10,
      writeQuantity: 3,
      values: [7, 8, 9]
    })
    expect([...buildResponse(req, [1, 2])]).toEqual([23, 4, 0, 1, 0, 2])
    const bad = Buffer.from(readWriteRequest(0, 1, 0, [1]))
    bad[9] = 4 // nombre d'octets incohérent
    expect(() => parseRequest(bad)).toThrow(ModbusException)
  })

  it('découpe une identification trop longue en plusieurs réponses', () => {
    const long = 'x'.repeat(200)
    const objects = new Map([
      [0, 'Vendor'],
      [1, 'Code'],
      [2, '1.0'],
      [4, long],
      [5, long]
    ])
    const first = buildIdentificationResponse(parseRequest(identificationRequest(2, 0)), objects)
    const parsed = parseResponse(identificationRequest(2, 0), first)
    expect(first.length).toBeLessThanOrEqual(253)
    expect(parsed).toMatchObject({ moreFollows: true, nextObjectId: 5 })
    expect(parsed.objects.map((o) => o.id)).toEqual([0, 1, 2, 4])
    const next = parseResponse(
      identificationRequest(2, 5),
      buildIdentificationResponse(parseRequest(identificationRequest(2, 5)), objects)
    )
    expect(next).toMatchObject({ moreFollows: false, objects: [{ id: 5, value: long }] })
    // Objet individuel absent → exception 2 ; MEI inconnu → exception 1.
    expect(() => buildIdentificationResponse(parseRequest(identificationRequest(4, 3)), objects)).toThrow(
      ModbusException
    )
    expect(() => parseRequest(Buffer.from([43, 13, 1, 0]))).toThrow(ModbusException)
  })

  it('empaquette les bits', () => {
    const bits = [true, false, true, true, false, false, false, false, true]
    expect(unpackBits(packBits(bits), bits.length)).toEqual(bits)
  })
})

describe("Contrôle d'accès", () => {
  it('liste blanche IPv4 / IPv6, CIDR et adresses mappées', () => {
    const list = buildAllowList(['192.168.1.0/24', '10.0.0.5', '::1'])
    expect(isAllowed(list, '192.168.1.42')).toBe(true)
    expect(isAllowed(list, '::ffff:10.0.0.5')).toBe(true)
    expect(isAllowed(list, '::1')).toBe(true)
    expect(isAllowed(list, '192.168.2.1')).toBe(false)
    expect(isAllowed(buildAllowList([]), '8.8.8.8')).toBe(true)
  })

  it('limiteur de débit à seau de jetons', () => {
    const limiter = new RateLimiter(3)
    expect([limiter.take(), limiter.take(), limiter.take(), limiter.take()]).toEqual([true, true, true, false])
  })
})
