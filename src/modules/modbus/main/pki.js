import 'reflect-metadata'
import * as x509 from '@peculiar/x509'
import { X509Certificate, webcrypto } from 'crypto'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { MODBUS_ROLE_OID } from '../shared/constants'

x509.cryptoProvider.set(webcrypto)

const KEY_ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' }

/** Extrait le rôle Modbus (extension UTF8String) d'un certificat DER, ou null. */
export function readRole(der) {
  try {
    const ext = new x509.X509Certificate(der).getExtension(MODBUS_ROLE_OID)
    if (!ext) return null
    const value = Buffer.from(ext.value)
    // UTF8String DER : 0x0c, longueur (forme courte), contenu
    return value[0] === 0x0c ? value.subarray(2, 2 + value[1]).toString('utf8') : value.toString('utf8')
  } catch {
    return null
  }
}

function roleExtension(role) {
  const value = Buffer.from(role, 'utf8')
  if (value.length > 127) throw new Error('Nom de rôle trop long')
  return new x509.Extension(MODBUS_ROLE_OID, false, Buffer.concat([Buffer.from([0x0c, value.length]), value]))
}

export function describe(der, file) {
  const cert = new X509Certificate(der)
  const subject = Object.fromEntries(
    cert.subject.split('\n').map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1)]
    })
  )
  const role = readRole(cert.raw)
  const notAfter = new Date(cert.validTo)
  return {
    path: file,
    file: file && path.basename(file),
    thumbprint: cert.fingerprint256.replaceAll(':', '').toLowerCase(),
    commonName: subject.CN ?? cert.subject,
    organization: subject.O ?? null,
    role,
    description: role ? `Rôle Modbus : ${role}` : 'Sans rôle Modbus',
    notBefore: new Date(cert.validFrom).toISOString(),
    notAfter: notAfter.toISOString(),
    expired: notAfter < new Date() || new Date(cert.validFrom) > new Date()
  }
}

const safeName = (s) => s.replace(/[^a-zA-Z0-9@._-]+/g, '_').slice(0, 40)

/**
 * Magasin de certificats Modbus/TCP Security.
 *   own/      certificate.pem + private_key.pem (générés automatiquement)
 *   trusted/  certificats des pairs approuvés (épinglés par empreinte SHA-256)
 *   rejected/ certificats inconnus refusés, à approuver depuis l'interface
 */
export class ModbusPki {
  constructor(rootFolder) {
    this.rootFolder = rootFolder
  }

  folders() {
    return {
      own: path.join(this.rootFolder, 'own'),
      trusted: path.join(this.rootFolder, 'trusted'),
      rejected: path.join(this.rootFolder, 'rejected')
    }
  }

  /**
   * Retourne { cert, key } (PEM) du certificat propre, (re)généré s'il est absent, expiré,
   * ou si son nom / rôle ne correspond plus.
   */
  async ensureOwn({ commonName, role = null }) {
    const dir = this.folders().own
    const certFile = path.join(dir, 'certificate.pem')
    const keyFile = path.join(dir, 'private_key.pem')
    try {
      const [cert, key] = await Promise.all([fs.readFile(certFile, 'utf8'), fs.readFile(keyFile, 'utf8')])
      const info = describe(cert, certFile)
      if (info.commonName === commonName && (info.role ?? null) === (role || null) && !info.expired) return { cert, key }
    } catch {
      // absent ou illisible : génération
    }

    const keys = await webcrypto.subtle.generateKey(KEY_ALGORITHM, true, ['sign', 'verify'])
    const hostname = os.hostname()
    const ips = Object.values(os.networkInterfaces())
      .flat()
      .map((a) => a.address)
    const extensions = [
      new x509.BasicConstraintsExtension(false, undefined, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyAgreement, true),
      new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.serverAuth, x509.ExtendedKeyUsage.clientAuth]),
      new x509.SubjectAlternativeNameExtension([
        ...[...new Set([hostname, 'localhost'])].map((value) => ({ type: 'dns', value })),
        ...[...new Set(ips)].map((value) => ({ type: 'ip', value: value.split('%')[0] }))
      ]),
      await x509.SubjectKeyIdentifierExtension.create(keys.publicKey)
    ]
    if (role) extensions.push(roleExtension(role))

    const cert = await x509.X509CertificateGenerator.createSelfSigned({
      serialNumber: Buffer.from(webcrypto.getRandomValues(new Uint8Array(16))).toString('hex').replace(/^[89a-f]/, '1'),
      name: `CN=${commonName}, O=Sulfur`,
      notBefore: new Date(Date.now() - 60_000),
      notAfter: new Date(Date.now() + 365 * 10 * 86_400_000),
      keys,
      signingAlgorithm: KEY_ALGORITHM,
      extensions
    })
    const pkcs8 = await webcrypto.subtle.exportKey('pkcs8', keys.privateKey)
    const pem = { cert: cert.toString('pem'), key: x509.PemConverter.encode(pkcs8, 'PRIVATE KEY') }
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(keyFile, pem.key, { mode: 0o600 })
    await fs.writeFile(certFile, pem.cert)
    return pem
  }

  async readFolder(dir) {
    let files = []
    try {
      files = (await fs.readdir(dir)).filter((f) => /\.(pem|der|crt|cer)$/i.test(f) && f !== 'private_key.pem')
    } catch {
      return []
    }
    const out = []
    for (const file of files) {
      const full = path.join(dir, file)
      try {
        out.push(describe(await fs.readFile(full), full))
      } catch {
        out.push({ path: full, file, thumbprint: file, commonName: file, error: 'Certificat illisible' })
      }
    }
    return out.sort((a, b) => a.commonName.localeCompare(b.commonName))
  }

  async list() {
    const result = {}
    for (const [store, dir] of Object.entries(this.folders())) result[store] = await this.readFolder(dir)
    return result
  }

  /**
   * Vérifie le certificat présenté par un pair (crypto.X509Certificate).
   * Approuvé → ok. Inconnu → ajouté aux approuvés si `autoAccept`, sinon rangé dans « rejetés ».
   */
  async checkPeer(peer, { autoAccept }) {
    const info = describe(peer.raw)
    if (info.expired) return { ok: false, info, reason: 'certificat expiré ou pas encore valide' }
    // Les certificats sont épinglés par empreinte : seul un certificat présent dans « approuvés » est accepté.
    const { trusted, rejected } = await this.list()
    if (trusted.some((c) => c.thumbprint === info.thumbprint)) return { ok: true, info }
    const target = autoAccept ? 'trusted' : 'rejected'
    if (!rejected.some((c) => c.thumbprint === info.thumbprint) || autoAccept) {
      const dir = this.folders()[target]
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(path.join(dir, `${safeName(info.commonName)}_${info.thumbprint.slice(0, 16)}.pem`), peer.toString())
      if (autoAccept) {
        const old = rejected.find((c) => c.thumbprint === info.thumbprint)
        if (old) await fs.unlink(old.path).catch(() => {})
      }
    }
    return autoAccept ? { ok: true, info, accepted: true } : { ok: false, info, reason: 'certificat non approuvé' }
  }

  async find(thumbprint, stores = ['trusted', 'rejected']) {
    const all = await this.list()
    for (const store of stores) {
      const cert = all[store].find((c) => c.thumbprint === thumbprint)
      if (cert) return { store, cert }
    }
    throw new Error('Certificat introuvable')
  }

  async move(thumbprint, target) {
    const { store, cert } = await this.find(thumbprint)
    if (store !== target) {
      const dir = this.folders()[target]
      await fs.mkdir(dir, { recursive: true })
      await fs.rename(cert.path, path.join(dir, cert.file))
    }
    return this.list()
  }

  trust(thumbprint) {
    return this.move(thumbprint, 'trusted')
  }

  reject(thumbprint) {
    return this.move(thumbprint, 'rejected')
  }

  async remove(thumbprint) {
    const { cert } = await this.find(thumbprint)
    await fs.unlink(cert.path)
    return this.list()
  }
}
