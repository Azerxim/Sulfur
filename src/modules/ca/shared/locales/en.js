export default {
  ca: {
    name: 'Certificate authority',
    description: 'Certificate authorities, issuance and revocation of X.509 certificates',
    cancel: 'Cancel',
    openFolder: 'Open folder',
    keyAlgorithms: {
      'ecdsa-p256': 'ECDSA P-256 (recommended)',
      'ecdsa-p384': 'ECDSA P-384',
      'rsa-2048': 'RSA 2048',
      'rsa-3072': 'RSA 3072',
      'rsa-4096': 'RSA 4096 (slow to generate)'
    },
    profiles: {
      server: 'TLS server',
      client: 'TLS client',
      serverClient: 'TLS server and client',
      opcua: 'OPC UA application',
      modbus: 'Modbus/TCP Security',
      authority: 'Intermediate authority'
    },
    profileHints: {
      server:
        'HTTPS, MQTT, Syslog TLS… servers: extended key usage serverAuth. Clients check the alternative names (DNS, IP) against the address they connect to.',
      client: 'Client authentication (mutual TLS): extended key usage clientAuth.',
      serverClient: 'Both server and client authentication (serverAuth and clientAuth).',
      opcua:
        'OPC UA application instance certificate: the application URI is mandatory and must match the one configured in the application; add the DNS name and IP addresses of the host.',
      modbus:
        'Modbus/TCP Security device or client: serverAuth and clientAuth, and the role of the client in extension 1.3.6.1.4.1.50316.802.1 (authorization on the server side).'
    },
    reasons: {
      unspecified: 'Unspecified',
      keyCompromise: 'Key compromise',
      cACompromise: 'Authority compromise',
      affiliationChanged: 'Affiliation changed',
      superseded: 'Superseded',
      cessationOfOperation: 'Cessation of operation'
    },
    formats: {
      'cert-pem': 'Certificate (PEM)',
      'cert-der': 'Certificate (DER)',
      'chain-pem': 'Certificate and chain (PEM)',
      'key-pem': 'Private key (PEM, PKCS#8)',
      p12: 'PKCS#12 (.p12 / .pfx)',
      'crl-pem': 'CRL (PEM)',
      'crl-der': 'CRL (DER)'
    },
    formatHints: {
      'cert-pem': 'Text file -----BEGIN CERTIFICATE-----: most TLS servers and clients.',
      'cert-der': 'Binary file (.der): OPC UA applications, Windows, PLCs and HMIs.',
      'chain-pem': 'The certificate followed by the authorities up to the root (fullchain).',
      'key-pem': 'Unencrypted private key: keep it secret.',
      p12: 'Certificate, chain and private key protected by a password: Windows, Java, browsers.'
    },
    statuses: {
      valid: 'Valid',
      expired: 'Expired',
      revoked: 'Revoked'
    },
    fields: {
      commonName: 'Common name (CN)',
      organization: 'Organization (O)',
      organizationalUnit: 'Organizational unit (OU)',
      country: 'Country (C, 2 letters)',
      validityDays: 'Validity (days)',
      keyAlgorithm: 'Key algorithm'
    },
    authorities: {
      title: 'Authorities ({count})',
      none: 'No authority yet: create a root authority, or import an existing one (certificate and private key).',
      create: 'New authority',
      import: 'Import',
      root: 'Root',
      intermediate: 'Intermediate',
      imported: 'Imported',
      issuedCount: '{count} certificate(s)'
    },
    authority: {
      view: 'View',
      export: 'Export',
      crl: 'Revocation list',
      crlInfo: 'updated on {date}, next update {next} · {count} revoked',
      updateCrl: 'Update the CRL',
      updateCrlHint: 'Generates a new revocation list (valid 30 days), to be published again where it is used.',
      exportCrl: 'Export the CRL',
      crlHint: 'Revocation list signed by the authority, to install with its certificate (OPC UA issuers store…).',
      createIntermediate: 'Intermediate authority',
      remove: 'Delete',
      confirmRemove:
        'Delete the authority “{name}”, its private key and the certificates it issued? This cannot be undone.'
    },
    create: {
      title: 'New certificate authority',
      parent: 'Signed by',
      noParent: 'Nobody: self-signed root authority',
      rootHint:
        'A root authority signs itself: install its certificate in the trust stores of the devices and applications.',
      intermediateHint:
        'An intermediate authority is signed by its parent and issues end-entity certificates only (path length 0).',
      submit: 'Create',
      creating: 'Generating…'
    },
    import: {
      title: 'Import an authority',
      hint: 'The certificate must be an authority certificate (CA) and the private key must match it. PEM or DER files.',
      certificate: 'Authority certificate',
      privateKey: 'Private key',
      passphrase: 'Private key password (if encrypted)',
      pickFile: 'Open a file…',
      submit: 'Import',
      pick: {
        certificate: 'Authority certificate',
        key: 'Private key',
        csr: 'Certificate signing request'
      }
    },
    issue: {
      title: 'Issue a certificate · {name}',
      modes: {
        generate: 'New key',
        csr: 'Sign a request (CSR)'
      },
      profile: 'Profile',
      role: 'Modbus role',
      rolePlaceholder: 'none',
      dns: 'DNS names',
      ips: 'IP addresses',
      uris: 'URIs',
      applicationUri: 'Application URI',
      extraDns: 'Additional DNS names',
      extraIps: 'Additional IP addresses',
      csr: 'Certificate signing request (PKCS#10)',
      addHost: 'Add the names of this PC',
      submit: 'Issue',
      sign: 'Sign',
      issuing: 'Generating…',
      done: 'Certificate “{name}” issued',
      opcuaRsa:
        'The usual OPC UA security policies (Basic256Sha256, Aes128/Aes256…) require an RSA key: choose RSA 2048 or more unless the application uses the ECC policies.',
      expiredAuthority: 'This authority has expired: it can no longer issue certificates.'
    },
    list: {
      title: 'Issued certificates ({count})',
      none: 'No certificate issued by this authority.',
      names: 'Alternative names',
      expires: 'Expires',
      role: 'role {role}',
      fromCsr: 'signed request',
      revokedOn: 'Revoked on {date}',
      details: 'Details',
      export: 'Export',
      revoke: 'Revoke',
      confirmRemove: 'Delete the certificate “{name}” and its private key?'
    },
    revoke: {
      title: 'Revoke “{name}”',
      reason: 'Reason',
      hint: 'The certificate is added to the revocation list of the authority, which is regenerated: export it again where it is used.',
      submit: 'Revoke'
    },
    export: {
      title: 'Export',
      titleOf: 'Export “{name}”',
      password: 'Password',
      passwordConfirm: 'Confirm the password',
      passwordHint: 'PBES2 encryption (AES-256, PBKDF2-SHA256) and SHA-256 integrity, as OpenSSL 3 does.',
      keyWarning: 'The file contains the private key: keep it secret.',
      saved: 'Saved: {path}',
      submit: 'Export'
    },
    details: {
      subject: 'Subject',
      issuer: 'Issuer',
      serial: 'Serial number',
      validity: 'Validity',
      validityRange: 'from {from} to {to}',
      key: 'Key',
      type: 'Type',
      rootCa: 'Authority',
      intermediateCa: 'Intermediate authority',
      endEntity: 'End entity',
      keyUsages: 'Key usages',
      extendedKeyUsages: 'Extended key usages',
      role: 'Modbus role',
      copyPem: 'Copy PEM',
      copied: 'Copied'
    },
    errors: {
      unknownKeyAlgorithm: 'Unknown key algorithm: {name}',
      keyEncrypted: 'The private key is encrypted: enter its password',
      invalidKey: 'Unreadable private key ({message})',
      unsupportedKey: 'Unsupported key type: {type}',
      missingCommonName: 'Enter the common name (CN)',
      invalidCountry: 'Country: two letters (ISO 3166 code, e.g. FR)',
      invalidDns: 'Invalid DNS name: {value}',
      invalidIp: 'Invalid IP address: {value}',
      invalidUri: 'Invalid URI: {value}',
      roleTooLong: 'Role too long (127 bytes maximum)',
      invalidValidity: 'Validity: whole number of days from 1 to {max}',
      unknownProfile: 'Unknown profile: {profile}',
      opcuaNeedsUri: 'An OPC UA application certificate needs its application URI (e.g. urn:hostname:Application)',
      invalidCsr: 'Unreadable certificate signing request ({message})',
      csrSignature: 'The signature of the request is invalid',
      unknownAuthority: 'Unknown authority',
      parentCannotSign: 'This authority cannot sign another authority (path length 0)',
      invalidCertificate: 'Unreadable certificate ({message})',
      notAuthority: 'This certificate is not an authority certificate (basic constraints CA missing)',
      keyMismatch: 'The private key does not match the certificate',
      alreadyImported: 'This authority is already present',
      hasChildren: 'Delete its {count} intermediate authority(ies) first',
      unknownCertificate: 'Unknown certificate',
      unknownReason: 'Unknown revocation reason: {reason}',
      alreadyRevoked: 'Certificate already revoked',
      revokedKept: 'A revoked certificate stays in the revocation list',
      noPrivateKey: 'The private key of this certificate is not known (signed request)',
      unknownFormat: 'Unknown export format: {format}',
      pemExpected: 'Expected a PEM file'
    }
  }
}
