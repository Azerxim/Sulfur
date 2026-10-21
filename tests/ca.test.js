import 'reflect-metadata'
import * as x509 from '@peculiar/x509'
import { X509Certificate, webcrypto } from 'crypto'
import { execFileSync } from 'child_process'
import fs from 'fs/promises'
import tls from 'tls'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CertificateAuthorities } from '@modules/ca/main/store'
import { readRole } from '@modules/modbus/main/pki'
import { errorOf, tempDir } from './helpers'

let tmp, store, rootId, issuingId

const issue = (overrides = {}) =>
  store.issue(issuingId, {
    profile: 'server',
    commonName: 'plc.local',
    organization: 'Sulfur',
    dns: 'localhost, plc.local',
    ips: '127.0.0.1',
    uris: '',
    validityDays: 365,
    keyAlgorithm: 'ecdsa-p256',
    ...overrides
  })

const issuedEntry = async (serial, id = issuingId) => (await store.issued(id)).find((i) => i.serial === serial)
const text = async (id, serial, format, options) => (await store.exportFile(id, serial, format, options)).data

/** Établit une connexion TLS vérifiée (servername localhost) et retourne le sujet présenté par le serveur. */
function handshake(serverOptions, ca) {
  return new Promise((resolve, reject) => {
    const server = tls.createServer(serverOptions, (socket) => socket.end())
    server.listen(0, '127.0.0.1', () => {
      const socket = tls.connect(
        { host: '127.0.0.1', port: server.address().port, servername: 'localhost', ca, rejectUnauthorized: true },
        () => {
          const subject = socket.getPeerCertificate().subject.CN
          socket.end()
          server.close()
          resolve(subject)
        }
      )
      socket.on('error', (err) => {
        server.close()
        reject(err)
      })
    })
  })
}

beforeAll(async () => {
  tmp = await tempDir('ca')
  store = new CertificateAuthorities(`${tmp.dir}/authorities`)
  rootId = await store.createAuthority({
    commonName: 'Test Root CA',
    organization: 'Sulfur',
    country: 'fr',
    validityDays: 3650,
    keyAlgorithm: 'ecdsa-p384'
  })
  issuingId = await store.createAuthority({
    commonName: 'Test Issuing CA',
    organization: 'Sulfur',
    validityDays: 1825,
    keyAlgorithm: 'ecdsa-p256',
    parentId: rootId
  })
})

afterAll(() => tmp.cleanup())

describe('Autorités', () => {
  it('crée une racine auto-signée et une intermédiaire signée par elle', async () => {
    const list = await store.list()
    const root = list.find((a) => a.id === rootId)
    const issuing = list.find((a) => a.id === issuingId)
    expect(root.certificate).toMatchObject({
      commonName: 'Test Root CA',
      isCa: true,
      selfSigned: true,
      key: 'ECDSA P-384',
      subject: 'C=FR, O=Sulfur, CN=Test Root CA'
    })
    expect(root.certificate.keyUsages).toEqual(expect.arrayContaining(['keyCertSign', 'cRLSign']))
    expect(issuing).toMatchObject({ parentId: rootId, certificate: { isCa: true, pathLength: 0, selfSigned: false } })
    // L'intermédiaire apparaît parmi les certificats émis par la racine.
    expect(root.issued.map((i) => i.profile)).toEqual(['authority'])
    const rootCert = new X509Certificate(await text(rootId, null, 'cert-pem'))
    const issuingCert = new X509Certificate(await text(issuingId, null, 'cert-pem'))
    expect(issuingCert.checkIssued(rootCert)).toBe(true)
    expect(issuingCert.verify(rootCert.publicKey)).toBe(true)
    expect(root.crl).not.toBeNull()
  })

  it("refuse qu'une intermédiaire signe une autre autorité", async () => {
    expect(
      await errorOf(
        store.createAuthority({ commonName: 'Sub', validityDays: 10, keyAlgorithm: 'ecdsa-p256', parentId: issuingId })
      )
    ).toMatch(/path length 0/)
    expect(await errorOf(store.removeAuthority(rootId))).toMatch(/intermediate/)
  })

  it('importe une autorité avec sa clé, et refuse une clé qui ne correspond pas', async () => {
    const other = new CertificateAuthorities(`${tmp.dir}/other`)
    const certificate = await text(rootId, null, 'cert-pem')
    const privateKey = await text(rootId, null, 'key-pem')
    const id = await other.importAuthority({ certificate, privateKey })
    expect((await other.list())[0]).toMatchObject({ id, imported: true, certificate: { commonName: 'Test Root CA' } })
    expect(await errorOf(other.importAuthority({ certificate, privateKey }))).toMatch(/already present/)
    const wrongKey = await text(issuingId, null, 'key-pem')
    expect(await errorOf(other.importAuthority({ certificate, privateKey: wrongKey }))).toMatch(/does not match/)
    const leaf = await text(issuingId, await issue(), 'cert-pem')
    expect(await errorOf(other.importAuthority({ certificate: leaf, privateKey }))).toMatch(/not an authority/)
  })
})

describe('Émission', () => {
  it('émet un certificat serveur utilisable en TLS avec la chaîne', async () => {
    const serial = await issue()
    const entry = await issuedEntry(serial)
    expect(entry).toMatchObject({ profile: 'server', hasKey: true, status: 'valid' })
    expect(entry.certificate).toMatchObject({
      dns: ['localhost', 'plc.local'],
      ips: ['127.0.0.1'],
      extendedKeyUsages: ['serverAuth'],
      isCa: false
    })
    const chain = await text(issuingId, serial, 'chain-pem')
    expect(chain.match(/BEGIN CERTIFICATE/g)).toHaveLength(3)
    const root = await text(rootId, null, 'cert-pem')
    // Le serveur présente son certificat et l'intermédiaire ; le client ne connaît que la racine.
    const subject = await handshake(
      {
        cert: chain
          .split(/(?=-----BEGIN CERTIFICATE-----)/)
          .slice(0, 2)
          .join(''),
        key: await text(issuingId, serial, 'key-pem')
      },
      root
    )
    expect(subject).toBe('plc.local')
  })

  it('exporte un PKCS#12 lisible par OpenSSL', async () => {
    const serial = await issue({ commonName: 'pfx.local', keyAlgorithm: 'rsa-2048' })
    const p12 = await text(issuingId, serial, 'p12', { password: 'sécurité' })
    expect(p12[0]).toBe(0x30)
    expect(() => tls.createSecureContext({ pfx: p12, passphrase: 'wrong' })).toThrow()
    const subject = await handshake({ pfx: p12, passphrase: 'sécurité' }, await text(rootId, null, 'cert-pem'))
    expect(subject).toBe('pfx.local')

    let openssl = null
    try {
      openssl = execFileSync('openssl', ['version'], { encoding: 'utf8' })
    } catch {
      // OpenSSL absent : la vérification par Node suffit
    }
    if (openssl) {
      const file = `${tmp.dir}/test.p12`
      await fs.writeFile(file, p12)
      const out = execFileSync('openssl', ['pkcs12', '-in', file, '-passin', 'pass:sécurité', '-nodes'], {
        encoding: 'utf8'
      })
      expect(out.match(/BEGIN CERTIFICATE/g)).toHaveLength(3)
      expect(out).toMatch(/BEGIN PRIVATE KEY/)
      expect(out).toMatch(/friendlyName: pfx.local/)
    }
  })

  it('émet un certificat OPC UA (URI obligatoire) et Modbus (rôle)', async () => {
    expect(await errorOf(issue({ profile: 'opcua' }))).toMatch(/application URI/)
    const opcua = await issuedEntry(
      await issue({ profile: 'opcua', keyAlgorithm: 'rsa-2048', uris: 'urn:plc:Sulfur', commonName: 'OPC UA app' })
    )
    expect(opcua.certificate).toMatchObject({ key: 'RSA 2048', uris: ['urn:plc:Sulfur'] })
    expect(opcua.certificate.keyUsages).toEqual(expect.arrayContaining(['dataEncipherment', 'keyEncipherment']))
    expect(opcua.certificate.extendedKeyUsages).toEqual(['serverAuth', 'clientAuth'])

    const serial = await issue({ profile: 'modbus', role: 'Viewer', commonName: 'HMI' })
    expect((await issuedEntry(serial)).certificate.role).toBe('Viewer')
    // Même lecture que le serveur Modbus/TCP Security.
    expect(readRole(new X509Certificate(await text(issuingId, serial, 'cert-pem')).raw)).toBe('Viewer')
  })

  it('valide les champs et borne la validité à celle de l’autorité', async () => {
    expect(await errorOf(issue({ commonName: ' ' }))).toMatch(/common name/)
    expect(await errorOf(issue({ dns: 'bad name!' }))).toMatch(/Invalid DNS name/)
    expect(await errorOf(issue({ ips: '300.1.1.1' }))).toMatch(/Invalid IP address/)
    expect(await errorOf(issue({ validityDays: 0 }))).toMatch(/Validity/)
    const entry = await issuedEntry(await issue({ validityDays: 36500 }))
    const issuing = (await store.list()).find((a) => a.id === issuingId)
    expect(entry.certificate.notAfter).toBe(issuing.certificate.notAfter)
  })

  it('signe une demande (CSR) sans connaître la clé privée', async () => {
    const keys = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' }, true, [
      'sign',
      'verify'
    ])
    const csr = await x509.Pkcs10CertificateRequestGenerator.create({
      name: 'CN=device-42, O=Vendor',
      keys,
      signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' },
      extensions: [new x509.SubjectAlternativeNameExtension([{ type: 'dns', value: 'device-42.local' }])]
    })
    const serial = await store.signRequest(issuingId, {
      csr: csr.toString('pem'),
      profile: 'serverClient',
      validityDays: 30,
      ips: '10.0.0.42'
    })
    const entry = await issuedEntry(serial)
    expect(entry.hasKey).toBe(false)
    expect(entry.certificate).toMatchObject({
      subject: 'CN=device-42, O=Vendor',
      dns: ['device-42.local'],
      ips: ['10.0.0.42'],
      extendedKeyUsages: ['serverAuth', 'clientAuth']
    })
    expect(await errorOf(store.exportFile(issuingId, serial, 'key-pem'))).toMatch(/not known/)
    expect(await errorOf(store.signRequest(issuingId, { csr: 'garbage', profile: 'server', validityDays: 1 }))).toMatch(
      /Unreadable certificate signing request/
    )
  })
})

describe('Révocation', () => {
  it('ajoute le certificat révoqué à une nouvelle CRL', async () => {
    const serial = await issue({ commonName: 'revoked.local' })
    const before = new x509.X509Crl(await text(issuingId, null, 'crl-pem'))
    await store.revoke(issuingId, serial, 'keyCompromise')
    expect(await errorOf(store.revoke(issuingId, serial))).toMatch(/already revoked/)
    expect(await errorOf(store.removeIssued(issuingId, serial))).toMatch(/revocation list/)
    expect((await issuedEntry(serial)).status).toBe('revoked')

    const crl = new x509.X509Crl(await text(issuingId, null, 'crl-pem'))
    expect(crl.entries.map((e) => e.serialNumber.toLowerCase())).toContain(serial)
    expect(crl.entries.find((e) => e.serialNumber.toLowerCase() === serial).reason).toBe(1)
    expect(crl.thisUpdate.getTime()).toBeGreaterThanOrEqual(before.thisUpdate.getTime())
    const issuing = new x509.X509Certificate(await text(issuingId, null, 'cert-pem'))
    expect(await crl.verify({ publicKey: issuing.publicKey })).toBe(true)
    const der = await text(issuingId, null, 'crl-der')
    expect(Buffer.isBuffer(der) && der[0] === 0x30).toBe(true)
  })

  it('supprime un certificat non révoqué', async () => {
    const serial = await issue({ commonName: 'temporary.local' })
    await store.removeIssued(issuingId, serial)
    expect(await issuedEntry(serial)).toBeUndefined()
    expect(await errorOf(store.exportFile(issuingId, serial, 'cert-pem'))).toMatch(/Unknown certificate/)
  })
})
