import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { OPCUACertificateManager } from 'node-opcua'
import { t } from '../shared/i18n'
import { exploreCertificate, makeSHA1Thumbprint, readCertificate } from 'node-opcua-crypto'

const CERT_EXT = /\.(der|pem|crt|cer)$/i

/**
 * Magasin de certificats (PKI) d'un serveur ou d'un client OPC UA.
 * Arborescence node-opcua : own/certs, trusted/certs, rejected.
 * La gestion (approuver / rejeter / supprimer) se fait par déplacement de fichiers :
 * les gestionnaires node-opcua actifs surveillent ces dossiers.
 */
export class PkiStore {
  constructor(rootFolder) {
    this.rootFolder = rootFolder
  }

  folders() {
    return {
      own: path.join(this.rootFolder, 'own', 'certs'),
      trusted: path.join(this.rootFolder, 'trusted', 'certs'),
      rejected: path.join(this.rootFolder, 'rejected')
    }
  }

  /** Crée un gestionnaire de certificats node-opcua pour une connexion / un démarrage. */
  async createManager(autoAccept) {
    const cm = new OPCUACertificateManager({
      rootFolder: this.rootFolder,
      automaticallyAcceptUnknownCertificate: autoAccept
    })
    await cm.initialize()
    return cm
  }

  /**
   * Garantit que le certificat propre (own/certs/certificate.pem) porte le nom et l'URI attendus,
   * sinon le (re)génère — node-opcua ne le recrée que s'il est absent.
   */
  async ensureOwnCertificate(cm, { commonName, applicationUri }) {
    const file = path.join(cm.rootDir, 'own', 'certs', 'certificate.pem')
    try {
      const current = describe(file)
      if (current.commonName === commonName && current.applicationUri === applicationUri && !current.expired) return
      await fs.unlink(file)
    } catch {
      // absent ou illisible : on le (re)crée
    }
    const hostname = os.hostname()
    const ip = Object.values(os.networkInterfaces())
      .flat()
      .filter((a) => !a.internal)
      .map((a) => a.address)
    await cm.createSelfSignedCertificate({
      applicationUri,
      dns: [...new Set([hostname, 'localhost'])],
      ip: [...new Set(ip)],
      outputFile: file,
      subject: `/CN=${commonName}/O=Sulfur`,
      startDate: new Date(),
      validity: 365 * 10
    })
  }

  async list() {
    const result = {}
    for (const [store, dir] of Object.entries(this.folders())) {
      result[store] = await this.readFolder(dir)
    }
    return result
  }

  async readFolder(dir) {
    let files
    try {
      files = (await fs.readdir(dir)).filter((f) => CERT_EXT.test(f))
    } catch {
      return []
    }
    return files
      .map((file) => {
        try {
          return describe(path.join(dir, file))
        } catch {
          return { file, thumbprint: file, commonName: file, error: t('certs.unreadable') }
        }
      })
      .sort((a, b) => a.commonName.localeCompare(b.commonName))
  }

  async find(thumbprint, stores = ['trusted', 'rejected']) {
    const all = await this.list()
    for (const store of stores) {
      const cert = all[store].find((c) => c.thumbprint === thumbprint)
      if (cert) return { store, cert }
    }
    throw new Error(t('errors.certNotFound'))
  }

  async move(thumbprint, target) {
    const { store, cert } = await this.find(thumbprint)
    if (store === target) return this.list()
    const dir = this.folders()[target]
    await fs.mkdir(dir, { recursive: true })
    await fs.rename(cert.path, path.join(dir, path.basename(cert.path)))
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

function describe(file) {
  const der = readCertificate(file)
  const info = exploreCertificate(der).tbsCertificate
  const uri = info.extensions?.subjectAltName?.uniformResourceIdentifier?.[0] ?? null
  return {
    path: file,
    file: path.basename(file),
    thumbprint: makeSHA1Thumbprint(der).toString('hex'),
    commonName: info.subject.commonName ?? path.basename(file),
    organization: info.subject.organizationName ?? null,
    applicationUri: uri,
    notBefore: info.validity.notBefore.toISOString(),
    notAfter: info.validity.notAfter.toISOString(),
    expired: info.validity.notAfter < new Date()
  }
}
