import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { NtpServer } from '@modules/ntp/main/server'
import { NtpClient } from '@modules/ntp/main/client'
import { SimClock } from '@modules/ntp/main/clock'
import { createPointsApi } from '@modules/ntp/main/points'
import { decodePacket, encodePacket, offsetAndDelay, readTimestamp, writeTimestamp } from '@modules/ntp/main/packet'
import { errorOf, freePort, sleep } from './helpers'

let server, client, port

/** Port UDP libre (le port TCP libre l'est presque toujours aussi en UDP). */
async function start(extra = {}) {
  port = await freePort()
  return server.start({ port, host: '127.0.0.1', ...extra })
}

const query = (extra = {}) => client.query({ host: '127.0.0.1', port, timeout: 1000, ...extra })

beforeAll(() => {
  server = new NtpServer()
  client = new NtpClient()
})

afterEach(async () => {
  client.stopPolling()
  server.setFaults([])
  await server.stop()
})

describe('Paquets NTP', () => {
  it('encode les horodatages, y compris après 2036', () => {
    const buf = Buffer.alloc(8)
    for (const ms of [Date.UTC(2026, 9, 16, 12, 0, 0, 250), Date.UTC(2040, 0, 1), Date.UTC(1999, 11, 31, 23, 59, 59)]) {
      writeTimestamp(buf, 0, ms)
      expect(readTimestamp(buf, 0)).toBeCloseTo(ms, 0)
    }
  })

  it('aller-retour d’un paquet et calcul de l’écart', () => {
    const packet = decodePacket(
      encodePacket({ leap: 1, version: 3, mode: 4, stratum: 2, refId: '10.0.0.1', transmit: 1_000_000, precision: -18 })
    )
    expect(packet).toMatchObject({ leap: 1, version: 3, mode: 4, stratum: 2, refId: '10.0.0.1', precision: -18 })
    expect(packet.transmit).toBeCloseTo(1_000_000, 0)
    expect(offsetAndDelay(0, 1050, 1060, 20)).toEqual({ offset: 1045, delay: 10 })
    expect(() => decodePacket(Buffer.alloc(10))).toThrow()
  })

  it('horloge simulée : décalage, heure fixe, dérive, gel', () => {
    let real = 1_000_000
    const clock = new SimClock({ offset: 3600 }, () => real)
    expect(clock.now()).toBe(real + 3_600_000)
    clock.configure({ mode: 'fixed', fixedTime: '2030-01-01T00:00:00Z', drift: 1000 })
    real += 10_000
    expect(clock.now()).toBe(Date.parse('2030-01-01T00:00:00Z') + 10_010)
    clock.freeze(true)
    real += 5000
    expect(clock.now()).toBe(Date.parse('2030-01-01T00:00:00Z') + 10_010)
    clock.freeze(false)
    real += 1000
    expect(clock.now()).toBe(Date.parse('2030-01-01T00:00:00Z') + 11_011)
    expect(() => clock.configure({ mode: 'fixed', fixedTime: 'pas une date' })).toThrow()
  })
})

describe('Serveur et client NTP', () => {
  it('répond avec l’heure décalée, la strate et l’identifiant choisis', async () => {
    await start({ clock: { mode: 'offset', offset: 7200 }, stratum: 1, refId: 'GPS', leap: 0 })
    const result = await query()
    expect(result).toMatchObject({ stratum: 1, refId: 'GPS', leap: 0, version: 4, kiss: null })
    expect(result.offset / 1000).toBeCloseTo(7200, 0)
    expect(result.delay).toBeGreaterThanOrEqual(0)
    expect(result.delay).toBeLessThan(200)
    expect((await query({ version: 3 })).version).toBe(3)
    expect(server.status()).toMatchObject({ requests: 2, clients: [{ address: '127.0.0.1', count: 2 }] })
  })

  it('suit les réglages à chaud : saut d’heure, heure fixée, strate 16 et seconde intercalaire', async () => {
    await start()
    expect(Math.abs((await query()).offset)).toBeLessThan(200)
    server.shift(-86400)
    expect((await query()).offset / 1000).toBeCloseTo(-86400, 0)
    server.setClock({ mode: 'fixed', fixedTime: '2038-06-01T12:00:00Z' })
    const fixed = await query()
    expect(new Date(fixed.time).toISOString()).toMatch(/^2038-06-01T12:00:0/)
    server.setSettings({ stratum: 16, leap: 3 })
    expect(await query()).toMatchObject({ stratum: 16, leap: 3 })
    expect(() => server.setSettings({ stratum: 0 })).toThrow()
  })

  it('publie des points : écrire le décalage provoque un saut d’heure', async () => {
    await start()
    const points = createPointsApi({ server, client })
    await points.write('server:offset', 600)
    expect(points.read(['server:offset'])['server:offset']).toBeCloseTo(600, 0)
    await client.queryOnce({ host: '127.0.0.1', port, timeout: 1000 })
    expect(points.read(['client:offset'])['client:offset'] / 1000).toBeCloseTo(600, 0)
    expect(points.read(['server:requests'])['server:requests']).toBe(1)
    expect(await errorOf(points.write('server:time', 1))).not.toBe('OK')
  })

  it('défauts : Kiss-o’-Death, absence de réponse, délai, horloge figée', async () => {
    await start()
    const points = createPointsApi({ server, client })
    points.setFaults([{ id: 'k', type: 'kissOfDeath', params: { code: 'RATE' }, points: [] }])
    expect(await query()).toMatchObject({ stratum: 0, kiss: 'RATE' })

    points.setFaults([{ id: 'n', type: 'noResponse', params: {}, points: [] }])
    expect(await errorOf(query({ timeout: 300 }))).toMatch(/300/)

    points.setFaults([{ id: 'd', type: 'delay', params: { ms: 250 }, points: [] }])
    expect((await query()).delay).toBeGreaterThanOrEqual(240)

    points.setFaults([{ id: 'f', type: 'freeze', params: {}, points: [] }])
    const first = (await query()).time
    await sleep(300)
    expect((await query()).time).toBe(first)
  })

  it('interroge périodiquement et refuse les réglages invalides', async () => {
    await start()
    client.startPolling({ host: '127.0.0.1', port, timeout: 1000, pollInterval: 1 })
    await sleep(1300)
    expect(client.history.filter((r) => !r.error).length).toBeGreaterThanOrEqual(2)
    expect(await errorOf(() => client.startPolling({ pollInterval: 0 }))).not.toBe('OK')
    await server.stop()
    expect(await errorOf(start({ stratum: 20 }))).not.toBe('OK')
    expect(await errorOf(start({ clock: { mode: 'fixed', fixedTime: '' } }))).not.toBe('OK')
  })
})
