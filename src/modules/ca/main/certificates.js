// Génération et lecture des certificats X.509 de l'autorité de certification (process principal).
import 'reflect-metadata'
import * as x509 from '@peculiar/x509'
import { createHash, createPrivateKey, createPublicKey, webcrypto } from 'crypto'
import net from 'net'
import { MAX_VALIDITY_DAYS, MODBUS_ROLE_OID, PROFILES } from '../shared/constants'
import { t } from '../shared/i18n'

x509.cryptoProvider.set(webcrypto)

const DAY = 86_400_000

/** Paramètres WebCrypto de chaque algorithme de clé (génération, import, signature). */
const ALGORITHMS = {
  'ecdsa-p256': { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' },
  'ecdsa-p384': { name: 'ECDSA', namedCurve: 'P-384', hash: 'SHA-384' },
  'rsa-2048': rsa(2048),
  'rsa-3072': rsa(3072),
  'rsa-4096': rsa(4096)
}

function rsa(modulusLength) {
  return {
    name: 'RSASSA-PKCS1-v1_5',
    modulusLength,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256'
  }
}

/** Courbes OpenSSL → WebCrypto. */
const CURVES = { prime256v1: 'P-256', secp384r1: 'P-384', secp521r1: 'P-521' }
const CURVE_HASH = { 'P-256': 'SHA-256', 'P-384': 'SHA-384', 'P-521': 'SHA-512' }

/** OID des usages étendus, et leur nom court. */
const EKU_NAMES = {
  [x509.ExtendedKeyUsage.serverAuth]: 'serverAuth',
  [x509.ExtendedKeyUsage.clientAuth]: 'clientAuth',
  [x509.ExtendedKeyUsage.codeSigning]: 'codeSigning',
  [x509.ExtendedKeyUsage.emailProtection]: 'emailProtection',
  [x509.ExtendedKeyUsage.timeStamping]: 'timeStamping',
  [x509.ExtendedKeyUsage.ocspSigning]: 'ocspSigning'
}

const KEY_USAGE_NAMES = Object.entries(x509.KeyUsageFlags).filter(([, flag]) => typeof flag === 'number' && flag > 0)

/** Numéro de série aléatoire de 16 octets, positif (hexadécimal). */
export const randomSerial = () =>
  Buffer.from(webcrypto.getRandomValues(new Uint8Array(16)))
    .toString('hex')
    .replace(/^[89a-f]/, '1')

export function keyAlgorithm(name) {
  const algorithm = ALGORITHMS[name]
  if (!algorithm) throw new Error(t('ca.errors.unknownKeyAlgorithm', { name }))
  return algorithm
}

export async function generateKeys(name) {
  return webcrypto.subtle.generateKey(keyAlgorithm(name), true, ['sign', 'verify'])
}

export async function exportPrivateKey(privateKey) {
  return x509.PemConverter.encode(await webcrypto.subtle.exportKey('pkcs8', privateKey), 'PRIVATE KEY')
}

/**
 * Clé privée PEM (PKCS#8, PKCS#1 ou SEC1, chiffrée ou non) importée pour signer.
 * Retourne { privateKey (CryptoKey), pem (PKCS#8 non chiffré), algorithm }.
 */
export async function importPrivateKey(pem, passphrase) {
  let key
  try {
    key = createPrivateKey({ key: pem, format: 'pem', passphrase: passphrase || undefined })
  } catch (err) {
    const encrypted = /ENCRYPTED/.test(pem)
    throw new Error(
      encrypted && !passphrase ? t('ca.errors.keyEncrypted') : t('ca.errors.invalidKey', { message: err.message }),
      { cause: err }
    )
  }
  let algorithm
  if (key.asymmetricKeyType === 'rsa') algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
  else if (key.asymmetricKeyType === 'ec') {
    const namedCurve = CURVES[key.asymmetricKeyDetails?.namedCurve]
    if (!namedCurve) throw new Error(t('ca.errors.unsupportedKey', { type: key.asymmetricKeyDetails?.namedCurve }))
    algorithm = { name: 'ECDSA', namedCurve, hash: CURVE_HASH[namedCurve] }
  } else throw new Error(t('ca.errors.unsupportedKey', { type: key.asymmetricKeyType }))
  const der = key.export({ type: 'pkcs8', format: 'der' })
  const privateKey = await webcrypto.subtle.importKey('pkcs8', der, algorithm, true, ['sign'])
  return { privateKey, pem: x509.PemConverter.encode(der, 'PRIVATE KEY'), algorithm, keyObject: key }
}

/** La clé privée correspond-elle à la clé publique du certificat ? */
export function keyMatches(keyObject, certificate) {
  const fromKey = createPublicKey(keyObject).export({ type: 'spki', format: 'der' })
  return Buffer.from(certificate.publicKey.rawData).equals(fromKey)
}

/** Algorithme de signature d'une clé privée d'autorité (hachage adapté à la courbe). */
export function signingAlgorithm(privateKey) {
  const { algorithm } = privateKey
  if (algorithm.name === 'ECDSA') return { name: 'ECDSA', hash: CURVE_HASH[algorithm.namedCurve] ?? 'SHA-256' }
  return { name: algorithm.name, hash: algorithm.hash?.name ?? 'SHA-256' }
}

/** Nom distinctif à partir des champs du formulaire (CN obligatoire). */
export function subjectName({ commonName, organization, organizationalUnit, country, locality }) {
  const cn = String(commonName ?? '').trim()
  if (!cn) throw new Error(t('ca.errors.missingCommonName'))
  const c = String(country ?? '').trim()
  if (c && !/^[A-Za-z]{2}$/.test(c)) throw new Error(t('ca.errors.invalidCountry'))
  const name = []
  if (c) name.push({ C: [c.toUpperCase()] })
  if (String(locality ?? '').trim()) name.push({ L: [locality.trim()] })
  if (String(organization ?? '').trim()) name.push({ O: [organization.trim()] })
  if (String(organizationalUnit ?? '').trim()) name.push({ OU: [organizationalUnit.trim()] })
  name.push({ CN: [cn] })
  return new x509.Name(name)
}

/** Liste saisie (virgules, espaces ou retours à la ligne) → valeurs uniques non vides. */
export const splitList = (value) =>
  Array.isArray(value)
    ? value.map((v) => String(v).trim()).filter(Boolean)
    : [
        ...new Set(
          String(value ?? '')
            .split(/[\s,;]+/)
            .map((v) => v.trim())
            .filter(Boolean)
        )
      ]

const DNS_NAME =
  /^(\*\.)?([a-zA-Z0-9_]([a-zA-Z0-9_-]{0,61}[a-zA-Z0-9_])?\.)*[a-zA-Z0-9_]([a-zA-Z0-9_-]{0,61}[a-zA-Z0-9_])?$/

/** Noms alternatifs validés : [{ type: 'dns' | 'ip' | 'url', value }]. */
export function alternativeNames({ dns, ips, uris }) {
  const names = []
  for (const value of splitList(dns)) {
    if (!DNS_NAME.test(value)) throw new Error(t('ca.errors.invalidDns', { value }))
    names.push({ type: 'dns', value })
  }
  for (const value of splitList(ips)) {
    if (!net.isIP(value)) throw new Error(t('ca.errors.invalidIp', { value }))
    names.push({ type: 'ip', value })
  }
  for (const value of splitList(uris)) {
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\S+$/.test(value)) throw new Error(t('ca.errors.invalidUri', { value }))
    names.push({ type: 'url', value })
  }
  return names
}

function roleExtension(role) {
  const value = Buffer.from(role, 'utf8')
  if (value.length > 127) throw new Error(t('ca.errors.roleTooLong'))
  return new x509.Extension(MODBUS_ROLE_OID, false, Buffer.concat([Buffer.from([0x0c, value.length]), value]))
}

/** Rôle Modbus (extension UTF8String) d'un certificat, ou null. */
function readRole(cert) {
  const ext = cert.getExtension(MODBUS_ROLE_OID)
  if (!ext) return null
  const value = Buffer.from(ext.value)
  return value[0] === 0x0c ? value.subarray(2, 2 + value[1]).toString('utf8') : value.toString('utf8')
}

/** Durée de validité en jours, bornée par la fin de validité de l'autorité. */
export function validityPeriod(days, issuer) {
  const n = Number(days)
  if (!Number.isInteger(n) || n < 1 || n > MAX_VALIDITY_DAYS)
    throw new Error(t('ca.errors.invalidValidity', { max: MAX_VALIDITY_DAYS }))
  const notBefore = new Date(Date.now() - 60_000)
  let notAfter = new Date(notBefore.getTime() + n * DAY)
  if (issuer && notAfter > issuer.notAfter) notAfter = new Date(issuer.notAfter)
  return { notBefore, notAfter }
}

/** Extensions d'un certificat d'autorité. `pathLength` : undefined pour une racine, 0 pour une intermédiaire. */
export async function authorityExtensions(publicKey, issuerCert, pathLength) {
  const extensions = [
    new x509.BasicConstraintsExtension(true, pathLength, true),
    new x509.KeyUsagesExtension(
      x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign | x509.KeyUsageFlags.digitalSignature,
      true
    ),
    await x509.SubjectKeyIdentifierExtension.create(publicKey)
  ]
  if (issuerCert) extensions.push(await x509.AuthorityKeyIdentifierExtension.create(issuerCert))
  return extensions
}

/**
 * Extensions d'un certificat final selon son profil. `rsa` : clé RSA (chiffrement de clé) plutôt
 * qu'ECC (accord de clé). `names` : noms alternatifs ; `role` : rôle Modbus.
 */
export async function leafExtensions({ profile, publicKey, issuerCert, names, role, rsa: isRsa }) {
  if (!PROFILES.includes(profile)) throw new Error(t('ca.errors.unknownProfile', { profile }))
  const { KeyUsageFlags: K, ExtendedKeyUsage: E } = x509
  let usages = K.digitalSignature | (isRsa ? K.keyEncipherment : K.keyAgreement)
  if (profile === 'opcua')
    usages = K.digitalSignature | K.nonRepudiation | (isRsa ? K.keyEncipherment | K.dataEncipherment : K.keyAgreement)
  const eku = {
    server: [E.serverAuth],
    client: [E.clientAuth],
    serverClient: [E.serverAuth, E.clientAuth],
    opcua: [E.serverAuth, E.clientAuth],
    modbus: [E.serverAuth, E.clientAuth]
  }[profile]
  if (profile === 'opcua' && !names.some((n) => n.type === 'url')) throw new Error(t('ca.errors.opcuaNeedsUri'))
  const extensions = [
    new x509.BasicConstraintsExtension(false, undefined, true),
    new x509.KeyUsagesExtension(usages, true),
    new x509.ExtendedKeyUsageExtension(eku),
    await x509.SubjectKeyIdentifierExtension.create(publicKey),
    await x509.AuthorityKeyIdentifierExtension.create(issuerCert)
  ]
  if (names.length) extensions.push(new x509.SubjectAlternativeNameExtension(names))
  if (profile === 'modbus' && String(role ?? '').trim()) extensions.push(roleExtension(String(role).trim()))
  return extensions
}

/** Description d'une clé publique : « ECDSA P-256 », « RSA 2048 ». */
function describeKey(cert) {
  const alg = cert.publicKey.algorithm
  if (alg.name === 'ECDSA' || alg.name === 'ECDH') return `ECDSA ${alg.namedCurve}`
  if (alg.modulusLength) return `RSA ${alg.modulusLength}`
  const key = createPublicKey({ key: Buffer.from(cert.publicKey.rawData), format: 'der', type: 'spki' })
  return key.asymmetricKeyType === 'rsa' ? `RSA ${key.asymmetricKeyDetails.modulusLength}` : key.asymmetricKeyType
}

/** Résumé d'un certificat (PEM ou DER) pour l'interface. */
export function describe(input) {
  const cert = input instanceof x509.X509Certificate ? input : new x509.X509Certificate(input)
  const raw = Buffer.from(cert.rawData)
  const basic = cert.getExtension(x509.BasicConstraintsExtension)
  const san = cert.getExtension(x509.SubjectAlternativeNameExtension)
  const ku = cert.getExtension(x509.KeyUsagesExtension)
  const eku = cert.getExtension(x509.ExtendedKeyUsageExtension)
  const names = san?.names.items.map((n) => ({ type: n.type, value: n.value })) ?? []
  const cn = cert.subjectName.getField('CN')[0]
  return {
    subject: cert.subject,
    commonName: cn ?? cert.subject,
    issuer: cert.issuer,
    serial: cert.serialNumber.toLowerCase(),
    notBefore: cert.notBefore.toISOString(),
    notAfter: cert.notAfter.toISOString(),
    expired: cert.notAfter < new Date() || cert.notBefore > new Date(),
    thumbprint: createHash('sha256').update(raw).digest('hex'),
    sha1: createHash('sha1').update(raw).digest('hex'),
    key: describeKey(cert),
    isCa: !!basic?.ca,
    pathLength: basic?.pathLength ?? null,
    selfSigned: cert.subject === cert.issuer,
    dns: names.filter((n) => n.type === 'dns').map((n) => n.value),
    ips: names.filter((n) => n.type === 'ip').map((n) => n.value),
    uris: names.filter((n) => n.type === 'url').map((n) => n.value),
    keyUsages: ku ? KEY_USAGE_NAMES.filter(([, flag]) => ku.usages & flag).map(([name]) => name) : [],
    extendedKeyUsages: eku ? eku.usages.map((oid) => EKU_NAMES[oid] ?? String(oid)) : [],
    role: readRole(cert)
  }
}

export const toCertificate = (pem) => new x509.X509Certificate(pem)

/** Demande de signature (CSR PKCS#10, PEM ou DER) : sujet, noms alternatifs et clé publique vérifiés. */
export async function parseRequest(input) {
  let csr
  try {
    csr = new x509.Pkcs10CertificateRequest(typeof input === 'string' ? input.trim() : input)
  } catch (err) {
    throw new Error(t('ca.errors.invalidCsr', { message: err.message }), { cause: err })
  }
  if (!(await csr.verify())) throw new Error(t('ca.errors.csrSignature'))
  // Les extensions d'une demande ne se cherchent que par OID : on reprend celle des noms alternatifs.
  const san = csr.extensions.find((ext) => ext instanceof x509.SubjectAlternativeNameExtension)
  const names = san?.names.items.map((n) => ({ type: n.type, value: n.value })) ?? []
  return {
    csr,
    subject: csr.subjectName,
    commonName: csr.subjectName.getField('CN')[0] ?? csr.subject,
    names: names.filter((n) => ['dns', 'ip', 'url', 'email'].includes(n.type)),
    publicKey: csr.publicKey,
    rsa: csr.publicKey.algorithm.name?.startsWith('RSA') ?? false
  }
}
