import path from 'path'
import ssh2 from 'ssh2'
import { DEFAULT_CLIENT_CONFIG } from '../shared/constants'
import { fingerprint } from './server'
import { t } from '../shared/i18n'

const { Client, utils } = ssh2
const S_IFMT = 0o170000
const S_IFDIR = 0o040000
const S_IFLNK = 0o120000

const promisify =
  (sftp, method) =>
  (...args) =>
    new Promise((resolve, reject) => sftp[method](...args, (err, value) => (err ? reject(err) : resolve(value))))

/** Message d'une erreur SFTP ou SSH. */
function describe(err) {
  if (err?.level === 'client-authentication') return t('sftp.errors.authFailed')
  if (err?.code === 'ECONNREFUSED') return t('sftp.errors.connectionRefused')
  if (err?.code === 2) return t('sftp.errors.noSuchFile')
  if (err?.code === 3) return t('sftp.errors.permissionDenied')
  return err?.message ?? String(err)
}

/**
 * Client SFTP (ssh2) : connexion par mot de passe ou clé privée, vérification facultative de
 * l'empreinte de la clé d'hôte, parcours des dossiers et transferts de fichiers.
 */
export class SftpClient {
  conn = null
  sftp = null
  config = null
  hostFingerprint = null
  cwd = '/'

  constructor({ onStatus = () => {} } = {}) {
    this.onStatus = onStatus
  }

  status() {
    return {
      connected: !!this.sftp,
      endpoint: this.sftp ? `${this.config.username}@${this.config.host}:${this.config.port}` : null,
      hostFingerprint: this.sftp ? this.hostFingerprint : null,
      cwd: this.cwd
    }
  }

  async connect(options) {
    if (this.conn) await this.disconnect()
    const config = { ...DEFAULT_CLIENT_CONFIG, ...options }
    const port = Number(config.port)
    if (!String(config.host ?? '').trim()) throw new Error(t('sftp.errors.missingHost'))
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(t('sftp.errors.invalidPort'))
    if (!String(config.username ?? '').trim()) throw new Error(t('sftp.errors.emptyUsername'))
    const credentials = {}
    if (config.auth === 'key') {
      const key = utils.parseKey(config.privateKey ?? '', config.passphrase || undefined)
      if (key instanceof Error) throw new Error(t('sftp.errors.invalidPrivateKey', { message: key.message }))
      credentials.privateKey = config.privateKey
      if (config.passphrase) credentials.passphrase = config.passphrase
    } else credentials.password = config.password ?? ''

    const expected = String(config.hostFingerprint ?? '').trim()
    let seen = null
    const conn = new Client()
    await new Promise((resolve, reject) => {
      conn.once('ready', resolve)
      conn.once('error', (err) => reject(new Error(describe(err), { cause: err })))
      // Connexion fermée par le serveur avant l'authentification (sans erreur).
      conn.once('close', () => reject(new Error(t('sftp.errors.closedEarly'))))
      conn.connect({
        host: config.host.trim(),
        port,
        username: config.username.trim(),
        readyTimeout: Math.max(1000, Number(config.timeout) || 5000),
        ...credentials,
        hostVerifier: (key) => {
          seen = fingerprint(utils.parseKey(key))
          // Empreinte attendue : la connexion est refusée si la clé d'hôte a changé.
          if (expected && expected !== seen) {
            reject(new Error(t('sftp.errors.hostKeyMismatch', { expected, actual: seen })))
            return false
          }
          return true
        }
      })
    })
    conn.on('error', () => {})
    const sftp = await new Promise((resolve, reject) =>
      conn.sftp((err, channel) => (err ? reject(new Error(describe(err))) : resolve(channel)))
    )
    conn.on('close', () => {
      if (this.conn !== conn) return
      this.conn = this.sftp = null
      this.onStatus({ ...this.status(), lost: true })
    })
    this.conn = conn
    this.sftp = sftp
    this.config = { ...config, port }
    this.hostFingerprint = seen
    this.cwd = await promisify(sftp, 'realpath')('.').catch(() => '/')
    this.onStatus(this.status())
    return this.status()
  }

  async disconnect() {
    const conn = this.conn
    this.conn = this.sftp = null
    conn?.end()
    this.onStatus(this.status())
    return this.status()
  }

  require() {
    if (!this.sftp) throw new Error(t('errors.notConnected'))
    return this.sftp
  }

  /** Chemin distant absolu (relatif au dossier courant). */
  remote(p) {
    return path.posix.resolve(this.cwd, String(p ?? '.'))
  }

  async call(method, ...args) {
    try {
      return await promisify(this.require(), method)(...args)
    } catch (err) {
      throw new Error(describe(err), { cause: err })
    }
  }

  /** Contenu d'un dossier : [{ name, size, mtime, type: 'dir' | 'file' | 'link' }], dossiers d'abord. */
  async list(dir = this.cwd) {
    const target = this.remote(dir)
    const entries = await this.call('readdir', target)
    this.cwd = target
    const out = entries
      .filter((e) => e.filename !== '.' && e.filename !== '..')
      .map((e) => {
        const kind = e.attrs.mode & S_IFMT
        return {
          name: e.filename,
          size: e.attrs.size,
          mtime: new Date(e.attrs.mtime * 1000).toISOString(),
          type: kind === S_IFDIR ? 'dir' : kind === S_IFLNK ? 'link' : 'file'
        }
      })
      .sort((a, b) => (b.type === 'dir') - (a.type === 'dir') || a.name.localeCompare(b.name))
    this.onStatus(this.status())
    return { path: target, entries: out }
  }

  async download(remoteFile, localFile) {
    await this.call('fastGet', this.remote(remoteFile), localFile)
    return { remote: this.remote(remoteFile), local: localFile }
  }

  async upload(localFile, remoteFile) {
    const target = this.remote(remoteFile ?? path.basename(localFile))
    await this.call('fastPut', localFile, target)
    return { remote: target, local: localFile }
  }

  mkdir(name) {
    return this.call('mkdir', this.remote(name))
  }

  async remove(name, type) {
    return this.call(type === 'dir' ? 'rmdir' : 'unlink', this.remote(name))
  }

  rename(from, to) {
    return this.call('rename', this.remote(from), this.remote(to))
  }
}
