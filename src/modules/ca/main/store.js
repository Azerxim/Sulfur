import 'reflect-metadata'
import * as x509 from '@peculiar/x509'
import { randomUUID } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { CRL_VALIDITY_DAYS, KEY_ALGORITHMS, REVOCATION_REASONS } from '../shared/constants'
import {
  alternativeNames,
  authorityExtensions,
  describe,
  exportPrivateKey,
  generateKeys,
  importPrivateKey,
  keyMatches,
  leafExtensions,
  parseRequest,
  randomSerial,
  signingAlgorithm,
  subjectName,
  toCertificate,
  validityPeriod
} from './certificates'
import { createPkcs12 } from './pkcs12'
import { t } from '../shared/i18n'

const safeName = (s) =>
  String(s)
    .replace(/[^a-zA-Z0-9@._-]+/g, '_')
    .slice(0, 60) || 'certificate'

/**
 * Autorités de certification enregistrées dans `<root>/<id>/` :
 *   authority.json   { id, parentId, createdAt, imported, crlNumber }
 *   ca.pem           certificat de l'autorité
 *   ca.key.pem       clé privée (PKCS#8, droits 600)
 *   crl.pem          dernière liste de révocation
 *   issued/<n° de série>.json | .pem | .key.pem   certificats émis (clé absente pour une CSR signée)
 */
export class CertificateAuthorities {
  constructor(root) {
    this.root = root
  }

  dir(id) {
    if (!/^[a-zA-Z0-9-]+$/.test(String(id))) throw new Error(t('ca.errors.unknownAuthority'))
    return path.join(this.root, id)
  }

  async readJson(file) {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  }

  async ids() {
    try {
      const entries = await fs.readdir(this.root, { withFileTypes: true })
      return entries.filter((e) => e.isDirectory()).map((e) => e.name)
    } catch {
      return []
    }
  }

  /** Autorité chargée pour signer : { meta, cert (x509), pem, privateKey (CryptoKey) }. */
  async load(id) {
    const dir = this.dir(id)
    let meta, pem, keyPem
    try {
      ;[meta, pem, keyPem] = await Promise.all([
        this.readJson(path.join(dir, 'authority.json')),
        fs.readFile(path.join(dir, 'ca.pem'), 'utf8'),
        fs.readFile(path.join(dir, 'ca.key.pem'), 'utf8')
      ])
    } catch {
      throw new Error(t('ca.errors.unknownAuthority'))
    }
    const { privateKey } = await importPrivateKey(keyPem)
    return { meta, cert: toCertificate(pem), pem, privateKey }
  }

  /** Certificats émis par une autorité, du plus récent au plus ancien. */
  async issued(id) {
    const dir = path.join(this.dir(id), 'issued')
    let files
    try {
      files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json'))
    } catch {
      return []
    }
    const out = []
    for (const file of files) {
      try {
        const meta = await this.readJson(path.join(dir, file))
        const pem = await fs.readFile(path.join(dir, `${meta.serial}.pem`), 'utf8')
        const info = describe(pem)
        out.push({
          ...meta,
          certificate: info,
          status: meta.revoked ? 'revoked' : info.expired ? 'expired' : 'valid'
        })
      } catch {
        // fichier incomplet : ignoré
      }
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  /** Toutes les autorités, avec leurs certificats émis. */
  async list() {
    const out = []
    for (const id of await this.ids()) {
      try {
        const dir = this.dir(id)
        const meta = await this.readJson(path.join(dir, 'authority.json'))
        const certificate = describe(await fs.readFile(path.join(dir, 'ca.pem'), 'utf8'))
        let crl = null
        try {
          const list = new x509.X509Crl(await fs.readFile(path.join(dir, 'crl.pem'), 'utf8'))
          crl = { thisUpdate: list.thisUpdate.toISOString(), nextUpdate: list.nextUpdate?.toISOString() ?? null }
        } catch {
          // pas encore de CRL
        }
        out.push({ ...meta, certificate, crl, issued: await this.issued(id) })
      } catch {
        // autorité illisible : ignorée
      }
    }
    // Racines d'abord, puis leurs intermédiaires.
    return out.sort(
      (a, b) =>
        (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0) || a.certificate.commonName.localeCompare(b.certificate.commonName)
    )
  }

  async save(id, meta, pem, keyPem) {
    const dir = this.dir(id)
    await fs.mkdir(path.join(dir, 'issued'), { recursive: true })
    await fs.writeFile(path.join(dir, 'ca.key.pem'), keyPem, { mode: 0o600 })
    await fs.writeFile(path.join(dir, 'ca.pem'), pem)
    await fs.writeFile(path.join(dir, 'authority.json'), JSON.stringify(meta, null, 2))
    await this.writeCrl(id)
  }

  /**
   * Nouvelle autorité : racine auto-signée, ou intermédiaire signée par `parentId` (longueur de
   * chemin 0 : elle n'émet que des certificats finaux).
   */
  async createAuthority(params) {
    if (!KEY_ALGORITHMS.includes(params.keyAlgorithm))
      throw new Error(t('ca.errors.unknownKeyAlgorithm', { name: params.keyAlgorithm }))
    const subject = subjectName(params)
    const parent = params.parentId ? await this.load(params.parentId) : null
    if (parent && parent.cert.getExtension(x509.BasicConstraintsExtension)?.pathLength === 0)
      throw new Error(t('ca.errors.parentCannotSign'))
    const keys = await generateKeys(params.keyAlgorithm)
    const { notBefore, notAfter } = validityPeriod(params.validityDays, parent?.cert)
    const extensions = await authorityExtensions(keys.publicKey, parent?.cert, parent ? 0 : undefined)
    const serialNumber = randomSerial()
    const cert = parent
      ? await x509.X509CertificateGenerator.create({
          serialNumber,
          subject,
          issuer: parent.cert.subjectName,
          notBefore,
          notAfter,
          publicKey: keys.publicKey,
          signingKey: parent.privateKey,
          signingAlgorithm: signingAlgorithm(parent.privateKey),
          extensions
        })
      : await x509.X509CertificateGenerator.createSelfSigned({
          serialNumber,
          name: subject,
          notBefore,
          notAfter,
          keys,
          signingAlgorithm: signingAlgorithm(keys.privateKey),
          extensions
        })
    const id = randomUUID()
    const meta = {
      id,
      parentId: parent?.meta.id ?? null,
      createdAt: new Date().toISOString(),
      imported: false,
      crlNumber: 0
    }
    await this.save(id, meta, cert.toString('pem'), await exportPrivateKey(keys.privateKey))
    if (parent) await this.recordIssued(parent.meta.id, cert, null, 'authority')
    return id
  }

  /** Import d'une autorité existante (certificat d'autorité + clé privée correspondante). */
  async importAuthority({ certificate, privateKey, passphrase }) {
    let cert
    try {
      cert = toCertificate(String(certificate ?? '').trim())
    } catch (err) {
      throw new Error(t('ca.errors.invalidCertificate', { message: err.message }), { cause: err })
    }
    if (!cert.getExtension(x509.BasicConstraintsExtension)?.ca) throw new Error(t('ca.errors.notAuthority'))
    const key = await importPrivateKey(String(privateKey ?? ''), passphrase)
    if (!keyMatches(key.keyObject, cert)) throw new Error(t('ca.errors.keyMismatch'))
    const info = describe(cert)
    for (const existing of await this.list()) {
      if (existing.certificate.thumbprint === info.thumbprint) throw new Error(t('ca.errors.alreadyImported'))
    }
    // Rattachée à son émetteur s'il est déjà enregistré ici.
    const parent = info.selfSigned ? null : (await this.list()).find((a) => a.certificate.subject === info.issuer)
    const id = randomUUID()
    const meta = { id, parentId: parent?.id ?? null, createdAt: new Date().toISOString(), imported: true, crlNumber: 0 }
    await this.save(id, meta, cert.toString('pem'), key.pem)
    return id
  }

  async removeAuthority(id) {
    const children = (await this.list()).filter((a) => a.parentId === id)
    if (children.length) throw new Error(t('ca.errors.hasChildren', { count: children.length }))
    await fs.rm(this.dir(id), { recursive: true, force: true })
  }

  async recordIssued(id, cert, keyPem, profile) {
    const dir = path.join(this.dir(id), 'issued')
    await fs.mkdir(dir, { recursive: true })
    const serial = cert.serialNumber.toLowerCase()
    if (keyPem) await fs.writeFile(path.join(dir, `${serial}.key.pem`), keyPem, { mode: 0o600 })
    await fs.writeFile(path.join(dir, `${serial}.pem`), cert.toString('pem'))
    const meta = { serial, profile, createdAt: new Date().toISOString(), hasKey: !!keyPem, revoked: null }
    await fs.writeFile(path.join(dir, `${serial}.json`), JSON.stringify(meta, null, 2))
    return serial
  }

  /**
   * Émet un certificat final (clé générée par l'autorité). `params` : profil, sujet, noms
   * alternatifs (dns, ips, uris), rôle Modbus, validité en jours, algorithme de clé.
   */
  async issue(id, params) {
    const authority = await this.load(id)
    if (!KEY_ALGORITHMS.includes(params.keyAlgorithm))
      throw new Error(t('ca.errors.unknownKeyAlgorithm', { name: params.keyAlgorithm }))
    const subject = subjectName(params)
    const names = alternativeNames(params)
    const { notBefore, notAfter } = validityPeriod(params.validityDays, authority.cert)
    const keys = await generateKeys(params.keyAlgorithm)
    const cert = await x509.X509CertificateGenerator.create({
      serialNumber: randomSerial(),
      subject,
      issuer: authority.cert.subjectName,
      notBefore,
      notAfter,
      publicKey: keys.publicKey,
      signingKey: authority.privateKey,
      signingAlgorithm: signingAlgorithm(authority.privateKey),
      extensions: await leafExtensions({
        profile: params.profile,
        publicKey: keys.publicKey,
        issuerCert: authority.cert,
        names,
        role: params.role,
        rsa: params.keyAlgorithm.startsWith('rsa')
      })
    })
    return this.recordIssued(id, cert, await exportPrivateKey(keys.privateKey), params.profile)
  }

  /**
   * Signe une demande (CSR) : sujet et clé publique de la demande ; noms alternatifs de la demande,
   * complétés par ceux saisis. La clé privée reste chez le demandeur.
   */
  async signRequest(id, { csr, profile, validityDays, role, dns, ips, uris }) {
    const authority = await this.load(id)
    const request = await parseRequest(csr)
    const extra = alternativeNames({ dns, ips, uris })
    const names = [...request.names.filter((n) => n.type !== 'email'), ...extra].filter(
      (n, i, all) => all.findIndex((m) => m.type === n.type && m.value === n.value) === i
    )
    const { notBefore, notAfter } = validityPeriod(validityDays, authority.cert)
    const cert = await x509.X509CertificateGenerator.create({
      serialNumber: randomSerial(),
      subject: request.subject,
      issuer: authority.cert.subjectName,
      notBefore,
      notAfter,
      publicKey: request.publicKey,
      signingKey: authority.privateKey,
      signingAlgorithm: signingAlgorithm(authority.privateKey),
      extensions: await leafExtensions({
        profile,
        publicKey: request.publicKey,
        issuerCert: authority.cert,
        names,
        role,
        rsa: request.rsa
      })
    })
    return this.recordIssued(id, cert, null, profile)
  }

  async issuedMeta(id, serial) {
    if (!/^[0-9a-f]+$/.test(String(serial))) throw new Error(t('ca.errors.unknownCertificate'))
    const file = path.join(this.dir(id), 'issued', `${serial}.json`)
    try {
      return { file, meta: await this.readJson(file) }
    } catch {
      throw new Error(t('ca.errors.unknownCertificate'))
    }
  }

  /** Révoque un certificat émis et régénère la liste de révocation. */
  async revoke(id, serial, reason = 'unspecified') {
    if (!(reason in REVOCATION_REASONS)) throw new Error(t('ca.errors.unknownReason', { reason }))
    const { file, meta } = await this.issuedMeta(id, serial)
    if (meta.revoked) throw new Error(t('ca.errors.alreadyRevoked'))
    meta.revoked = { date: new Date().toISOString(), reason }
    await fs.writeFile(file, JSON.stringify(meta, null, 2))
    await this.writeCrl(id)
  }

  /** Supprime un certificat émis (un certificat révoqué reste dans la CRL tant qu'il est valide). */
  async removeIssued(id, serial) {
    const { meta } = await this.issuedMeta(id, serial)
    if (meta.revoked) throw new Error(t('ca.errors.revokedKept'))
    const dir = path.join(this.dir(id), 'issued')
    for (const ext of ['.json', '.pem', '.key.pem']) await fs.rm(path.join(dir, `${serial}${ext}`), { force: true })
  }

  /** Génère et enregistre la liste de révocation (CRL v2, numéro incrémenté, validité 30 jours). */
  async writeCrl(id) {
    const authority = await this.load(id)
    const revoked = (await this.issued(id)).filter((c) => c.revoked)
    const crlNumber = (authority.meta.crlNumber ?? 0) + 1
    const now = new Date()
    const crl = await x509.X509CrlGenerator.create({
      issuer: authority.cert.subjectName,
      thisUpdate: now,
      nextUpdate: new Date(now.getTime() + CRL_VALIDITY_DAYS * 86_400_000),
      entries: revoked.map((c) => ({
        serialNumber: c.serial,
        revocationDate: new Date(c.revoked.date),
        reason: REVOCATION_REASONS[c.revoked.reason] || undefined
      })),
      signingKey: authority.privateKey,
      signingAlgorithm: signingAlgorithm(authority.privateKey),
      extensions: [
        await x509.AuthorityKeyIdentifierExtension.create(authority.cert),
        new x509.Extension('2.5.29.20', false, crlNumberValue(crlNumber))
      ]
    })
    const dir = this.dir(id)
    await fs.writeFile(path.join(dir, 'crl.pem'), crl.toString('pem'))
    await fs.writeFile(path.join(dir, 'authority.json'), JSON.stringify({ ...authority.meta, crlNumber }, null, 2))
    return crl
  }

  /** Chaîne PEM de l'autorité jusqu'à la racine (autorités enregistrées ici). */
  async chain(id) {
    const out = []
    const seen = new Set()
    for (let current = id; current && !seen.has(current);) {
      seen.add(current)
      const dir = this.dir(current)
      out.push(await fs.readFile(path.join(dir, 'ca.pem'), 'utf8'))
      current = (await this.readJson(path.join(dir, 'authority.json'))).parentId
    }
    return out
  }

  /**
   * Contenu exporté : { name, data } — `serial` absent : l'autorité elle-même.
   * Formats : cert-pem, cert-der, chain-pem, key-pem, p12 (avec `password`), crl-pem, crl-der.
   */
  async exportFile(id, serial, format, { password = '' } = {}) {
    const dir = this.dir(id)
    if (format === 'crl-pem' || format === 'crl-der') {
      const pem = await fs
        .readFile(path.join(dir, 'crl.pem'), 'utf8')
        .catch(async () => (await this.writeCrl(id)).toString('pem'))
      const name = safeName(describe(await fs.readFile(path.join(dir, 'ca.pem'), 'utf8')).commonName)
      return format === 'crl-pem'
        ? { name: `${name}.crl.pem`, data: pem }
        : { name: `${name}.crl`, data: Buffer.from(x509.PemConverter.decodeFirst(pem)) }
    }
    let certPem, keyFile
    if (serial) {
      await this.issuedMeta(id, serial)
      certPem = await fs.readFile(path.join(dir, 'issued', `${serial}.pem`), 'utf8')
      keyFile = path.join(dir, 'issued', `${serial}.key.pem`)
    } else {
      certPem = await fs.readFile(path.join(dir, 'ca.pem'), 'utf8')
      keyFile = path.join(dir, 'ca.key.pem')
    }
    const info = describe(certPem)
    const name = safeName(info.commonName)
    const readKey = () =>
      fs.readFile(keyFile, 'utf8').catch(() => {
        throw new Error(t('ca.errors.noPrivateKey'))
      })
    const chain = serial ? await this.chain(id) : (await this.chain(id)).slice(1)
    switch (format) {
      case 'cert-pem':
        return { name: `${name}.pem`, data: certPem }
      case 'cert-der':
        return { name: `${name}.der`, data: Buffer.from(toCertificate(certPem).rawData) }
      case 'chain-pem':
        return { name: `${name}.chain.pem`, data: [certPem, ...chain].map((p) => p.trim()).join('\n') + '\n' }
      case 'key-pem':
        return { name: `${name}.key.pem`, data: await readKey() }
      case 'p12':
        return {
          name: `${name}.p12`,
          data: createPkcs12({
            certificate: Buffer.from(toCertificate(certPem).rawData),
            chain: chain.map((p) => Buffer.from(toCertificate(p).rawData)),
            privateKey: await readKey(),
            password,
            friendlyName: info.commonName
          })
        }
      default:
        throw new Error(t('ca.errors.unknownFormat', { format }))
    }
  }

  /** Certificat PEM et description détaillée (fenêtre de détails). */
  async details(id, serial) {
    const dir = this.dir(id)
    const pem = serial
      ? (await this.issuedMeta(id, serial), await fs.readFile(path.join(dir, 'issued', `${serial}.pem`), 'utf8'))
      : await fs.readFile(path.join(dir, 'ca.pem'), 'utf8')
    return { pem, certificate: describe(pem) }
  }
}

/** Valeur DER d'un entier positif (extension « numéro de CRL »). */
function crlNumberValue(n) {
  let hex = n.toString(16)
  if (hex.length % 2) hex = `0${hex}`
  let bytes = Buffer.from(hex, 'hex')
  if (bytes[0] & 0x80) bytes = Buffer.concat([Buffer.from([0]), bytes])
  return Buffer.concat([Buffer.from([0x02, bytes.length]), bytes])
}
