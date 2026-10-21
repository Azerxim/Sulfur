import dgram from 'dgram'
import fs from 'fs/promises'
import path from 'path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { TftpServer } from '@modules/tftp/main/server'
import { TftpClient } from '@modules/tftp/main/client'
import { OP, decode, encodeAck, encodeRequest, fromNetascii, toNetascii } from '@modules/tftp/main/protocol'
import { DEFAULT_SERVER_CONFIG } from '@modules/tftp/shared/constants'
import { sleep, tempDir } from './helpers'

let tmp, root, server, port
const client = new TftpClient()
const firmware = Buffer.from(Array.from({ length: 100_000 }, (_, i) => (i * 7) & 0xff))

/** Port UDP libre (le serveur TFTP n'écoute qu'en UDP). */
async function freeUdpPort() {
  const socket = dgram.createSocket('udp4')
  await new Promise((resolve) => socket.bind(0, '127.0.0.1', resolve))
  const { port } = socket.address()
  await new Promise((resolve) => socket.close(resolve))
  return port
}

const get = (options) => client.get({ host: '127.0.0.1', port, timeout: 1, retries: 2, ...options })
const put = (options, data) => client.put({ host: '127.0.0.1', port, timeout: 1, retries: 2, ...options }, data)

beforeAll(async () => {
  tmp = await tempDir('tftp')
  root = path.join(tmp.dir, 'files')
  await fs.mkdir(path.join(root, 'configs'), { recursive: true })
  await fs.writeFile(path.join(root, 'firmware.bin'), firmware)
  await fs.writeFile(path.join(root, 'exact.bin'), Buffer.alloc(1024, 1))
  await fs.writeFile(path.join(root, 'configs', 'plc1.cfg'), 'hostname plc1\nip 10.0.0.1\n')
  await fs.writeFile(path.join(tmp.dir, 'outside.txt'), 'secret')
  await fs.symlink(path.join(tmp.dir, 'outside.txt'), path.join(root, 'escape.txt'))
  port = await freeUdpPort()
  server = new TftpServer(root)
  await server.start({ ...DEFAULT_SERVER_CONFIG, host: '127.0.0.1', port, timeout: 0.2, retries: 3 })
})

afterEach(() => {
  server.setFaults([])
  server.update({ ...server.config, allowWrite: true, allowOverwrite: false, maxBlockSize: 65464 })
})

afterAll(async () => {
  await server.stop()
  await tmp.cleanup()
})

describe('Protocole TFTP', () => {
  it('convertit les fins de ligne en netascii et retour', () => {
    const text = Buffer.from('a\nb\rc\r\nd')
    expect(toNetascii(text)).toEqual(Buffer.from('a\r\nb\r\0c\r\0\r\nd'))
    expect(fromNetascii(toNetascii(text))).toEqual(text)
  })

  it('encode et décode les requêtes avec options', () => {
    const packet = decode(encodeRequest(OP.RRQ, 'boot/fw.bin', 'octet', { blksize: 1428, tsize: 0 }))
    expect(packet).toEqual({
      op: OP.RRQ,
      filename: 'boot/fw.bin',
      mode: 'octet',
      options: { blksize: '1428', tsize: '0' }
    })
  })
})

describe('Serveur et client TFTP', () => {
  it('télécharge avec négociation de la taille de bloc et de la taille du fichier', async () => {
    const { entry, data } = await get({ remoteFile: 'firmware.bin', blockSize: 1428, tsize: true })
    expect(entry).toMatchObject({ ok: true, blockSize: 1428, options: { blksize: 1428, tsize: 100_000 } })
    expect(entry.blocks).toBe(Math.floor(100_000 / 1428) + 1)
    expect(data.equals(firmware)).toBe(true)
    await sleep(50)
    expect(server.logs().at(-1).message).toMatch(/^Sent \/firmware\.bin: 100000 bytes, 71 block\(s\) of 1428 bytes/)
  })

  it('transfère sans option en blocs de 512 octets, bloc final vide si la taille est un multiple', async () => {
    const { entry, data } = await get({ remoteFile: 'exact.bin', blockSize: 512, tsize: false })
    expect(entry).toMatchObject({ ok: true, blockSize: 512, blocks: 3, options: {} })
    expect(data.equals(Buffer.alloc(1024, 1))).toBe(true)
  })

  it('limite la taille de bloc au maximum du serveur', async () => {
    server.update({ ...server.config, maxBlockSize: 1024 })
    const { entry } = await get({ remoteFile: 'firmware.bin', blockSize: 65464 })
    expect(entry).toMatchObject({ ok: true, blockSize: 1024 })
  })

  it('transfère en mode netascii', async () => {
    const { data } = await get({ remoteFile: 'configs/plc1.cfg', mode: 'netascii' })
    expect(data.toString()).toBe('hostname plc1\nip 10.0.0.1\n')
    expect((await put({ remoteFile: 'configs/sw1.cfg', mode: 'netascii' }, 'a\nb\n')).ok).toBe(true)
    expect(await fs.readFile(path.join(root, 'configs', 'sw1.cfg'), 'utf8')).toBe('a\nb\n')
  })

  it('reçoit des fichiers, sans remplacer un fichier existant sauf autorisation', async () => {
    const backup = Buffer.alloc(5000, 9)
    expect(await put({ remoteFile: '/backup.bin', blockSize: 1024 }, backup)).toMatchObject({ ok: true, blocks: 5 })
    expect((await fs.readFile(path.join(root, 'backup.bin'))).equals(backup)).toBe(true)
    expect((await put({ remoteFile: 'backup.bin' }, 'x')).error).toBe('Error 6 from the server: File already exists')
    server.update({ ...server.config, allowOverwrite: true })
    expect((await put({ remoteFile: 'backup.bin' }, 'x')).ok).toBe(true)
    expect(await fs.readFile(path.join(root, 'backup.bin'), 'utf8')).toBe('x')
    server.update({ ...server.config, allowWrite: false })
    expect((await put({ remoteFile: 'other.bin' }, 'x')).error).toBe('Error 2 from the server: Write not allowed')
    expect(server.status().counters).toMatchObject({ writes: 3 })
  })

  it('refuse les fichiers absents et confine au dossier servi', async () => {
    expect((await get({ remoteFile: 'missing.bin' })).entry.error).toBe('Error 1 from the server: File not found')
    // « .. » ne remonte pas au-dessus de la racine du serveur.
    expect((await get({ remoteFile: '../outside.txt' })).entry.error).toBe('Error 1 from the server: File not found')
    expect((await get({ remoteFile: 'escape.txt' })).entry.error).toBe('Error 2 from the server: Access violation')
    expect((await put({ remoteFile: 'nodir/x.bin' }, 'x')).error).toBe('Error 2 from the server: Directory not found')
    expect(server.logs().some((l) => l.message === 'Access outside the served folder refused (escape.txt)')).toBe(true)
  })

  it('retransmet un bloc non acquitté et ignore les acquittements en double', async () => {
    const socket = dgram.createSocket('udp4')
    await new Promise((resolve) => socket.bind(0, '127.0.0.1', resolve))
    const received = []
    socket.on('message', (msg, rinfo) => received.push({ packet: decode(msg), port: rinfo.port }))
    socket.send(encodeRequest(OP.RRQ, 'configs/plc1.cfg', 'octet'), port, '127.0.0.1')
    // Premier DATA 1 non acquitté : retransmis après le délai d'attente du serveur (0,2 s).
    await new Promise((resolve) => setTimeout(resolve, 350))
    expect(received.filter((r) => r.packet.op === OP.DATA && r.packet.block === 1).length).toBeGreaterThanOrEqual(2)
    const tid = received[0].port
    expect(tid).not.toBe(port)
    // Paquet envoyé depuis un autre port : erreur 5 (identifiant de transfert inconnu).
    const intruder = dgram.createSocket('udp4')
    const reply = new Promise((resolve) => intruder.once('message', (msg) => resolve(decode(msg))))
    intruder.send(encodeAck(1), tid, '127.0.0.1')
    expect(await reply).toMatchObject({ op: OP.ERROR, code: 5 })
    intruder.close()
    socket.send(encodeAck(1), tid, '127.0.0.1')
    socket.send(encodeAck(1), tid, '127.0.0.1')
    await new Promise((resolve) => setTimeout(resolve, 100))
    socket.close()
    expect(server.logs().at(-1).message).toMatch(
      /^Sent \/configs\/plc1\.cfg: 26 bytes, 1 block\(s\).*[1-9] retransmission/
    )
  })

  it('applique les défauts simulés', async () => {
    server.setFaults([{ type: 'exception', params: { code: 3 } }])
    expect((await get({ remoteFile: 'firmware.bin' })).entry.error).toBe(
      'Error 3 from the server: Disk full or allocation exceeded'
    )
    server.setFaults([{ type: 'noResponse' }])
    const started = Date.now()
    const { entry } = await client.get({
      host: '127.0.0.1',
      port,
      remoteFile: 'firmware.bin',
      timeout: 0.1,
      retries: 1
    })
    expect(entry.error).toBe('No answer from the server (timeout)')
    expect(Date.now() - started).toBeLessThan(1000)
    server.setFaults([{ type: 'delay', params: { ms: 30 } }])
    const slow = await get({ remoteFile: 'configs/plc1.cfg', blockSize: 512, tsize: false })
    expect(slow.entry.ok).toBe(true)
    expect(slow.entry.duration).toBeGreaterThanOrEqual(30)
  })

  it('gère le retour à zéro du numéro de bloc au-delà de 65535 blocs', { timeout: 30_000 }, async () => {
    const big = Buffer.alloc(65_536 * 8 + 3, 5)
    await fs.writeFile(path.join(root, 'big.bin'), big)
    const { entry, data } = await get({ remoteFile: 'big.bin', blockSize: 8, timeout: 2 })
    expect(entry).toMatchObject({ ok: true, blocks: 65_537 })
    expect(data.equals(big)).toBe(true)
  })
})
