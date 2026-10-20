import fs from 'fs/promises'
import net from 'net'
import path from 'path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ensureCertificate } from '@shared/certificate'
import { hashPassword } from '@shared/passwords'
import { FtpServer, parsePortRange } from '@modules/ftp/main/server'
import { FtpClient } from '@modules/ftp/main/client'
import { DEFAULT_SERVER_CONFIG } from '@modules/ftp/shared/constants'
import { errorOf, freePort, sleep, tempDir } from './helpers'

let tmp, root, server, port
const clients = []
const firmware = Buffer.from(Array.from({ length: 300_000 }, (_, i) => (i * 13) & 0xff))
const getCertificate = () => ensureCertificate(path.join(tmp.dir, 'pki'), 'FTP@Sulfur')

async function connect(extra = {}) {
  const client = new FtpClient()
  clients.push(client)
  await client.connect({ host: '127.0.0.1', port, username: 'sulfur', password: 'secret', timeout: 3000, ...extra })
  return client
}

/** Échange brut sur le canal de commande : réponse complète (multi-lignes) de chaque commande. */
async function raw(targetPort = port) {
  const socket = net.connect(targetPort, '127.0.0.1')
  let buffer = ''
  const waiters = []
  const drain = () => {
    for (;;) {
      const match = buffer.match(/^(?:\d{3}-[\s\S]*?\r\n)*?(\d{3}) [^\r\n]*\r\n/)
      if (!match || !waiters.length) break
      buffer = buffer.slice(match[0].length)
      waiters.shift()(match[0].trim())
    }
  }
  socket.on('data', (chunk) => {
    buffer += chunk
    drain()
  })
  const next = () =>
    new Promise((resolve) => {
      waiters.push(resolve)
      drain()
    })
  const banner = await next()
  return {
    banner,
    socket,
    next,
    send: (line) => {
      socket.write(`${line}\r\n`)
      return next()
    },
    close: () => socket.destroy()
  }
}

async function startServer(extra = {}) {
  const s = new FtpServer(getCertificate, root)
  const p = await freePort()
  await s.start({
    ...DEFAULT_SERVER_CONFIG,
    host: '127.0.0.1',
    port: p,
    users: [
      { id: 'a', username: 'sulfur', passwordHash: await hashPassword('secret'), readOnly: false },
      { id: 'b', username: 'viewer', password: 'viewer', readOnly: true }
    ],
    ...extra
  })
  return { s, p }
}

beforeAll(async () => {
  tmp = await tempDir('ftp')
  root = path.join(tmp.dir, 'files')
  await fs.mkdir(path.join(root, 'recipes'), { recursive: true })
  await fs.writeFile(path.join(root, 'recipes', 'firmware.bin'), firmware)
  await fs.writeFile(path.join(tmp.dir, 'outside.txt'), 'secret outside')
  await fs.symlink(path.join(tmp.dir, 'outside.txt'), path.join(root, 'escape.txt'))
  ;({ s: server, p: port } = await startServer({ logCommands: true }))
})

afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect()
  server.setFaults([])
  await server.update({ ...server.config, anonymous: false })
})

afterAll(async () => {
  await server.stop()
  await tmp.cleanup()
})

describe('Serveur et client FTP', () => {
  it('vérifie la plage de ports passifs', () => {
    expect(parsePortRange('')).toBeNull()
    expect(parsePortRange('50000-50010')).toEqual({ min: 50000, max: 50010 })
    expect(() => parsePortRange('80-90')).toThrow(/passive port range/)
  })

  it('authentifie les utilisateurs et masque les mots de passe', async () => {
    const client = await connect()
    expect(client.status()).toMatchObject({ connected: true, secure: false, cwd: '/' })
    expect(await errorOf(connect({ password: 'wrong' }))).toMatch(/^Login refused by the server: 530/)
    expect(await errorOf(connect({ username: 'nobody' }))).toMatch(/^Login refused by the server: 530/)
    expect(server.status().counters).toMatchObject({ logins: 1, failures: 2 })
    expect(server.status().config.users.find((u) => u.username === 'viewer').passwordHash).toMatch(/^scrypt\$/)
    const logged = server.logs().map((l) => l.message)
    expect(logged).toContain('> PASS ****')
    expect(logged.some((m) => m.includes('secret'))).toBe(false)
    expect(client.dialog.some((d) => d.message.startsWith('< 230'))).toBe(true)
  })

  it('accepte la connexion anonyme en lecture seule si elle est activée', async () => {
    expect(await errorOf(connect({ username: 'anonymous', password: 'me@example.com' }))).toMatch(/530/)
    await server.update({ ...server.config, anonymous: true })
    const guest = await connect({ username: 'anonymous', password: 'me@example.com' })
    expect((await guest.list('/recipes')).entries.map((e) => e.name)).toEqual(['firmware.bin'])
    expect(await errorOf(guest.mkdir('/nope'))).toMatch(/^550/)
  })

  it('liste, envoie, télécharge, reprend, renomme et supprime', async () => {
    const client = await connect()
    const top = await client.list('/')
    expect(top.entries.map((e) => `${e.type}:${e.name}`)).toEqual(['dir:recipes', 'link:escape.txt'])
    const listing = await client.list('recipes')
    expect(listing).toMatchObject({
      path: '/recipes',
      entries: [{ name: 'firmware.bin', size: 300_000, type: 'file' }]
    })
    expect(listing.entries[0].mtime).toMatch(/^\d{4}-\d\d-\d\dT/)

    const local = path.join(tmp.dir, 'download.bin')
    await client.download('firmware.bin', local)
    expect((await fs.readFile(local)).equals(firmware)).toBe(true)

    // Reprise d'un téléchargement interrompu (REST).
    const partial = path.join(tmp.dir, 'partial.bin')
    await fs.writeFile(partial, firmware.subarray(0, 100_000))
    const handle = await fs.open(partial, 'a')
    await client.call((c) => c.downloadTo(handle.createWriteStream(), '/recipes/firmware.bin', 100_000))
    await handle.close()
    expect((await fs.readFile(partial)).equals(firmware)).toBe(true)

    const upload = path.join(tmp.dir, 'line.cfg')
    await fs.writeFile(upload, 'speed=1200\n')
    await client.upload(upload)
    expect(await fs.readFile(path.join(root, 'recipes', 'line.cfg'), 'utf8')).toBe('speed=1200\n')
    await client.call((c) => c.appendFrom(upload, 'line.cfg'))
    expect(await fs.readFile(path.join(root, 'recipes', 'line.cfg'), 'utf8')).toBe('speed=1200\nspeed=1200\n')

    await client.mkdir('/backups')
    await client.rename('line.cfg', '/backups/line.cfg')
    expect((await client.list('/backups')).entries.map((e) => e.name)).toEqual(['line.cfg'])
    await client.remove('line.cfg', 'file')
    await client.remove('/backups', 'dir')
    expect(await errorOf(fs.access(path.join(root, 'backups')))).toMatch(/ENOENT/)
    expect(server.status().counters).toMatchObject({ uploads: 2, downloads: 2 })
    expect(server.logs().map((l) => l.message)).toContain('sulfur uploaded /recipes/line.cfg (11 bytes)')
  })

  it('confine au dossier servi, y compris par un lien symbolique', async () => {
    const client = await connect()
    expect((await client.list('/../..')).path).toBe('/')
    expect(await errorOf(client.download('/escape.txt', path.join(tmp.dir, 'stolen.txt')))).toBe(
      '550 Permission denied'
    )
    expect(server.logs().some((l) => l.message.includes('outside the served folder'))).toBe(true)
  })

  it('interdit les écritures à un utilisateur en lecture seule', async () => {
    const viewer = await connect({ username: 'viewer', password: 'viewer' })
    const upload = path.join(tmp.dir, 'x.txt')
    await fs.writeFile(upload, 'x')
    expect(await errorOf(viewer.upload(upload))).toBe('550 Permission denied')
    expect(await errorOf(viewer.remove('/recipes/firmware.bin', 'file'))).toBe('550 Permission denied')
  })

  it('répond au format « ls -l », convertit en mode ASCII et refuse le rebond FTP', async () => {
    const session = await raw()
    expect(session.banner).toBe('220 Sulfur FTP server ready')
    expect(await session.send('LIST')).toBe('530 Please login with USER and PASS')
    await session.send('USER sulfur')
    expect(await session.send('PASS secret')).toBe('230 Login successful')
    expect(await session.send('FEAT')).toMatch(
      /^211-Features:\r\n UTF8[\s\S]* MLST type\*;size\*;modify\*;perm\*;\r\n211 End$/
    )
    expect(await session.send('PORT 10,0,0,99,200,10')).toBe('500 Illegal PORT command')
    expect(await session.send('SIZE /recipes/firmware.bin')).toBe('213 300000')
    expect(await session.send('MDTM /nope')).toBe('550 No such file or directory')
    expect(await session.send('CWD recipes')).toBe('250 Directory changed to /recipes')
    expect(await session.send('PWD')).toBe('257 "/recipes" is the current directory')

    const data = async (command) => {
      const reply = await session.send('PASV')
      const [, h1, h2, h3, h4, p1, p2] = reply.match(/\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/)
      const socket = net.connect(Number(p1) * 256 + Number(p2), `${h1}.${h2}.${h3}.${h4}`)
      const chunks = []
      socket.on('data', (c) => chunks.push(c))
      const closed = new Promise((resolve) => socket.on('close', resolve))
      await new Promise((resolve) => socket.on('connect', resolve))
      const first = await session.send(command)
      const second = await session.next()
      await closed
      return { first, second, body: Buffer.concat(chunks).toString() }
    }
    const list = await data('LIST -la')
    expect(list.first).toMatch(/^150 /)
    expect(list.second).toBe('226 Transfer complete')
    expect(list.body).toMatch(/^-rw.{7} 1 ftp ftp +300000 \w{3} [ \d]\d [ \d]\d:\d\d firmware\.bin\r\n$/)

    await fs.writeFile(path.join(root, 'recipes', 'notes.txt'), 'a\nb\n')
    expect(await session.send('TYPE A')).toBe('200 Type set to A')
    expect((await data('RETR notes.txt')).body).toBe('a\r\nb\r\n')
    session.close()
  })

  it('chiffre en FTPS explicite, et l’exige si demandé', async () => {
    const { s, p } = await startServer({ tls: 'explicit', requireTls: true })
    try {
      const plain = new FtpClient()
      expect(
        await errorOf(plain.connect({ host: '127.0.0.1', port: p, username: 'sulfur', password: 'secret' }))
      ).toMatch(/TLS required/)
      const secure = new FtpClient()
      clients.push(secure)
      await secure.connect({ host: '127.0.0.1', port: p, username: 'sulfur', password: 'secret', tls: 'explicit' })
      expect(secure.status()).toMatchObject({ secure: true, certificate: { subject: 'FTP@Sulfur' } })
      expect(secure.status().certificate.fingerprint).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/)
      const local = path.join(tmp.dir, 'tls.bin')
      await secure.download('/recipes/firmware.bin', local)
      expect((await fs.readFile(local)).equals(firmware)).toBe(true)
      expect(s.status().sessions[0]).toMatchObject({ username: 'sulfur', secure: true })
      // Vérification du certificat : refusé (auto-signé).
      expect(
        await errorOf(
          new FtpClient().connect({
            host: '127.0.0.1',
            port: p,
            username: 'sulfur',
            password: 'secret',
            tls: 'explicit',
            verifyCertificate: true
          })
        )
      ).toMatch(/^Server certificate refused/)
    } finally {
      await s.stop()
    }
  })

  it('accepte le FTPS implicite', async () => {
    const { s, p } = await startServer({ tls: 'implicit' })
    try {
      const client = new FtpClient()
      clients.push(client)
      await client.connect({ host: '127.0.0.1', port: p, username: 'sulfur', password: 'secret', tls: 'implicit' })
      expect((await client.list('/recipes')).entries.map((e) => e.name)).toContain('firmware.bin')
      expect(s.status().endpoint).toBe(`ftps://127.0.0.1:${p}`)
    } finally {
      await s.stop()
    }
  })

  it('applique les défauts simulés', async () => {
    const client = await connect()
    server.setFaults([{ type: 'exception', params: { code: 550 } }])
    expect(await errorOf(client.download('/recipes/firmware.bin', path.join(tmp.dir, 'f.bin')))).toBe(
      '550 Requested action aborted'
    )
    server.setFaults([{ type: 'cut' }])
    await sleep(100)
    expect(client.status().connected).toBe(false)
    expect(await errorOf(connect())).toMatch(/421/)
  })
})
