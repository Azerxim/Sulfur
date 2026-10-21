import { EventEmitter } from 'events'
import net from 'net'
import { afterEach, describe, expect, it } from 'vitest'
import {
  encodePayload,
  escapedText,
  fromHex,
  parseEscaped,
  parseHex,
  textSegments,
  toHex
} from '@modules/serial/shared/codec'
import { normalizePort, portLabel } from '@modules/serial/main/serial'
import { SerialTerminal } from '@modules/serial/main/terminal'
import { SerialGateway } from '@modules/serial/main/gateway'
import { createPointsApi } from '@modules/serial/main/points'
import { MAX_FRAME } from '@modules/serial/shared/constants'
import { errorOf, freePort, sleep } from './helpers'

/** Port série simulé : octets écrits retenus, lignes de contrôle, réception par `feed`. */
class FakePort extends EventEmitter {
  isOpen = true
  written = []
  sets = []
  lines = { cts: true, dsr: false, dcd: false }
  write(data, callback) {
    this.written.push(Buffer.from(data))
    setImmediate(() => callback?.())
    return true
  }
  set(options, callback) {
    this.sets.push(options)
    setImmediate(() => callback?.(null))
  }
  get(callback) {
    setImmediate(() => callback(null, this.lines))
  }
  close(callback) {
    if (this.isOpen) {
      this.isOpen = false
      this.emit('close')
    }
    callback?.()
  }
  feed(bytes) {
    this.emit('data', Buffer.from(bytes))
  }
  get output() {
    return Buffer.concat(this.written)
  }
}

const PORT = { path: '/dev/ttyTEST', baudRate: 115200, dataBits: 8, parity: 'none', stopBits: 1 }

let terminal, gateway, port

/** Terminal ouvert sur un port simulé. */
async function openTerminal(rx = { framing: 'gap', gap: 15 }, options = {}) {
  port = new FakePort()
  terminal = new SerialTerminal({ openSerial: async () => port, ...options })
  await terminal.open(PORT, rx)
  return terminal
}

const frames = (dir) =>
  terminal.log.filter((e) => e.dir === dir).map((e) => Buffer.from(e.hex, 'hex').toString('latin1'))
const events = () => terminal.log.filter((e) => e.dir === 'event').map((e) => e.text)

afterEach(async () => {
  await gateway?.stop()
  await terminal?.dispose()
  gateway = terminal = null
})

describe('Saisies et affichage', () => {
  it('lit les octets en hexadécimal sous plusieurs notations', async () => {
    expect(toHex(parseHex('01 03 0a'))).toBe('01 03 0A')
    expect(toHex(parseHex('01030A'))).toBe('01 03 0A')
    expect(toHex(parseHex('0x01, 0x03;0A'))).toBe('01 03 0A')
    expect(toHex(parseHex('1 2 f'))).toBe('01 02 0F')
    expect(toHex(parseHex('01:03-0A'))).toBe('01 03 0A')
    expect(await errorOf(() => parseHex('01 0G'))).toBe('Invalid hexadecimal value: 0G')
    expect(await errorOf(() => parseHex('010'))).toBe('Odd number of hexadecimal digits: 010')
    expect(fromHex('01030a')).toEqual(Uint8Array.from([1, 3, 10]))
  })

  it('reconnaît les séquences d’échappement dans le texte', () => {
    expect(toHex(parseEscaped('AT\\r\\n'))).toBe('41 54 0D 0A')
    expect(toHex(parseEscaped('\\x02data\\x03'))).toBe('02 64 61 74 61 03')
    expect(toHex(parseEscaped('a\\\\b \\q \\x4'))).toBe('61 5C 62 20 5C 71 20 5C 78 34')
    expect(toHex(parseEscaped('é'))).toBe('C3 A9')
    expect(toHex(parseEscaped('end\\'))).toBe('65 6E 64 5C')
  })

  it('ajoute la fin de ligne aux envois en texte seulement', async () => {
    expect(toHex(encodePayload({ mode: 'text', text: 'AT', lineEnding: 'crlf' }))).toBe('41 54 0D 0A')
    expect(toHex(encodePayload({ mode: 'text', text: 'AT', lineEnding: 'cr' }))).toBe('41 54 0D')
    expect(toHex(encodePayload({ mode: 'hex', text: '01 02', lineEnding: 'crlf' }))).toBe('01 02')
    expect(await errorOf(() => encodePayload({ mode: 'text', text: '', lineEnding: 'none' }))).toBe('Nothing to send')
  })

  it('montre les caractères de contrôle comme dans une saisie', () => {
    const bytes = Buffer.from([0x02, 0x4f, 0x4b, 0x0d, 0x0a, 0xff])
    expect(textSegments(bytes)).toEqual([
      { text: '\\x02', control: true },
      { text: 'OK', control: false },
      { text: '\\r\\n\\xFF', control: true }
    ])
    expect(escapedText(bytes)).toBe('\\x02OK\\r\\n\\xFF')
  })
})

describe('Paramètres de liaison', () => {
  it('valide les paramètres et les note en abrégé', () => {
    const port = normalizePort({
      path: ' COM3 ',
      baudRate: '19200',
      dataBits: 7,
      parity: 'even',
      stopBits: 2,
      flowControl: 'rtscts'
    })
    expect(port).toEqual({
      path: 'COM3',
      baudRate: 19200,
      dataBits: 7,
      parity: 'even',
      stopBits: 2,
      flowControl: 'rtscts',
      dtr: true,
      rts: true
    })
    expect(portLabel(port)).toBe('19200 7E2 RTS/CTS')
    expect(portLabel(normalizePort({ path: 'x', stopBits: 1.5, parity: 'mark' }))).toBe('9600 8M1.5')
  })

  it('refuse les paramètres invalides', async () => {
    expect(await errorOf(() => normalizePort({ path: '' }))).toBe('Choose the serial port')
    expect(await errorOf(() => normalizePort({ path: 'x', baudRate: 10 }))).toBe('Invalid baud rate: 10')
    expect(await errorOf(() => normalizePort({ path: 'x', dataBits: 9 }))).toBe('Invalid number of data bits (5 to 8)')
    expect(await errorOf(() => normalizePort({ path: 'x', stopBits: 3 }))).toBe(
      'Invalid number of stop bits (1, 1.5 or 2)'
    )
    expect(await errorOf(() => normalizePort({ path: 'x', parity: 'bad' }))).toBe('Unknown parity')
    expect(await errorOf(() => normalizePort({ path: 'x', flowControl: 'dsr' }))).toBe('Unknown flow control')
  })
})

describe('Terminal', () => {
  it('ouvre le port, positionne DTR / RTS et lit les lignes d’entrée', async () => {
    await openTerminal()
    expect(terminal.status()).toMatchObject({ open: true, label: '115200 8N1' })
    expect(port.sets[0]).toEqual({ dtr: true, rts: true, brk: false })
    await sleep(20)
    expect(terminal.signals).toEqual({ cts: true, dsr: false, dcd: false })
    port.lines = { cts: false, dsr: true, dcd: true }
    await sleep(300)
    expect(terminal.signals).toEqual({ cts: false, dsr: true, dcd: true })
    expect(await errorOf(() => terminal.open(PORT))).toBe('The port is already open')
  })

  it('change une ligne de sortie sans toucher à l’autre et envoie un BREAK', async () => {
    await openTerminal()
    await terminal.setOutputs({ rts: false })
    expect(port.sets.at(-1)).toEqual({ dtr: true, rts: false, brk: false })
    await terminal.sendBreak(10)
    expect(port.sets.slice(-2)).toEqual([
      { dtr: true, rts: false, brk: true },
      { dtr: true, rts: false, brk: false }
    ])
    expect(events().at(-1)).toBe('BREAK sent (10 ms)')
  })

  it('regroupe les octets reçus en trames après un silence', async () => {
    await openTerminal()
    port.feed('he')
    port.feed('llo')
    await sleep(40)
    port.feed('world')
    await sleep(40)
    expect(frames('rx')).toEqual(['hello', 'world'])
    expect(terminal.counters).toMatchObject({ rxBytes: 10, rxFrames: 2 })
    expect(terminal.lastReceived.toString()).toBe('world')
  })

  it('coupe les trames à chaque fin de ligne en découpage « newline »', async () => {
    await openTerminal({ framing: 'newline', gap: 15 })
    port.feed('OK\r\nERR')
    port.feed('OR\r\npartial')
    await sleep(40)
    expect(frames('rx')).toEqual(['OK\r\n', 'ERROR\r\n', 'partial'])
  })

  it('coupe les trames trop longues', async () => {
    await openTerminal()
    port.feed(Buffer.alloc(MAX_FRAME + 10, 0x41))
    await sleep(40)
    expect(frames('rx').map((f) => f.length)).toEqual([MAX_FRAME, 10])
  })

  it('envoie du texte et de l’hexadécimal, après la trame reçue en cours', async () => {
    await openTerminal({ framing: 'gap', gap: 1000 })
    port.feed('prompt>')
    await terminal.send({ mode: 'text', text: 'AT', lineEnding: 'crlf' })
    await terminal.send({ mode: 'hex', text: '01 03' }, 'test')
    expect(port.output.toString('hex')).toBe('41540d0a0103')
    expect(terminal.log.filter((e) => e.dir !== 'event').map((e) => [e.dir, e.hex, e.source])).toEqual([
      ['rx', Buffer.from('prompt>').toString('hex'), undefined],
      ['tx', '41540d0a', undefined],
      ['tx', '0103', 'test']
    ])
    expect(terminal.counters).toMatchObject({ txBytes: 6, txFrames: 2 })
  })

  it('répète un envoi jusqu’à son arrêt', async () => {
    await openTerminal()
    expect(await errorOf(() => terminal.startRepeat({ mode: 'hex', text: 'AA' }, 5))).toBe('Minimum period: 10 ms')
    await terminal.startRepeat({ mode: 'hex', text: 'AA' }, 20)
    expect(terminal.status().repeating).toEqual({ interval: 20, bytes: 1 })
    await sleep(110)
    terminal.stopRepeat()
    const count = port.written.length
    expect(count).toBeGreaterThanOrEqual(4)
    await sleep(50)
    expect(port.written.length).toBe(count)
  })

  it('se ferme quand le système retire le port', async () => {
    await openTerminal()
    await terminal.startRepeat({ mode: 'hex', text: 'AA' }, 20)
    port.close()
    expect(terminal.status()).toMatchObject({ open: false, repeating: null, signals: null })
    expect(events().at(-1)).toBe('Port /dev/ttyTEST closed by the system (adapter unplugged?)')
    expect(await errorOf(() => terminal.send({ mode: 'hex', text: 'AA' }))).toBe('The serial port is not open')
  })

  it('exporte le journal en texte', async () => {
    await openTerminal()
    await terminal.send({ mode: 'text', text: 'hi', lineEnding: 'cr' })
    const lines = terminal.exportText().trim().split('\n')
    expect(lines[0]).toMatch(/Z -- {2}Port \/dev\/ttyTEST opened \(115200 8N1\)$/)
    expect(lines[1]).toMatch(/Z TX \[3\] 68 69 0D \| hi\\r$/)
  })

  it('envoie le journal à l’interface par lots, avec les compteurs', async () => {
    const batches = []
    let status = null
    await openTerminal(undefined, { onLog: (batch) => batches.push(batch), onStatus: (s) => (status = s) })
    port.feed('abc')
    await sleep(150)
    expect(batches.flat().map((e) => e.dir)).toEqual(['event', 'rx'])
    expect(status.counters.rxBytes).toBe(3)
  })
})

describe('Passerelle série ↔ TCP', () => {
  /** Client TCP connecté à la passerelle, avec les octets reçus. */
  async function connect(tcpPort) {
    const socket = net.connect(tcpPort, '127.0.0.1')
    socket.received = []
    socket.on('data', (d) => socket.received.push(d))
    await new Promise((resolve, reject) => socket.once('connect', resolve).once('error', reject))
    await sleep(20)
    return socket
  }

  it('demande un port série ouvert', async () => {
    terminal = new SerialTerminal({ openSerial: async () => new FakePort() })
    gateway = new SerialGateway(terminal)
    const tcpPort = await freePort()
    expect(await errorOf(() => gateway.start({ port: tcpPort }))).toBe(
      'Open the serial port before starting the gateway'
    )
  })

  it('relaie les octets dans les deux sens', async () => {
    await openTerminal()
    gateway = new SerialGateway(terminal)
    const tcpPort = await freePort()
    await gateway.start({ host: '127.0.0.1', port: tcpPort, maxClients: 2 })
    const a = await connect(tcpPort)
    const b = await connect(tcpPort)
    expect(gateway.status().clients).toHaveLength(2)

    a.write(Buffer.from([1, 3, 0, 0]))
    await sleep(30)
    expect(port.output).toEqual(Buffer.from([1, 3, 0, 0]))
    expect(terminal.log.find((e) => e.dir === 'tx').source).toMatch(/^TCP 127\.0\.0\.1:\d+$/)

    port.feed([1, 3, 2, 0, 42])
    await sleep(30)
    expect(Buffer.concat(a.received)).toEqual(Buffer.from([1, 3, 2, 0, 42]))
    expect(Buffer.concat(b.received)).toEqual(Buffer.from([1, 3, 2, 0, 42]))
    a.destroy()
    b.destroy()
  })

  it('refuse les clients en trop et s’arrête avec le port', async () => {
    await openTerminal()
    gateway = new SerialGateway(terminal)
    const tcpPort = await freePort()
    await gateway.start({ host: '127.0.0.1', port: tcpPort, maxClients: 1 })
    const a = await connect(tcpPort)
    const b = await connect(tcpPort)
    await sleep(20)
    expect(b.destroyed || b.readableEnded).toBe(true)
    expect(gateway.clients.size).toBe(1)
    expect(events().some((e) => e.includes('refused: 1 client(s) at most'))).toBe(true)

    await terminal.close()
    await sleep(20)
    expect(gateway.running).toBe(false)
    expect(a.destroyed || a.readableEnded).toBe(true)
    expect(events()).toContain('Gateway stopped')
    a.destroy()
  })

  it('refuse un port TCP déjà utilisé', async () => {
    await openTerminal()
    const tcpPort = await freePort()
    const other = net.createServer().listen(tcpPort, '127.0.0.1')
    await new Promise((resolve) => other.once('listening', resolve))
    gateway = new SerialGateway(terminal)
    expect(await errorOf(() => gateway.start({ host: '127.0.0.1', port: tcpPort }))).toBe(
      `Port ${tcpPort} is already in use`
    )
    await new Promise((resolve) => other.close(resolve))
  })
})

describe('Points de données', () => {
  it('publie l’état du port et envoie les valeurs écrites', async () => {
    await openTerminal()
    gateway = new SerialGateway(terminal)
    const api = createPointsApi({ terminal, gateway, savedConfig: () => ({ send: { lineEnding: 'lf' } }) })
    expect(api.points().find((p) => p.id === 'port:send')).toMatchObject({ group: 'client', writable: true })

    await api.write('port:send', 'go')
    await api.write('port:sendHex', 'ff 00')
    await api.write('port:dtr', false)
    expect(port.output.toString('hex')).toBe('676f0aff00')
    expect(port.sets.at(-1)).toEqual({ dtr: false, rts: true, brk: false })
    expect(await errorOf(() => api.write('port:cts', true))).toBe('Point port:cts is read only')

    port.feed('OK\r')
    await sleep(40)
    expect(
      api.read([
        'port:open',
        'port:txBytes',
        'port:lastReceived',
        'port:lastReceivedHex',
        'port:dtr',
        'gateway:clients'
      ])
    ).toEqual({
      'port:open': true,
      'port:txBytes': 5,
      'port:lastReceived': 'OK\\r',
      'port:lastReceivedHex': '4f4b0d',
      'port:dtr': false,
      'gateway:clients': undefined
    })
  })
})
