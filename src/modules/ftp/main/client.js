import path from 'path'
import { randomUUID } from 'crypto'
import { Client, FileType } from 'basic-ftp'
import { DEFAULT_CLIENT_CONFIG, MAX_LOG, TLS_MODES } from '../shared/constants'
import { t } from '../shared/i18n'

const TYPES = { [FileType.Directory]: 'dir', [FileType.SymbolicLink]: 'link' }

/** Message d'une erreur FTP ou réseau. */
function describe(err) {
  if (err?.code === 'ECONNREFUSED') return t('ftp.errors.connectionRefused')
  if (err?.code === 530) return t('ftp.errors.authFailed', { message: err.message })
  if (/certificate|self[- ]signed/i.test(err?.message ?? ''))
    return t('ftp.errors.certificate', { message: err.message })
  return err?.message ?? String(err)
}

/** Résumé du certificat présenté par le serveur FTPS. */
function certificateOf(socket) {
  const cert = socket?.getPeerCertificate?.()
  if (!cert || !Object.keys(cert).length) return null
  return {
    subject: cert.subject?.CN ?? '',
    issuer: cert.issuer?.CN ?? '',
    fingerprint: cert.fingerprint256 ?? '',
    notAfter: cert.valid_to ? new Date(cert.valid_to).toISOString() : null,
    protocol: socket.getProtocol?.() ?? null
  }
}

/**
 * Client FTP / FTPS (basic-ftp, mode passif) : parcours des dossiers, transferts, et dialogue de
 * commandes affiché (mots de passe masqués).
 */
export class FtpClient {
  client = null
  config = null
  cwd = '/'
  certificate = null
  dialog = []

  constructor({ onStatus = () => {}, onDialog = () => {} } = {}) {
    this.onStatus = onStatus
    this.onDialog = onDialog
  }

  status() {
    const connected = !!this.client && !this.client.closed
    return {
      connected,
      endpoint: connected ? `${this.config.username}@${this.config.host}:${this.config.port}` : null,
      secure: connected && this.config.tls !== 'none',
      certificate: connected ? this.certificate : null,
      cwd: this.cwd
    }
  }

  trace(message) {
    const entry = { id: randomUUID(), time: new Date().toISOString(), message: String(message) }
    this.dialog.push(entry)
    if (this.dialog.length > MAX_LOG) this.dialog.splice(0, this.dialog.length - MAX_LOG)
    this.onDialog(entry)
  }

  clearDialog() {
    this.dialog = []
    return []
  }

  async connect(options) {
    if (this.client) this.disconnect()
    const config = { ...DEFAULT_CLIENT_CONFIG, ...options }
    const host = String(config.host ?? '').trim()
    const port = Number(config.port)
    if (!host) throw new Error(t('ftp.errors.missingHost'))
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(t('ftp.errors.invalidPort'))
    if (!String(config.username ?? '').trim()) throw new Error(t('ftp.errors.emptyUsername'))
    if (!TLS_MODES.includes(config.tls)) throw new Error(t('ftp.errors.invalidTls'))

    const client = new Client(Math.max(1000, Number(config.timeout) || DEFAULT_CLIENT_CONFIG.timeout))
    client.ftp.verbose = true
    client.ftp.log = (message) => this.trace(message)
    try {
      await client.access({
        host,
        port,
        user: config.username.trim(),
        password: config.password ?? '',
        secure: config.tls === 'implicit' ? 'implicit' : config.tls === 'explicit',
        secureOptions: { rejectUnauthorized: !!config.verifyCertificate, servername: host }
      })
      this.cwd = await client.pwd()
    } catch (err) {
      client.close()
      throw new Error(describe(err), { cause: err })
    }
    this.client = client
    this.config = { ...config, host, port }
    this.certificate = config.tls === 'none' ? null : certificateOf(client.ftp.socket)
    client.ftp.socket.once('close', () => {
      if (this.client !== client) return
      this.client = null
      this.onStatus({ ...this.status(), lost: true })
    })
    this.onStatus(this.status())
    return this.status()
  }

  disconnect() {
    const client = this.client
    this.client = null
    client?.close()
    this.onStatus(this.status())
    return this.status()
  }

  require() {
    if (!this.client || this.client.closed) throw new Error(t('errors.notConnected'))
    return this.client
  }

  async call(fn) {
    try {
      return await fn(this.require())
    } catch (err) {
      throw new Error(describe(err), { cause: err })
    }
  }

  /** Chemin distant absolu (relatif au dossier courant). */
  remote(p) {
    return path.posix.resolve(this.cwd, String(p ?? '.'))
  }

  /** Contenu d'un dossier (qui devient le dossier courant), dossiers d'abord. */
  async list(dir) {
    return this.call(async (client) => {
      if (dir !== undefined) await client.cd(this.remote(dir))
      this.cwd = await client.pwd()
      const entries = (await client.list())
        .filter((e) => e.name !== '.' && e.name !== '..')
        .map((e) => ({
          name: e.name,
          size: e.size,
          mtime: e.modifiedAt ? e.modifiedAt.toISOString() : null,
          type: TYPES[e.type] ?? 'file'
        }))
        .sort((a, b) => (b.type === 'dir') - (a.type === 'dir') || a.name.localeCompare(b.name))
      this.onStatus(this.status())
      return { path: this.cwd, entries }
    })
  }

  async download(remoteFile, localFile) {
    const remote = this.remote(remoteFile)
    await this.call((client) => client.downloadTo(localFile, remote))
    return { remote, local: localFile }
  }

  async upload(localFile, remoteFile) {
    const remote = this.remote(remoteFile ?? path.basename(localFile))
    await this.call((client) => client.uploadFrom(localFile, remote))
    return { remote, local: localFile }
  }

  mkdir(name) {
    return this.call((client) => client.send(`MKD ${this.remote(name)}`))
  }

  remove(name, type) {
    const remote = this.remote(name)
    return this.call((client) => (type === 'dir' ? client.removeEmptyDir(remote) : client.remove(remote)))
  }

  rename(from, to) {
    return this.call((client) => client.rename(this.remote(from), this.remote(to)))
  }
}
