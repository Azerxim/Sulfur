/**
 * Fichier PKCS#12 (.p12 / .pfx, RFC 7292) : certificat, chaîne et clé privée protégés par mot de
 * passe, aux mêmes paramètres qu'OpenSSL 3 : clé chiffrée en PBES2 (PBKDF2-HMAC-SHA256,
 * AES-256-CBC), intégrité par HMAC-SHA256. Accepté par Windows, Java, OpenSSL et les navigateurs.
 */

import { createCipheriv, createHash, createHmac, createPrivateKey, pbkdf2Sync, randomBytes } from 'crypto'

const ITERATIONS = 2048

const OID = {
  data: '1.2.840.113549.1.7.1',
  pkcs8ShroudedKeyBag: '1.2.840.113549.1.12.10.1.2',
  certBag: '1.2.840.113549.1.12.10.1.3',
  x509Certificate: '1.2.840.113549.1.9.22.1',
  friendlyName: '1.2.840.113549.1.9.20',
  localKeyId: '1.2.840.113549.1.9.21',
  pbes2: '1.2.840.113549.1.5.13',
  pbkdf2: '1.2.840.113549.1.5.12',
  hmacWithSha256: '1.2.840.113549.2.9',
  aes256Cbc: '2.16.840.1.101.3.4.1.42',
  sha256: '2.16.840.1.101.3.4.2.1'
}

// --- Encodage DER minimal -----------------------------------------------------------------

function length(n) {
  if (n < 0x80) return Buffer.from([n])
  const bytes = []
  for (let v = n; v > 0; v = Math.floor(v / 256)) bytes.unshift(v & 0xff)
  return Buffer.from([0x80 | bytes.length, ...bytes])
}

const tlv = (tag, ...parts) => {
  const body = Buffer.concat(parts)
  return Buffer.concat([Buffer.from([tag]), length(body.length), body])
}
const seq = (...parts) => tlv(0x30, ...parts)
const set = (...parts) => tlv(0x31, ...parts)
const octets = (bytes) => tlv(0x04, bytes)
const explicit = (n, ...parts) => tlv(0xa0 + n, ...parts)
const NULL = Buffer.from([0x05, 0x00])

function integer(n) {
  let hex = n.toString(16)
  if (hex.length % 2) hex = `0${hex}`
  let bytes = Buffer.from(hex, 'hex')
  if (bytes[0] & 0x80) bytes = Buffer.concat([Buffer.from([0]), bytes])
  return tlv(0x02, bytes)
}

function oid(text) {
  const [first, second, ...rest] = text.split('.').map(Number)
  const bytes = [first * 40 + second]
  for (const part of rest) {
    const chunk = [part & 0x7f]
    for (let v = part >>> 7; v > 0; v >>>= 7) chunk.unshift((v & 0x7f) | 0x80)
    bytes.push(...chunk)
  }
  return tlv(0x06, Buffer.from(bytes))
}

/** Chaîne BMPString (UTF-16 big-endian). */
const bmpBytes = (text) => Buffer.from(text, 'utf16le').swap16()
const bmpString = (text) => tlv(0x1e, bmpBytes(text))

// --- Dérivation de clé PKCS#12 (RFC 7292, annexe B.2) ---------------------------------------

function pkcs12Kdf(password, salt, id, iterations, size) {
  const u = 32 // SHA-256
  const v = 64
  // Mot de passe en BMPString terminé par deux octets nuls.
  const pass = Buffer.concat([bmpBytes(password), Buffer.alloc(2)])
  const fill = (bytes) => {
    if (!bytes.length) return Buffer.alloc(0)
    const out = Buffer.alloc(v * Math.ceil(bytes.length / v))
    for (let i = 0; i < out.length; i++) out[i] = bytes[i % bytes.length]
    return out
  }
  const D = Buffer.alloc(v, id)
  const I = Buffer.concat([fill(salt), fill(pass)])
  const result = []
  for (let produced = 0; produced < size; produced += u) {
    let A = createHash('sha256').update(D).update(I).digest()
    for (let i = 1; i < iterations; i++) A = createHash('sha256').update(A).digest()
    result.push(A)
    const B = fill(A)
    // I_j = (I_j + B + 1) mod 2^(v·8), pour chaque bloc de v octets.
    for (let j = 0; j < I.length; j += v) {
      let carry = 1
      for (let k = v - 1; k >= 0; k--) {
        const sum = I[j + k] + B[k] + carry
        I[j + k] = sum & 0xff
        carry = sum >> 8
      }
    }
  }
  return Buffer.concat(result).subarray(0, size)
}

// --- Construction ------------------------------------------------------------------------------

const algorithm = (id, params) => seq(oid(id), params)

/** Clé privée PKCS#8 chiffrée (EncryptedPrivateKeyInfo, PBES2 / PBKDF2-SHA256 / AES-256-CBC). */
function encryptKey(pkcs8, password) {
  const salt = randomBytes(16)
  const iv = randomBytes(16)
  const key = pbkdf2Sync(Buffer.from(password, 'utf8'), salt, ITERATIONS, 32, 'sha256')
  const cipher = createCipheriv('aes-256-cbc', key, iv)
  const encrypted = Buffer.concat([cipher.update(pkcs8), cipher.final()])
  const params = seq(
    algorithm(OID.pbkdf2, seq(octets(salt), integer(ITERATIONS), algorithm(OID.hmacWithSha256, NULL))),
    algorithm(OID.aes256Cbc, octets(iv))
  )
  return seq(algorithm(OID.pbes2, params), octets(encrypted))
}

const attributes = (friendlyName, localKeyId) =>
  set(
    ...(friendlyName ? [seq(oid(OID.friendlyName), set(bmpString(friendlyName)))] : []),
    ...(localKeyId ? [seq(oid(OID.localKeyId), set(octets(localKeyId)))] : [])
  )

const dataContent = (bytes) => seq(oid(OID.data), explicit(0, octets(bytes)))

/**
 * Fichier PKCS#12.
 *  - certificate : certificat (DER) associé à la clé
 *  - chain : certificats des autorités (DER), de l'émetteur à la racine
 *  - privateKey : clé privée PEM
 *  - password : mot de passe (peut être vide)
 *  - friendlyName : nom affiché à l'import
 */
export function createPkcs12({ certificate, chain = [], privateKey, password = '', friendlyName }) {
  const localKeyId = createHash('sha1').update(certificate).digest()
  const certBag = (der, own) =>
    seq(
      oid(OID.certBag),
      explicit(0, seq(oid(OID.x509Certificate), explicit(0, octets(der)))),
      ...(own ? [attributes(friendlyName, localKeyId)] : [])
    )
  const certs = seq(certBag(certificate, true), ...chain.map((der) => certBag(der, false)))
  const pkcs8 = createPrivateKey(privateKey).export({ type: 'pkcs8', format: 'der' })
  const keys = seq(
    seq(oid(OID.pkcs8ShroudedKeyBag), explicit(0, encryptKey(pkcs8, password)), attributes(friendlyName, localKeyId))
  )
  const authSafe = seq(dataContent(certs), dataContent(keys))

  const macSalt = randomBytes(16)
  const macKey = pkcs12Kdf(password, macSalt, 3, ITERATIONS, 32)
  const mac = createHmac('sha256', macKey).update(authSafe).digest()
  const macData = seq(seq(algorithm(OID.sha256, NULL), octets(mac)), octets(macSalt), integer(ITERATIONS))

  return seq(integer(3), dataContent(authSafe), macData)
}
