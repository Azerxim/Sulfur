import net from 'net'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { SyslogServer } from '@modules/syslog/main/server'
import { SyslogClient } from '@modules/syslog/main/client'
import { FrameDecoder, frame } from '@modules/syslog/main/framing'
import { createPointsApi } from '@modules/syslog/main/points'
import { encodeMessage, parseMessage, parseStructuredData } from '@modules/syslog/shared/codec'
import { ensureCertificate } from '@shared/certificate'
import { errorOf, freePort, sleep, tempDir } from './helpers'

let server, client, pki, port

const all = (extra = {}) => ({
  host: '127.0.0.1',
  udp: { enabled: true, port },
  tcp: { enabled: true, port },
  tls: { enabled: false, port: port + 1 },
  ...extra
})

const send = (extra = {}) => client.send({ host: '127.0.0.1', port, transport: 'udp', message: 'hello {n}', ...extra })

/** Attend que le serveur ait reçu `count` messages. */
async function received(count) {
  for (let i = 0; i < 100 && server.messages.length < count; i++) await sleep(20)
  return server.messages
}

beforeAll(async () => {
  pki = await tempDir('syslog')
  server = new SyslogServer(() => ensureCertificate(pki.dir, 'Syslog@Sulfur'))
  client = new SyslogClient()
})

afterEach(async () => {
  client.close()
  server.setFaults([])
  await server.stop()
  server.clear()
})

afterAll(() => pki.cleanup())

describe('Messages Syslog', () => {
  const time = new Date('2026-10-19T08:30:05.123Z')

  it('encode et relit un message RFC 5424 avec données structurées', () => {
    const text = encodeMessage({
      facility: 16,
      severity: 3,
      hostname: 'plc-01',
      appName: 'sulfur',
      procId: '42',
      msgId: 'ALARM',
      structuredData: '[origin ip="192.0.2.1"][meta note="a \\"b\\" \\]"]',
      message: 'Pump stopped',
      time
    })
    expect(text).toBe(
      '<131>1 2026-10-19T08:30:05.123Z plc-01 sulfur 42 ALARM [origin ip="192.0.2.1"][meta note="a \\"b\\" \\]"] Pump stopped'
    )
    const parsed = parseMessage(text)
    expect(parsed).toMatchObject({
      format: 'rfc5424',
      facility: 16,
      severity: 3,
      hostname: 'plc-01',
      appName: 'sulfur',
      procId: '42',
      msgId: 'ALARM',
      message: 'Pump stopped',
      timestamp: time.toISOString()
    })
    expect(parseStructuredData(parsed.structuredData)).toEqual([
      { id: 'origin', params: { ip: '192.0.2.1' } },
      { id: 'meta', params: { note: 'a "b" ]' } }
    ])
  })

  it('valeurs nulles RFC 5424 et message RFC 3164', () => {
    expect(encodeMessage({ facility: 1, severity: 6, hostname: 'h', time })).toBe(
      '<14>1 2026-10-19T08:30:05.123Z h - - - -'
    )
    const bsd = encodeMessage({
      format: 'rfc3164',
      facility: 4,
      severity: 2,
      hostname: 'h',
      appName: 'sshd',
      procId: '7',
      message: 'x',
      time
    })
    expect(bsd).toMatch(/^<34>Oct 19 \d\d:30:05 h sshd\[7\]: x$/)
    expect(parseMessage(bsd, time)).toMatchObject({
      format: 'rfc3164',
      facility: 4,
      severity: 2,
      hostname: 'h',
      appName: 'sshd',
      procId: '7',
      message: 'x'
    })
  })

  it('texte libre : priorité par défaut user.notice', () => {
    expect(parseMessage('just text')).toMatchObject({
      format: 'unknown',
      facility: 1,
      severity: 5,
      message: 'just text'
    })
    expect(parseMessage('<190>free')).toMatchObject({ format: 'unknown', facility: 23, severity: 6, message: 'free' })
  })

  it('délimitation sur un flux : longueur en tête et fin de ligne, messages coupés', () => {
    const decoder = new FrameDecoder()
    const data = Buffer.from(frame('<14>été', 'octet') + frame('<13>b', 'lf') + frame('<12>c', 'octet'))
    const out = []
    for (let i = 0; i < data.length; i += 3) out.push(...decoder.push(data.subarray(i, i + 3)))
    expect(out).toEqual(['<14>été', '<13>b', '<12>c'])
    expect(decoder.push(Buffer.from('<11>tail'))).toEqual([])
    expect(decoder.end()).toEqual(['<11>tail'])
  })
})

describe('Serveur et émetteur', () => {
  it('reçoit en UDP et en TCP (deux délimitations)', async () => {
    port = await freePort()
    await server.start(all())
    await send({ severity: 3, count: 2 })
    await send({ transport: 'tcp', framing: 'octet', format: 'rfc3164', appName: 'app' })
    await send({ transport: 'tcp', framing: 'lf' })
    const messages = await received(4)
    expect(messages.map((m) => [m.transport, m.message])).toEqual([
      ['udp', 'hello 1'],
      ['udp', 'hello 2'],
      ['tcp', 'hello 3'],
      ['tcp', 'hello 4']
    ])
    expect(messages[2]).toMatchObject({ format: 'rfc3164', appName: 'app', address: '127.0.0.1' })
    expect(server.status()).toMatchObject({ total: 4, connections: 1 })
    expect(server.counts[3]).toBe(2)
    expect(client.status()).toMatchObject({ sent: 4, connected: true })
  })

  it('reçoit en TLS avec un certificat auto-signé', async () => {
    port = await freePort()
    const status = await server.start(
      all({ udp: { enabled: false }, tcp: { enabled: false }, tls: { enabled: true, port } })
    )
    expect(status.certificate.commonName).toBe('Syslog@Sulfur')
    await send({ transport: 'tls', message: 'secure' })
    expect((await received(1))[0]).toMatchObject({ transport: 'tls', message: 'secure' })
    expect(await errorOf(send({ transport: 'tls', rejectUnauthorized: true, host: 'localhost' }))).not.toBe('OK')
  })

  it('refuse une configuration invalide et signale un port occupé', async () => {
    port = await freePort()
    expect(await errorOf(server.start(all({ udp: { enabled: false }, tcp: { enabled: false } })))).toMatch(/transport/)
    expect(await errorOf(server.start(all({ tls: { enabled: true, port } })))).toMatch(/TLS/)
    const blocker = net.createServer().listen(port, '127.0.0.1')
    await new Promise((resolve) => blocker.once('listening', resolve))
    expect(await errorOf(server.start(all({ udp: { enabled: false } })))).toMatch(String(port))
    expect(server.running).toBe(false)
    blocker.close()
    expect(await errorOf(send({ count: 0 }))).toMatch(/1 to/)
  })

  it('défaut « coupure » : connexions TCP fermées et refusées', async () => {
    port = await freePort()
    await server.start(all())
    await send({ transport: 'tcp' })
    await received(1)
    server.setFaults([{ id: 'f', type: 'cut' }])
    await sleep(50)
    expect(server.connections.size).toBe(0)
    await errorOf(send({ transport: 'tcp' }))
    await sleep(50)
    expect(server.messages).toHaveLength(1)
    server.setFaults([])
    await send({ transport: 'tcp' })
    expect(await received(2)).toHaveLength(2)
  })

  it('envoi périodique et points', async () => {
    port = await freePort()
    await server.start(all())
    const points = createPointsApi({ server, client })
    client.startRepeat({ host: '127.0.0.1', port, interval: 0.1, severity: 2 })
    await received(3)
    client.stopRepeat()
    await points.write('client:message', 'from flow')
    const messages = await received(4)
    expect(messages.at(-1)).toMatchObject({ message: 'from flow', severity: 2 })
    const values = points.read(['server:messages', 'server:errors', 'server:lastSeverity', 'client:sent'])
    expect(values['server:messages']).toBeGreaterThanOrEqual(4)
    expect(values['server:errors']).toBe(values['server:messages'])
    expect(values['server:lastSeverity']).toBe(2)
    expect(await errorOf(points.write('server:messages', 1))).toMatch(/read only/)
  })
})
