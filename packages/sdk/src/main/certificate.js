// Certificats TLS des serveurs (HTTPS, MQTT, Syslog) : process principal uniquement.
import 'reflect-metadata'
import * as x509 from '@peculiar/x509'
import { X509Certificate, webcrypto } from 'crypto'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

x509.cryptoProvider.set(webcrypto)

const KEY_ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' }

/** Résumé d'un certificat PEM : nom, empreinte SHA-256, validité. */
export function describeCertificate(pem) {
  const cert = new X509Certificate(pem)
  return {
    commonName: cert.subject.match(/CN=([^\n]+)/)?.[1] ?? cert.subject,
    thumbprint: cert.fingerprint256.replaceAll(':', '').toLowerCase(),
    notBefore: new Date(cert.validFrom).toISOString(),
    notAfter: new Date(cert.validTo).toISOString()
  }
}

/**
 * Certificat auto-signé d'un serveur TLS (`<dir>/certificate.pem`, `<dir>/private_key.pem`),
 * généré au premier démarrage, ou s'il a expiré ou changé de nom. Noms alternatifs : nom de la
 * machine, localhost et ses adresses IP. Retourne { cert, key, info }.
 */
export async function ensureCertificate(dir, commonName) {
  const certFile = path.join(dir, 'certificate.pem')
  const keyFile = path.join(dir, 'private_key.pem')
  try {
    const [cert, key] = await Promise.all([fs.readFile(certFile, 'utf8'), fs.readFile(keyFile, 'utf8')])
    const info = describeCertificate(cert)
    if (info.commonName === commonName && new Date(info.notAfter) > new Date()) return { cert, key, info }
  } catch {
    // absent ou illisible : génération
  }

  const keys = await webcrypto.subtle.generateKey(KEY_ALGORITHM, true, ['sign', 'verify'])
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .map((a) => a.address.split('%')[0])
  const certificate = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: Buffer.from(webcrypto.getRandomValues(new Uint8Array(16)))
      .toString('hex')
      .replace(/^[89a-f]/, '1'),
    name: `CN=${commonName}, O=Sulfur`,
    notBefore: new Date(Date.now() - 60_000),
    notAfter: new Date(Date.now() + 365 * 10 * 86_400_000),
    keys,
    signingAlgorithm: KEY_ALGORITHM,
    extensions: [
      new x509.BasicConstraintsExtension(false, undefined, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyAgreement, true),
      new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.serverAuth]),
      new x509.SubjectAlternativeNameExtension([
        ...[...new Set([os.hostname(), 'localhost'])].map((value) => ({ type: 'dns', value })),
        ...[...new Set(ips)].map((value) => ({ type: 'ip', value }))
      ]),
      await x509.SubjectKeyIdentifierExtension.create(keys.publicKey)
    ]
  })
  const pkcs8 = await webcrypto.subtle.exportKey('pkcs8', keys.privateKey)
  const pem = { cert: certificate.toString('pem'), key: x509.PemConverter.encode(pkcs8, 'PRIVATE KEY') }
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(keyFile, pem.key, { mode: 0o600 })
  await fs.writeFile(certFile, pem.cert)
  return { ...pem, info: describeCertificate(pem.cert) }
}
