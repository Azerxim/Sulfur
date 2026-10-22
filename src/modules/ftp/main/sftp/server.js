import { createHash, randomUUID, timingSafeEqual } from 'crypto'
import fs from 'fs/promises'
import { constants as fsConstants } from 'fs'
import path from 'path'
import ssh2 from 'ssh2'
import { hashPassword, isPasswordHash, verifyPassword } from '@azerxim/sulfur-sdk/main'
import { DEFAULT_SERVER_CONFIG, MAX_LOG } from '../../shared/sftp'
import { t } from '../../shared/i18n'

const { Server, utils } = ssh2
const { STATUS_CODE, flagsToString } = utils.sftp
const STATUS_EMIT_INTERVAL = 500
/** Nombre d'entrées renvoyées par réponse READDIR. */
const READDIR_CHUNK = 100

/** Empreinte d'une clé publique au format d'OpenSSH : « SHA256:… ». */
export function fingerprint(publicKey) {
  const key = typeof publicKey === 'string' ? utils.parseKey(publicKey) : publicKey
  if (key instanceof Error) throw key
  const blob = key.getPublicSSH()
  return `SHA256:${createHash('sha256').update(blob).digest('base64').replace(/=+$/, '')}`
}

/**
 * Clé d'hôte du serveur (`<dir>/ssh_host_ed25519_key`), générée au premier démarrage.
 * Retourne { privateKey, publicKey, fingerprint }.
 */
export async function ensureHostKey(dir) {
  const file = path.join(dir, 'ssh_host_ed25519_key')
  let privateKey
  try {
    privateKey = await fs.readFile(file, 'utf8')
  } catch {
    const pair = utils.generateKeyPairSync('ed25519', { comment: 'Sulfur SFTP' })
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(file, pair.private, { mode: 0o600 })
    await fs.writeFile(`${file}.pub`, `${pair.public}\n`)
    privateKey = pair.private
  }
  const key = utils.parseKey(privateKey)
  if (key instanceof Error) throw key
  return {
    privateKey,
    publicKey: `${key.type} ${key.getPublicSSH().toString('base64')}`,
    fingerprint: fingerprint(key)
  }
}

/** Clés publiques autorisées d'un utilisateur (lignes OpenSSH) : blobs SSH. */
function parseAuthorizedKeys(text, username) {
  const keys = []
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const key = utils.parseKey(trimmed)
    if (key instanceof Error) throw new Error(t('sftp.errors.invalidKey', { name: username, message: key.message }))
    keys.push(key)
  }
  return keys
}

const toAttrs = (stats) => ({
  mode: stats.mode,
  uid: stats.uid ?? 0,
  gid: stats.gid ?? 0,
  size: stats.size,
  atime: Math.floor(stats.atimeMs / 1000),
  mtime: Math.floor(stats.mtimeMs / 1000)
})

/** Ligne de type « ls -l » d'une entrée (affichée par les clients SFTP). */
function longname(name, stats) {
  const type = stats.isDirectory() ? 'd' : stats.isSymbolicLink() ? 'l' : '-'
  const perms = [6, 3, 0]
    .map((shift) => {
      const bits = (stats.mode >> shift) & 7
      return `${bits & 4 ? 'r' : '-'}${bits & 2 ? 'w' : '-'}${bits & 1 ? 'x' : '-'}`
    })
    .join('')
  const date = new Date(stats.mtimeMs).toISOString().slice(0, 16).replace('T', ' ')
  return `${type}${perms} 1 sulfur sulfur ${String(stats.size).padStart(10)} ${date} ${name}`
}

/** Code de statut SFTP d'une erreur du système de fichiers. */
function statusOf(err) {
  if (err?.code === 'ENOENT') return STATUS_CODE.NO_SUCH_FILE
  if (err?.code === 'EACCES' || err?.code === 'EPERM' || err?.code === 'EEXIST' || err?.code === 'ENOTEMPTY')
    return STATUS_CODE.PERMISSION_DENIED
  return STATUS_CODE.FAILURE
}

/** Erreur de chemin : sortie du dossier servi. */
class OutsideRoot extends Error {}

/**
 * Serveur SFTP (SSH, sous-système sftp uniquement) servant un dossier : authentification par mot
 * de passe ou clé publique, utilisateurs en lecture seule, journal des transferts. Les chemins sont
 * confinés au dossier servi, y compris à travers les liens symboliques.
 */
export class SftpServer {
  server = null
  config = null
  users = new Map()
  sessions = new Map()
  logEntries = []
  counters = { logins: 0, failures: 0, uploads: 0, downloads: 0, bytesIn: 0, bytesOut: 0 }
  faults = []
  seq = 0

  /** `getHostKey()` : { privateKey, publicKey, fingerprint } ; `defaultRoot` : dossier servi par défaut. */
  constructor(getHostKey, defaultRoot, { onStatus = () => {}, onLog = () => {} } = {}) {
    this.getHostKey = getHostKey
    this.defaultRoot = defaultRoot
    this.onStatus = onStatus
    this.onLog = onLog
  }

  get running() {
    return !!this.server
  }

  status() {
    return {
      running: this.running,
      endpoint: this.running ? `sftp://${this.config.host}:${this.config.port}` : null,
      config: this.config,
      root: this.running ? this.root : null,
      hostKey: this.running ? { publicKey: this.hostKey.publicKey, fingerprint: this.hostKey.fingerprint } : null,
      counters: { ...this.counters },
      sessions: [...this.sessions.values()].map((s) => ({
        id: s.id,
        remote: s.remote,
        username: s.username,
        since: s.since
      }))
    }
  }

  /** Utilisateurs : mot de passe saisi (`password`) haché, empreinte existante conservée. */
  async prepareUsers(users = []) {
    const prepared = new Map()
    for (const u of users) {
      const username = String(u.username ?? '').trim()
      if (!username) throw new Error(t('sftp.errors.emptyUsername'))
      if (prepared.has(username)) throw new Error(t('sftp.errors.duplicateUser', { name: username }))
      const passwordHash = isPasswordHash(u.passwordHash)
        ? u.passwordHash
        : u.password
          ? await hashPassword(u.password)
          : null
      const keys = parseAuthorizedKeys(u.authorizedKeys, username)
      if (!passwordHash && !keys.length) throw new Error(t('sftp.errors.noCredential', { name: username }))
      prepared.set(username, { username, passwordHash, keys, readOnly: !!u.readOnly })
    }
    if (!prepared.size) throw new Error(t('sftp.errors.noUser'))
    return prepared
  }

  async start(options) {
    if (this.running) throw new Error(t('errors.alreadyStarted'))
    const config = { ...DEFAULT_SERVER_CONFIG, ...options }
    const port = Number(config.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(t('sftp.errors.invalidPort'))
    const users = await this.prepareUsers(config.users)
    const root = path.resolve(String(config.root ?? '').trim() || this.defaultRoot)
    await fs.mkdir(root, { recursive: true })
    const stats = await fs.stat(root).catch(() => null)
    if (!stats?.isDirectory()) throw new Error(t('sftp.errors.invalidRoot', { path: root }))
    this.realRoot = await fs.realpath(root)
    this.hostKey = await this.getHostKey()

    const server = new Server({ hostKeys: [this.hostKey.privateKey], ident: 'Sulfur_SFTP' }, (client, info) =>
      this.onClient(client, info)
    )
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, config.host || '0.0.0.0', () => {
          server.off('error', reject)
          resolve()
        })
      })
    } catch (err) {
      if (err.code === 'EACCES') throw new Error(t('sftp.errors.portPrivileged', { port }), { cause: err })
      if (err.code === 'EADDRINUSE') throw new Error(t('sftp.errors.portInUse', { port }), { cause: err })
      throw err
    }
    server.on('error', (err) => this.log('error', '', err.message))
    this.server = server
    this.root = root
    this.users = users
    this.config = {
      ...config,
      port,
      // Mots de passe : seule l'empreinte est conservée.
      users: config.users.map(({ password: _password, ...u }) => ({
        ...u,
        passwordHash: users.get(String(u.username).trim())?.passwordHash ?? ''
      }))
    }
    this.counters = { logins: 0, failures: 0, uploads: 0, downloads: 0, bytesIn: 0, bytesOut: 0 }
    this.statusTimer = setInterval(() => {
      const snapshot = JSON.stringify(this.counters)
      if (snapshot !== this.lastCounters) {
        this.lastCounters = snapshot
        this.onStatus(this.status())
      }
    }, STATUS_EMIT_INTERVAL)
    this.log('info', '', t('sftp.log.started', { endpoint: this.status().endpoint, root }))
    this.onStatus(this.status())
    return this.status()
  }

  async stop() {
    clearInterval(this.statusTimer)
    const server = this.server
    for (const s of this.sessions.values()) s.client.end()
    this.sessions.clear()
    this.server = null
    if (server) {
      await new Promise((resolve) => server.close(() => resolve()))
      this.log('info', '', t('sftp.log.stopped'))
    }
    this.onStatus(this.status())
    return this.status()
  }

  /** Utilisateurs modifiés serveur démarré (les sessions ouvertes gardent leurs droits). */
  async updateUsers(users) {
    if (!this.running) throw new Error(t('errors.notStarted'))
    const prepared = await this.prepareUsers(users)
    this.users = prepared
    this.config = {
      ...this.config,
      users: users.map(({ password: _password, ...u }) => ({
        ...u,
        passwordHash: prepared.get(String(u.username).trim())?.passwordHash ?? ''
      }))
    }
    this.onStatus(this.status())
    return this.status()
  }

  logs() {
    return this.logEntries
  }

  clearLogs() {
    this.logEntries = []
    return []
  }

  log(level, remote, message) {
    const entry = { id: randomUUID(), time: new Date().toISOString(), level, remote, message }
    this.logEntries.push(entry)
    if (this.logEntries.length > MAX_LOG) this.logEntries.splice(0, this.logEntries.length - MAX_LOG)
    this.onLog(entry)
  }

  setFaults(faults = []) {
    const wasCut = !!this.fault('cut')
    this.faults = faults
    if (this.running && !wasCut && this.fault('cut')) {
      for (const s of this.sessions.values()) s.client.end()
      this.log('warn', '', t('sftp.log.faultCutAll'))
    }
  }

  fault(type) {
    return this.faults.find((f) => f.type === type)
  }

  // --- Connexions et authentification ---------------------------------------------------------

  onClient(client, info) {
    const remote = `${info.ip}:${info.port}`
    if (this.fault('cut')) {
      this.log('warn', remote, t('sftp.log.faultCut'))
      return client.end()
    }
    const session = { id: ++this.seq, client, remote, username: null, user: null, since: new Date().toISOString() }
    client.on('error', () => {})
    client.on('authentication', (ctx) => this.authenticate(session, ctx))
    client.on('ready', () => {
      this.sessions.set(session.id, session)
      this.onStatus(this.status())
      client.on('session', (accept) => {
        const channel = accept()
        channel.on('sftp', (acceptSftp) => this.serve(session, acceptSftp()))
        // Pas de shell ni de commande : SFTP uniquement.
        for (const event of ['shell', 'exec', 'pty', 'subsystem', 'x11', 'env'])
          channel.on(event, (_accept, reject) => reject?.())
      })
    })
    client.on('close', () => {
      if (this.sessions.delete(session.id)) {
        this.log('info', remote, t('sftp.log.disconnected', { name: session.username }))
        this.onStatus(this.status())
      }
    })
  }

  async authenticate(session, ctx) {
    const user = this.users.get(ctx.username)
    const methods = ['password', 'publickey']
    const fail = (reason) => {
      if (reason) {
        this.counters.failures++
        this.log('warn', session.remote, t('sftp.log.loginFailed', { name: ctx.username, reason }))
      }
      ctx.reject(methods)
    }
    if (ctx.method === 'none') return ctx.reject(methods)
    if (!user) return fail(t('sftp.log.unknownUser'))
    if (ctx.method === 'password') {
      if (!user.passwordHash || !(await verifyPassword(ctx.password, user.passwordHash)))
        return fail(t('sftp.log.wrongPassword'))
    } else if (ctx.method === 'publickey') {
      const key = user.keys.find((k) => k.type === ctx.key.algo && timingSafeEqualSafe(k.getPublicSSH(), ctx.key.data))
      if (!key) return fail(t('sftp.log.unknownKey'))
      // Première étape : le client demande si la clé est acceptée, sans signature.
      if (!ctx.signature) return ctx.accept()
      if (key.verify(ctx.blob, ctx.signature, ctx.hashAlgo) !== true) return fail(t('sftp.log.badSignature'))
    } else return fail(null)
    session.username = user.username
    session.user = user
    this.counters.logins++
    this.log('info', session.remote, t('sftp.log.loggedIn', { name: user.username, method: ctx.method }))
    ctx.accept()
  }

  // --- Sous-système SFTP --------------------------------------------------------------------

  /** Chemin réel d'un chemin SFTP, confiné au dossier servi ; `virtual` : forme normalisée « /a/b ». */
  async resolve(requested, { mustExist = false } = {}) {
    const virtual =
      path.posix.normalize(`/${String(requested ?? '.').replaceAll('\\', '/')}`).replace(/\/+$/, '') || '/'
    const target = path.join(this.root, ...virtual.split('/').filter(Boolean))
    // Liens symboliques : le chemin réel (ou celui du dossier parent) doit rester dans le dossier servi.
    let real
    try {
      real = await fs.realpath(target)
    } catch (err) {
      if (mustExist || err.code !== 'ENOENT') throw err
      real = path.join(await fs.realpath(path.dirname(target)), path.basename(target))
    }
    if (real !== this.realRoot && !real.startsWith(this.realRoot + path.sep)) throw new OutsideRoot(requested)
    return { real, virtual }
  }

  serve(session, sftp) {
    const handles = new Map()
    let handleSeq = 0
    const user = session.user
    const newHandle = (value) => {
      const id = Buffer.alloc(4)
      id.writeUInt32BE(++handleSeq)
      handles.set(id.toString('hex'), value)
      return id
    }
    const getHandle = (id) => handles.get(Buffer.from(id).toString('hex'))
    const fail = (reqid, err) => {
      if (err instanceof OutsideRoot) {
        this.log('warn', session.remote, t('sftp.log.outside', { name: session.username, path: err.message }))
        return sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED)
      }
      return sftp.status(reqid, statusOf(err), err?.message)
    }
    const denyWrite = (reqid) => {
      if (!user.readOnly) return false
      sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED, t('sftp.log.readOnly'))
      return true
    }
    const delay = async () => {
      const ms = Number(this.fault('delay')?.params?.ms) || 0
      if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms))
    }
    /** Enveloppe d'un gestionnaire : délai simulé et erreurs converties en statut SFTP. */
    const on = (event, fn) =>
      sftp.on(event, async (reqid, ...args) => {
        try {
          await delay()
          await fn(reqid, ...args)
        } catch (err) {
          fail(reqid, err)
        }
      })

    on('REALPATH', async (reqid, requested) => {
      const { virtual } = await this.resolve(requested)
      sftp.name(reqid, [{ filename: virtual, longname: virtual, attrs: {} }])
    })
    const stat = (follow) => async (reqid, requested) => {
      const { real } = await this.resolve(requested, { mustExist: true })
      sftp.attrs(reqid, toAttrs(await (follow ? fs.stat(real) : fs.lstat(real))))
    }
    on('STAT', stat(true))
    on('LSTAT', stat(false))

    on('OPEN', async (reqid, filename, flags) => {
      const mode = flagsToString(flags)
      if (!mode) return sftp.status(reqid, STATUS_CODE.OP_UNSUPPORTED)
      const writing = mode !== 'r'
      if (writing && denyWrite(reqid)) return
      const { real, virtual } = await this.resolve(filename, { mustExist: !writing })
      const file = await fs.open(real, mode)
      sftp.handle(reqid, newHandle({ type: 'file', file, real, virtual, writing, bytes: 0 }))
    })
    on('READ', async (reqid, id, offset, length) => {
      const h = getHandle(id)
      if (h?.type !== 'file') return sftp.status(reqid, STATUS_CODE.FAILURE)
      const buffer = Buffer.alloc(Math.min(length, 256 * 1024))
      const { bytesRead } = await h.file.read(buffer, 0, buffer.length, offset)
      if (!bytesRead) return sftp.status(reqid, STATUS_CODE.EOF)
      h.bytes += bytesRead
      this.counters.bytesOut += bytesRead
      sftp.data(reqid, buffer.subarray(0, bytesRead))
    })
    on('WRITE', async (reqid, id, offset, data) => {
      const h = getHandle(id)
      if (h?.type !== 'file' || !h.writing) return sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED)
      await h.file.write(data, 0, data.length, offset)
      h.bytes += data.length
      this.counters.bytesIn += data.length
      sftp.status(reqid, STATUS_CODE.OK)
    })
    on('FSTAT', async (reqid, id) => {
      const h = getHandle(id)
      if (!h) return sftp.status(reqid, STATUS_CODE.FAILURE)
      sftp.attrs(reqid, toAttrs(h.type === 'file' ? await h.file.stat() : await fs.stat(h.real)))
    })
    on('CLOSE', async (reqid, id) => {
      const h = getHandle(id)
      if (!h) return sftp.status(reqid, STATUS_CODE.FAILURE)
      handles.delete(Buffer.from(id).toString('hex'))
      if (h.type === 'file') {
        await h.file.close()
        if (h.writing) {
          this.counters.uploads++
          this.log(
            'info',
            session.remote,
            t('sftp.log.upload', { name: session.username, path: h.virtual, bytes: h.bytes })
          )
        } else if (h.bytes) {
          this.counters.downloads++
          this.log(
            'info',
            session.remote,
            t('sftp.log.download', { name: session.username, path: h.virtual, bytes: h.bytes })
          )
        }
      }
      sftp.status(reqid, STATUS_CODE.OK)
    })

    on('OPENDIR', async (reqid, requested) => {
      const { real } = await this.resolve(requested, { mustExist: true })
      if (!(await fs.stat(real)).isDirectory()) return sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE)
      sftp.handle(reqid, newHandle({ type: 'dir', real, entries: null }))
    })
    on('READDIR', async (reqid, id) => {
      const h = getHandle(id)
      if (h?.type !== 'dir') return sftp.status(reqid, STATUS_CODE.FAILURE)
      if (!h.entries) {
        const names = await fs.readdir(h.real)
        h.entries = ['.', '..', ...names]
      }
      if (!h.entries.length) return sftp.status(reqid, STATUS_CODE.EOF)
      const chunk = h.entries.splice(0, READDIR_CHUNK)
      const list = []
      for (const name of chunk) {
        const stats = await fs.lstat(path.join(h.real, name)).catch(() => null)
        if (stats) list.push({ filename: name, longname: longname(name, stats), attrs: toAttrs(stats) })
      }
      sftp.name(reqid, list)
    })

    on('MKDIR', async (reqid, requested) => {
      if (denyWrite(reqid)) return
      const { real, virtual } = await this.resolve(requested)
      await fs.mkdir(real)
      this.log('info', session.remote, t('sftp.log.mkdir', { name: session.username, path: virtual }))
      sftp.status(reqid, STATUS_CODE.OK)
    })
    on('RMDIR', async (reqid, requested) => {
      if (denyWrite(reqid)) return
      const { real, virtual } = await this.resolve(requested, { mustExist: true })
      if (real === this.realRoot) return sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED)
      await fs.rmdir(real)
      this.log('info', session.remote, t('sftp.log.remove', { name: session.username, path: virtual }))
      sftp.status(reqid, STATUS_CODE.OK)
    })
    on('REMOVE', async (reqid, requested) => {
      if (denyWrite(reqid)) return
      const { virtual } = await this.resolve(requested, { mustExist: true })
      // Le lien lui-même est supprimé, pas sa cible.
      await fs.unlink(path.join(this.root, ...virtual.split('/').filter(Boolean)))
      this.log('info', session.remote, t('sftp.log.remove', { name: session.username, path: virtual }))
      sftp.status(reqid, STATUS_CODE.OK)
    })
    on('RENAME', async (reqid, from, to) => {
      if (denyWrite(reqid)) return
      const source = await this.resolve(from, { mustExist: true })
      const target = await this.resolve(to)
      if (
        await fs.access(target.real, fsConstants.F_OK).then(
          () => true,
          () => false
        )
      )
        return sftp.status(reqid, STATUS_CODE.FAILURE, t('sftp.log.exists'))
      await fs.rename(source.real, target.real)
      this.log(
        'info',
        session.remote,
        t('sftp.log.rename', { name: session.username, from: source.virtual, to: target.virtual })
      )
      sftp.status(reqid, STATUS_CODE.OK)
    })
    // Droits et dates : acceptés sans effet (dossier de test).
    on('SETSTAT', (reqid) => (user.readOnly ? denyWrite(reqid) : sftp.status(reqid, STATUS_CODE.OK)))
    on('FSETSTAT', (reqid) => (user.readOnly ? denyWrite(reqid) : sftp.status(reqid, STATUS_CODE.OK)))
    on('READLINK', (reqid) => sftp.status(reqid, STATUS_CODE.OP_UNSUPPORTED))
    on('SYMLINK', (reqid) => sftp.status(reqid, STATUS_CODE.OP_UNSUPPORTED))

    sftp.on('end', async () => {
      for (const h of handles.values()) if (h.type === 'file') await h.file.close().catch(() => {})
      handles.clear()
    })
  }
}

function timingSafeEqualSafe(a, b) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}
