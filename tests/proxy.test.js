import dgram from 'dgram'
import net from 'net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { normalizeFaults, normalizeRule, ProxyEngine } from '@modules/proxy/main/proxy'
import { createPointsApi } from '@modules/proxy/main/points'
import { DEFAULT_FAULTS } from '@modules/proxy/shared/constants'
import { errorOf, freePort, sleep } from './helpers'

/** Serveur TCP d'écho (l'« équipement ») : renvoie tout ce qu'il reçoit. */
async function tcpEcho() {
  const sockets = new Set()
  const server = net.createServer((socket) => {
    sockets.add(socket)
    socket.on('error', () => {})
    socket.on('close', () => sockets.delete(socket))
    socket.pipe(socket)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    port: server.address().port,
    close: () =>
      new Promise((resolve) => {
        for (const s of sockets) s.destroy()
        server.close(() => resolve())
      })
  }
}

/** Serveur UDP d'écho. */
async function udpEcho() {
  const socket = dgram.createSocket('udp4')
  socket.on('message', (msg, rinfo) => socket.send(msg, rinfo.port, rinfo.address))
  await new Promise((resolve) => socket.bind(0, '127.0.0.1', resolve))
  return { port: socket.address().port, close: () => new Promise((resolve) => socket.close(() => resolve())) }
}

/** Client TCP qui accumule les octets reçus ; `until(n)` attend d'en avoir reçu `n`. */
async function tcpClient(port) {
  const socket = net.connect({ port, host: '127.0.0.1' })
  socket.on('error', () => {})
  const state = { data: Buffer.alloc(0), closed: false }
  socket.on('data', (chunk) => (state.data = Buffer.concat([state.data, chunk])))
  socket.on('close', () => (state.closed = true))
  await new Promise((resolve) => socket.once('connect', resolve))
  const until = async (predicate, timeout = 2000) => {
    const end = Date.now() + timeout
    while (!predicate() && Date.now() < end) await sleep(5)
    return predicate()
  }
  return {
    socket,
    state,
    write: (text) => socket.write(text),
    received: (n, timeout) => until(() => state.data.length >= n, timeout),
    closed: (timeout) => until(() => state.closed, timeout)
  }
}

/** Échange UDP avec le proxy : réponse reçue (Buffer) ou null après `timeout` ms. */
async function udpExchange(port, payload, timeout = 400) {
  const socket = dgram.createSocket('udp4')
  try {
    await new Promise((resolve) => socket.bind(0, '127.0.0.1', resolve))
    const reply = new Promise((resolve) => {
      socket.once('message', resolve)
      setTimeout(() => resolve(null), timeout)
    })
    socket.send(Buffer.from(payload), port, '127.0.0.1')
    return await reply
  } finally {
    socket.close()
  }
}

let engine, echo, listenPort, statuses

const rule = (patch = {}) => ({
  id: 'r1',
  name: 'Test',
  protocol: 'tcp',
  listenHost: '127.0.0.1',
  listenPort,
  targetHost: '127.0.0.1',
  targetPort: echo.port,
  faults: { ...DEFAULT_FAULTS },
  ...patch
})

beforeEach(async () => {
  statuses = []
  engine = new ProxyEngine({ onStatus: (s) => statuses.push(s) })
  listenPort = await freePort()
})

afterEach(async () => {
  await engine?.dispose()
  await echo?.close()
  echo = null
})

describe('Redirections : validation', () => {
  it('complète et vérifie une redirection', () => {
    const r = normalizeRule({
      id: 'a',
      protocol: 'udp',
      listenPort: '1502',
      targetHost: ' plc.local ',
      targetPort: 502
    })
    expect(r).toMatchObject({ name: 'UDP 1502', listenHost: '0.0.0.0', listenPort: 1502, targetHost: 'plc.local' })
    expect(r.faults).toEqual(DEFAULT_FAULTS)
  })

  it('refuse les redirections invalides', async () => {
    const base = { id: 'a', protocol: 'tcp', listenPort: 1502, targetHost: '10.0.0.5', targetPort: 502 }
    expect(await errorOf(() => normalizeRule({ ...base, protocol: 'sctp' }))).toBe('Invalid protocol (TCP or UDP)')
    expect(await errorOf(() => normalizeRule({ ...base, listenPort: 0 }))).toBe('Invalid local port (1 to 65535)')
    expect(await errorOf(() => normalizeRule({ ...base, targetPort: 70000 }))).toBe('Invalid device port (1 to 65535)')
    expect(await errorOf(() => normalizeRule({ ...base, targetHost: ' ' }))).toBe('Enter the device host')
    expect(await errorOf(() => normalizeRule({ ...base, targetHost: 'localhost', targetPort: 1502 }))).toBe(
      'The redirection points to its own local port'
    )
  })

  it('vérifie les défauts', async () => {
    expect(await errorOf(() => normalizeFaults({ latency: -1 }))).toBe('Latency and jitter: 0 to 60000 ms')
    expect(await errorOf(() => normalizeFaults({ loss: 120 }))).toBe('Loss and corruption: 0 to 100 %')
    expect(await errorOf(() => normalizeFaults({ direction: 'sideways' }))).toBe('Invalid direction')
    expect(normalizeFaults({ latency: '12.4', block: 1 })).toMatchObject({ latency: 12, block: true })
  })
})

describe('Relais TCP', () => {
  beforeEach(async () => {
    echo = await tcpEcho()
  })

  it('relaie le trafic dans les deux sens et le journalise', async () => {
    await engine.start(rule())
    expect(engine.status()).toMatchObject({ running: true, endpoint: `tcp://127.0.0.1:${listenPort}` })
    const client = await tcpClient(listenPort)
    client.write('hello')
    expect(await client.received(5)).toBe(true)
    expect(client.state.data.toString()).toBe('hello')
    const status = engine.status()
    expect(status.sessions).toBe(1)
    expect(status.rules[0].counters).toMatchObject({ up: 5, down: 5, connections: 1 })
    client.socket.end()
    await client.closed()
    await sleep(50)
    expect(engine.status().sessions).toBe(0)
    await sleep(120)
    const data = engine.log.filter((e) => e.dir !== 'event')
    expect(data.map((e) => [e.dir, e.hex])).toEqual([
      ['up', '68656c6c6f'],
      ['down', '68656c6c6f']
    ])
    expect(engine.log.at(-1).text).toMatch(/^Connection from 127\.0\.0\.1:\d+ closed by/)
  })

  it('signale un équipement qui refuse la connexion', async () => {
    const closedPort = await freePort()
    await engine.start(rule({ targetPort: closedPort }))
    const client = await tcpClient(listenPort)
    expect(await client.closed()).toBe(true)
    await sleep(20)
    expect(engine.log.at(-1)).toMatchObject({ level: 'error' })
    expect(engine.log.at(-1).text).toContain(`127.0.0.1:${closedPort} refuses the connection`)
  })

  it('retarde les envois en conservant leur ordre', async () => {
    await engine.start(rule({ faults: { ...DEFAULT_FAULTS, latency: 150, jitter: 40, direction: 'up' } }))
    const client = await tcpClient(listenPort)
    const t0 = Date.now()
    for (const part of ['a', 'b', 'c', 'd']) client.write(part)
    expect(await client.received(4)).toBe(true)
    expect(Date.now() - t0).toBeGreaterThanOrEqual(145)
    expect(client.state.data.toString()).toBe('abcd')
    const delays = engine.log.filter((e) => e.dir === 'up').map((e) => e.delay)
    expect(delays.every((d) => d >= 150 && d <= 190)).toBe(true)
  })

  it('altère un bit des envois', async () => {
    await engine.start(rule({ faults: { ...DEFAULT_FAULTS, corrupt: 100, direction: 'up' } }))
    const client = await tcpClient(listenPort)
    client.write('Sulfur')
    expect(await client.received(6)).toBe(true)
    const sent = Buffer.from('Sulfur')
    const bits = [...client.state.data].reduce((n, b, i) => n + (b ^ sent[i]).toString(2).replace(/0/g, '').length, 0)
    expect(bits).toBe(1)
    expect(engine.status().rules[0].counters.corrupted).toBe(1)
  })

  it('bloque le trafic : connexions refusées, données ignorées', async () => {
    await engine.start(rule({ faults: { ...DEFAULT_FAULTS, block: true } }))
    const refused = await tcpClient(listenPort)
    expect(await refused.closed()).toBe(true)
    await sleep(20)
    expect(engine.log.at(-1).text).toMatch(/refused \(traffic blocked\)/)

    // Blocage d'un seul sens : la connexion est acceptée, les données de ce sens ignorées.
    engine.update(rule({ faults: { ...DEFAULT_FAULTS, block: true, direction: 'up' } }))
    const client = await tcpClient(listenPort)
    client.write('lost')
    expect(await client.received(1, 250)).toBe(false)
    expect(engine.status().rules[0].counters.dropped).toBe(1)
  })

  it('coupe les connexions à la demande', async () => {
    await engine.start(rule())
    const a = await tcpClient(listenPort)
    const b = await tcpClient(listenPort)
    await sleep(30)
    expect(engine.status().sessions).toBe(2)
    engine.cut('r1')
    expect(await a.closed()).toBe(true)
    expect(await b.closed()).toBe(true)
    expect(engine.status().sessions).toBe(0)
    await sleep(120)
    expect(engine.log.at(-1)).toMatchObject({ level: 'warn', text: 'Connections cut (2)' })
  })

  it('applique les défauts à chaud mais fige les adresses', async () => {
    await engine.start(rule())
    engine.update(rule({ name: 'Renamed', faults: { ...DEFAULT_FAULTS, latency: 10 } }))
    expect(engine.status().rules[0].config).toMatchObject({ name: 'Renamed', faults: { latency: 10 } })
    expect(await errorOf(() => engine.update(rule({ targetPort: echo.port + 1 })))).toBe(
      'Stop the redirection to change its addresses'
    )
    expect(await errorOf(() => engine.start(rule()))).toBe('The redirection “Test” is already started')
  })

  it('signale un port local déjà utilisé', async () => {
    await engine.start(rule())
    expect(await errorOf(() => engine.start(rule({ id: 'r2' })))).toBe(
      `Port ${listenPort} is already in use on 127.0.0.1`
    )
    // Démarrage groupé : les redirections valides démarrent, les erreurs sont regroupées.
    const other = await freePort()
    const error = await errorOf(() =>
      engine.startAll([rule({ id: 'r2', name: 'Bad' }), rule({ id: 'r3', listenPort: other })])
    )
    expect(error).toMatch(/^Bad : Port \d+ is already in use/)
    expect(engine.status().rules.map((r) => r.id)).toEqual(['r1', 'r3'])
    await engine.stopAll()
    expect(engine.running).toBe(false)
  })

  it('n’enregistre que les événements sans capture des données', async () => {
    engine.setCapture(false)
    await engine.start(rule())
    const client = await tcpClient(listenPort)
    client.write('x')
    await client.received(1)
    await sleep(120)
    expect(engine.log.some((e) => e.dir !== 'event')).toBe(false)
    expect(engine.log.some((e) => e.text?.startsWith('Connection from'))).toBe(true)
  })

  it('exporte le journal en texte', async () => {
    await engine.start(rule())
    const client = await tcpClient(listenPort)
    client.write('OK\r\n')
    await client.received(4)
    const text = engine.exportText()
    expect(text).toMatch(/Test #\d+ 127\.0\.0\.1:\d+ C>S \[4\] 4F 4B 0D 0A \| OK\\r\\n/)
    expect(text).toMatch(/S>C \[4\] 4F 4B 0D 0A/)
  })
})

describe('Relais UDP', () => {
  beforeEach(async () => {
    echo = await udpEcho()
  })

  it('relaie les datagrammes par session', async () => {
    await engine.start(rule({ protocol: 'udp' }))
    const reply = await udpExchange(listenPort, 'ping')
    expect(reply?.toString()).toBe('ping')
    const status = engine.status()
    expect(status.rules[0].counters).toMatchObject({ up: 4, down: 4, upPackets: 1, downPackets: 1 })
    expect(status.sessions).toBe(1)
    expect(engine.log.find((e) => e.dir === 'event' && e.conn)?.text).toMatch(/^UDP session from 127\.0\.0\.1:\d+/)
  })

  it('perd des datagrammes', async () => {
    await engine.start(rule({ protocol: 'udp', faults: { ...DEFAULT_FAULTS, loss: 100 } }))
    expect(await udpExchange(listenPort, 'ping', 250)).toBe(null)
    expect(engine.status().rules[0].counters.dropped).toBe(1)
    await sleep(120)
    expect(engine.log.find((e) => e.dir === 'up')).toMatchObject({ fault: 'lost', size: 4 })
  })
})

describe('Défauts du simulateur et points', () => {
  beforeEach(async () => {
    echo = await tcpEcho()
  })

  it('coupe, bloque et retarde le trafic de toutes les redirections', async () => {
    await engine.start(rule())
    const client = await tcpClient(listenPort)
    engine.setFaults([{ id: 'f', type: 'cut', params: {}, points: [] }])
    expect(await client.closed()).toBe(true)
    expect(engine.status().simulatorFaults).toEqual(['cut'])
    const refused = await tcpClient(listenPort)
    expect(await refused.closed()).toBe(true)

    engine.setFaults([{ id: 'd', type: 'delay', params: { ms: 120 }, points: [] }])
    const delayed = await tcpClient(listenPort)
    const t0 = Date.now()
    delayed.write('z')
    expect(await delayed.received(1)).toBe(true)
    // Retard ajouté dans chaque sens.
    expect(Date.now() - t0).toBeGreaterThanOrEqual(235)

    engine.setFaults([{ id: 'n', type: 'noResponse', params: {}, points: [] }])
    delayed.write('y')
    expect(await delayed.received(2, 250)).toBe(false)
  })

  it('publie les compteurs des redirections', async () => {
    const api = createPointsApi({ engine })
    expect(api.faultTypes().map((f) => f.type)).toEqual(['delay', 'noResponse', 'cut'])
    await engine.start(rule())
    const client = await tcpClient(listenPort)
    client.write('abc')
    await client.received(3)
    expect(api.read(['proxy:running', 'proxy:connections', 'proxy:bytesUp', 'proxy:bytesDown'])).toEqual({
      'proxy:running': 1,
      'proxy:connections': 1,
      'proxy:bytesUp': 3,
      'proxy:bytesDown': 3
    })
    expect(await errorOf(() => api.write('proxy:running', 0))).toBe('Point proxy:running is read-only')
  })
})
