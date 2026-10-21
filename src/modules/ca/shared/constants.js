import { builtinManifest } from '@shared/module'

export const CA_MODULE = builtinManifest({
  id: 'ca',
  name: 'Autorité de certification',
  description: 'Autorités de certification, émission et révocation de certificats X.509'
})

/** Algorithmes de clé (libellés : ca.keyAlgorithms.*). */
export const KEY_ALGORITHMS = ['ecdsa-p256', 'ecdsa-p384', 'rsa-2048', 'rsa-3072', 'rsa-4096']

/**
 * Profils de certificat (libellés : ca.profiles.*) :
 *  - server / client / serverClient : TLS (HTTPS, MQTT, Syslog…), usage étendu serverAuth / clientAuth ;
 *  - opcua : certificat d'instance d'application OPC UA (URI d'application dans les noms alternatifs) ;
 *  - modbus : Modbus/TCP Security, avec le rôle du client dans l'extension 1.3.6.1.4.1.50316.802.1.
 */
export const PROFILES = ['server', 'client', 'serverClient', 'opcua', 'modbus']

/** OID de l'extension « rôle » des certificats Modbus/TCP Security. */
export const MODBUS_ROLE_OID = '1.3.6.1.4.1.50316.802.1'

/** Motifs de révocation (RFC 5280, libellés : ca.reasons.*). */
export const REVOCATION_REASONS = {
  unspecified: 0,
  keyCompromise: 1,
  cACompromise: 2,
  affiliationChanged: 3,
  superseded: 4,
  cessationOfOperation: 5
}

/** Formats d'export (libellés : ca.formats.*). */
export const EXPORT_FORMATS = ['cert-pem', 'cert-der', 'chain-pem', 'key-pem', 'p12']

/** Durée de validité maximale, en jours (100 ans). */
export const MAX_VALIDITY_DAYS = 36500

/** Validité d'une liste de révocation (CRL) générée, en jours. */
export const CRL_VALIDITY_DAYS = 30

export const DEFAULT_AUTHORITY = {
  commonName: 'Sulfur Test Root CA',
  organization: 'Sulfur',
  organizationalUnit: '',
  country: '',
  validityDays: 3650,
  keyAlgorithm: 'ecdsa-p256',
  parentId: ''
}

export const DEFAULT_ISSUE = {
  profile: 'server',
  commonName: '',
  organization: 'Sulfur',
  organizationalUnit: '',
  dns: '',
  ips: '',
  uris: '',
  role: 'Operator',
  validityDays: 825,
  keyAlgorithm: 'ecdsa-p256'
}
