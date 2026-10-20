import fs from 'fs/promises'
import path from 'path'
import ssh2 from 'ssh2'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { hashPassword } from '@shared/passwords'
import { SftpServer, ensureHostKey, fingerprint } from '@modules/ftp/main/sftp/server'
import { SftpClient } from '@modules/ftp/main/sftp/client'
import { DEFAULT_SERVER_CONFIG } from '@modules/ftp/shared/sftp'
import { errorOf, freePort, tempDir } from './helpers'

let tmp, root, server, port, userKey, hostKey
const clients = []

function newClient() {
  const client = new SftpClient()
  clients.push(client)
  return client
}

/** Client connecté (déconnecté après chaque test). */
async function connect(extra = {}) {
  const client = newClient()
  await client.connect({ host: '127.0.0.1', port, username: 'sulfur', password: 'secret', timeout: 3000, ...extra })
  return client
}

beforeAll(async () => {
  tmp = await tempDir('sftp')
  root = path.join(tmp.dir, 'files')
  await fs.mkdir(path.join(root, 'firmware'), { recursive: true })
  await fs.writeFile(path.join(root, 'firmware', 'v1.bin'), Buffer.alloc(300_000, 7))
  await fs.writeFile(path.join(tmp.dir, 'outside.txt'), 'secret outside')
  await fs.symlink(path.join(tmp.dir, 'outside.txt'), path.join(root, 'escape.txt'))
  userKey = ssh2.utils.generateKeyPairSync('ed25519')
  hostKey = await ensureHostKey(path.join(tmp.dir, 'hostkey'))
  port = await freePort()
  server = new SftpServer(() => ensureHostKey(path.join(tmp.dir, 'hostkey')), root)
  await server.start({
    ...DEFAULT_SERVER_CONFIG,
    port,
    users: [
      {
        id: 'a',
        username: 'sulfur',
        passwordHash: await hashPassword('secret'),
        authorizedKeys: userKey.public,
        readOnly: false
      },
      { id: 'b', username: 'viewer', password: 'viewer', authorizedKeys: '', readOnly: true }
    ]
  })
})

afterEach(async () => {
  for (const client of clients.splice(0)) await client.disconnect().catch(() => {})
  server.setFaults([])
})

afterAll(async () => {
  await server.stop()
  await tmp.cleanup()
})

describe('Serveur et client SFTP', () => {
  it('garde la même clé d’hôte et hache les mots de passe saisis', async () => {
    expect((await ensureHostKey(path.join(tmp.dir, 'hostkey'))).fingerprint).toBe(hostKey.fingerprint)
    expect(hostKey.fingerprint).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/)
    const viewer = server.status().config.users.find((u) => u.username === 'viewer')
    expect(viewer.passwordHash).toMatch(/^scrypt\$/)
    expect(viewer.password).toBeUndefined()
  })

  it('authentifie par mot de passe et par clé publique, refuse le reste', async () => {
    const byPassword = await connect()
    expect(byPassword.status()).toMatchObject({ connected: true, hostFingerprint: hostKey.fingerprint, cwd: '/' })
    const byKey = await connect({ auth: 'key', privateKey: userKey.private, password: '' })
    expect(byKey.status().connected).toBe(true)
    expect(await errorOf(connect({ password: 'wrong' }))).toBe('Authentication refused by the server')
    expect(await errorOf(connect({ username: 'nobody' }))).toBe('Authentication refused by the server')
    expect(server.status().counters).toMatchObject({ logins: 2 })
  })

  it('vérifie l’empreinte attendue de la clé d’hôte', async () => {
    expect(await errorOf(connect({ hostFingerprint: 'SHA256:AAAA' }))).toMatch(/host key does not match/)
    expect((await connect({ hostFingerprint: hostKey.fingerprint })).status().connected).toBe(true)
    expect(fingerprint(hostKey.publicKey)).toBe(hostKey.fingerprint)
  })

  it('liste, envoie, télécharge, renomme et supprime', async () => {
    const client = await connect()
    const top = await client.list('/')
    expect(top.entries.map((e) => `${e.type}:${e.name}`)).toEqual(['dir:firmware', 'link:escape.txt'])

    const local = path.join(tmp.dir, 'download.bin')
    await client.download('/firmware/v1.bin', local)
    expect((await fs.readFile(local)).equals(Buffer.alloc(300_000, 7))).toBe(true)

    const upload = path.join(tmp.dir, 'config.cfg')
    await fs.writeFile(upload, 'hostname plc1\n')
    await client.list('/firmware')
    await client.upload(upload)
    expect(await fs.readFile(path.join(root, 'firmware', 'config.cfg'), 'utf8')).toBe('hostname plc1\n')

    await client.mkdir('/backups')
    await client.rename('/firmware/config.cfg', '/backups/config.cfg')
    expect((await client.list('/backups')).entries.map((e) => e.name)).toEqual(['config.cfg'])
    await client.remove('/backups/config.cfg', 'file')
    await client.remove('/backups', 'dir')
    await fs.access(path.join(root, 'backups')).then(
      () => expect.fail('not removed'),
      () => {}
    )
    expect(server.status().counters).toMatchObject({ uploads: 1, downloads: 1 })
    expect(server.logs().map((l) => l.message)).toContain('sulfur uploaded /firmware/config.cfg (14 bytes)')
  })

  it('confine au dossier servi, y compris par un lien symbolique', async () => {
    const client = await connect()
    expect((await client.list('/../..')).path).toBe('/')
    expect(await errorOf(client.download('/escape.txt', path.join(tmp.dir, 'stolen.txt')))).toBe('Permission denied')
    expect(server.logs().some((l) => l.message.includes('outside the served folder'))).toBe(true)
  })

  it('interdit les écritures à un utilisateur en lecture seule', async () => {
    const viewer = await connect({ username: 'viewer', password: 'viewer' })
    expect((await viewer.list('/firmware')).entries.map((e) => e.name)).toContain('v1.bin')
    expect(await errorOf(viewer.mkdir('/nope'))).toBe('Permission denied')
    const upload = path.join(tmp.dir, 'x.txt')
    await fs.writeFile(upload, 'x')
    expect(await errorOf(viewer.upload(upload))).toBe('Permission denied')
    expect(await errorOf(viewer.remove('/firmware/v1.bin', 'file'))).toBe('Permission denied')
  })

  it('coupe les sessions sur défaut du simulateur', async () => {
    const client = await connect()
    server.setFaults([{ type: 'cut' }])
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(client.status().connected).toBe(false)
    expect(await errorOf(connect())).toBe('Connection closed by the server before authentication')
  })

  it('refuse un utilisateur sans mot de passe ni clé', async () => {
    const other = new SftpServer(() => hostKey, root)
    expect(
      await errorOf(other.start({ ...DEFAULT_SERVER_CONFIG, port: await freePort(), users: [{ username: 'x' }] }))
    ).toMatch(/neither password nor public key/)
  })
})
