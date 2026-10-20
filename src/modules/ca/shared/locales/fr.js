export default {
  ca: {
    name: 'Autorité de certification',
    description: 'Autorités de certification, émission et révocation de certificats X.509',
    cancel: 'Annuler',
    openFolder: 'Ouvrir le dossier',
    keyAlgorithms: {
      'ecdsa-p256': 'ECDSA P-256 (recommandé)',
      'ecdsa-p384': 'ECDSA P-384',
      'rsa-2048': 'RSA 2048',
      'rsa-3072': 'RSA 3072',
      'rsa-4096': 'RSA 4096 (génération lente)'
    },
    profiles: {
      server: 'Serveur TLS',
      client: 'Client TLS',
      serverClient: 'Serveur et client TLS',
      opcua: 'Application OPC UA',
      modbus: 'Modbus/TCP Security',
      authority: 'Autorité intermédiaire'
    },
    profileHints: {
      server:
        'Serveurs HTTPS, MQTT, Syslog TLS… : usage étendu serverAuth. Les clients vérifient les noms alternatifs (DNS, IP) par rapport à l’adresse à laquelle ils se connectent.',
      client: 'Authentification des clients (TLS mutuel) : usage étendu clientAuth.',
      serverClient: 'Authentification serveur et client (serverAuth et clientAuth).',
      opcua:
        'Certificat d’instance d’application OPC UA : l’URI d’application est obligatoire et doit être celle configurée dans l’application ; ajoutez le nom DNS et les adresses IP de la machine.',
      modbus:
        'Équipement ou client Modbus/TCP Security : serverAuth et clientAuth, et rôle du client dans l’extension 1.3.6.1.4.1.50316.802.1 (autorisation côté serveur).'
    },
    reasons: {
      unspecified: 'Non précisé',
      keyCompromise: 'Clé compromise',
      cACompromise: 'Autorité compromise',
      affiliationChanged: 'Changement d’affiliation',
      superseded: 'Remplacé',
      cessationOfOperation: 'Fin d’activité'
    },
    formats: {
      'cert-pem': 'Certificat (PEM)',
      'cert-der': 'Certificat (DER)',
      'chain-pem': 'Certificat et chaîne (PEM)',
      'key-pem': 'Clé privée (PEM, PKCS#8)',
      p12: 'PKCS#12 (.p12 / .pfx)',
      'crl-pem': 'CRL (PEM)',
      'crl-der': 'CRL (DER)'
    },
    formatHints: {
      'cert-pem': 'Fichier texte -----BEGIN CERTIFICATE----- : la plupart des serveurs et clients TLS.',
      'cert-der': 'Fichier binaire (.der) : applications OPC UA, Windows, automates et IHM.',
      'chain-pem': 'Le certificat suivi des autorités jusqu’à la racine (fullchain).',
      'key-pem': 'Clé privée non chiffrée : à garder secrète.',
      p12: 'Certificat, chaîne et clé privée protégés par un mot de passe : Windows, Java, navigateurs.'
    },
    statuses: {
      valid: 'Valide',
      expired: 'Expiré',
      revoked: 'Révoqué'
    },
    fields: {
      commonName: 'Nom commun (CN)',
      organization: 'Organisation (O)',
      organizationalUnit: 'Unité (OU)',
      country: 'Pays (C, 2 lettres)',
      validityDays: 'Validité (jours)',
      keyAlgorithm: 'Algorithme de clé'
    },
    authorities: {
      title: 'Autorités ({count})',
      none: 'Aucune autorité pour l’instant : créez une autorité racine, ou importez une autorité existante (certificat et clé privée).',
      create: 'Nouvelle autorité',
      import: 'Importer',
      root: 'Racine',
      intermediate: 'Intermédiaire',
      imported: 'Importée',
      issuedCount: '{count} certificat(s)'
    },
    authority: {
      view: 'Afficher',
      export: 'Exporter',
      crl: 'Liste de révocation',
      crlInfo: 'mise à jour le {date}, prochaine mise à jour {next} · {count} révoqué(s)',
      updateCrl: 'Mettre à jour la CRL',
      updateCrlHint: 'Génère une nouvelle liste de révocation (valable 30 jours), à republier là où elle est utilisée.',
      exportCrl: 'Exporter la CRL',
      crlHint:
        'Liste de révocation signée par l’autorité, à installer avec son certificat (magasin des émetteurs OPC UA…).',
      createIntermediate: 'Autorité intermédiaire',
      remove: 'Supprimer',
      confirmRemove:
        'Supprimer l’autorité « {name} », sa clé privée et les certificats qu’elle a émis ? Cette action est définitive.'
    },
    create: {
      title: 'Nouvelle autorité de certification',
      parent: 'Signée par',
      noParent: 'Personne : autorité racine auto-signée',
      rootHint:
        'Une autorité racine se signe elle-même : installez son certificat dans les magasins de confiance des équipements et applications.',
      intermediateHint:
        'Une autorité intermédiaire est signée par son parent et n’émet que des certificats finaux (longueur de chemin 0).',
      submit: 'Créer',
      creating: 'Génération…'
    },
    import: {
      title: 'Importer une autorité',
      hint: 'Le certificat doit être un certificat d’autorité (CA) et la clé privée doit lui correspondre. Fichiers PEM ou DER.',
      certificate: 'Certificat de l’autorité',
      privateKey: 'Clé privée',
      passphrase: 'Mot de passe de la clé privée (si elle est chiffrée)',
      pickFile: 'Ouvrir un fichier…',
      submit: 'Importer',
      pick: {
        certificate: 'Certificat de l’autorité',
        key: 'Clé privée',
        csr: 'Demande de signature de certificat'
      }
    },
    issue: {
      title: 'Émettre un certificat · {name}',
      modes: {
        generate: 'Nouvelle clé',
        csr: 'Signer une demande (CSR)'
      },
      profile: 'Profil',
      role: 'Rôle Modbus',
      rolePlaceholder: 'aucun',
      dns: 'Noms DNS',
      ips: 'Adresses IP',
      uris: 'URI',
      applicationUri: 'URI d’application',
      extraDns: 'Noms DNS supplémentaires',
      extraIps: 'Adresses IP supplémentaires',
      csr: 'Demande de signature de certificat (PKCS#10)',
      addHost: 'Ajouter les noms de ce PC',
      submit: 'Émettre',
      sign: 'Signer',
      issuing: 'Génération…',
      done: 'Certificat « {name} » émis',
      opcuaRsa:
        'Les politiques de sécurité OPC UA courantes (Basic256Sha256, Aes128/Aes256…) exigent une clé RSA : choisissez RSA 2048 ou plus, sauf si l’application utilise les politiques ECC.',
      expiredAuthority: 'Cette autorité a expiré : elle ne peut plus émettre de certificats.'
    },
    list: {
      title: 'Certificats émis ({count})',
      none: 'Aucun certificat émis par cette autorité.',
      names: 'Noms alternatifs',
      expires: 'Expiration',
      role: 'rôle {role}',
      fromCsr: 'demande signée',
      revokedOn: 'Révoqué le {date}',
      details: 'Détails',
      export: 'Exporter',
      revoke: 'Révoquer',
      confirmRemove: 'Supprimer le certificat « {name} » et sa clé privée ?'
    },
    revoke: {
      title: 'Révoquer « {name} »',
      reason: 'Motif',
      hint: 'Le certificat est ajouté à la liste de révocation de l’autorité, qui est régénérée : exportez-la de nouveau là où elle est utilisée.',
      submit: 'Révoquer'
    },
    export: {
      title: 'Exporter',
      titleOf: 'Exporter « {name} »',
      password: 'Mot de passe',
      passwordConfirm: 'Confirmer le mot de passe',
      passwordHint: 'Chiffrement PBES2 (AES-256, PBKDF2-SHA256) et intégrité SHA-256, comme OpenSSL 3.',
      keyWarning: 'Le fichier contient la clé privée : gardez-le secret.',
      saved: 'Enregistré : {path}',
      submit: 'Exporter'
    },
    details: {
      subject: 'Sujet',
      issuer: 'Émetteur',
      serial: 'Numéro de série',
      validity: 'Validité',
      validityRange: 'du {from} au {to}',
      key: 'Clé',
      type: 'Type',
      rootCa: 'Autorité',
      intermediateCa: 'Autorité intermédiaire',
      endEntity: 'Certificat final',
      keyUsages: 'Usages de la clé',
      extendedKeyUsages: 'Usages étendus',
      role: 'Rôle Modbus',
      copyPem: 'Copier le PEM',
      copied: 'Copié'
    },
    errors: {
      unknownKeyAlgorithm: 'Algorithme de clé inconnu : {name}',
      keyEncrypted: 'La clé privée est chiffrée : saisissez son mot de passe',
      invalidKey: 'Clé privée illisible ({message})',
      unsupportedKey: 'Type de clé non pris en charge : {type}',
      missingCommonName: 'Saisissez le nom commun (CN)',
      invalidCountry: 'Pays : deux lettres (code ISO 3166, par exemple FR)',
      invalidDns: 'Nom DNS invalide : {value}',
      invalidIp: 'Adresse IP invalide : {value}',
      invalidUri: 'URI invalide : {value}',
      roleTooLong: 'Rôle trop long (127 octets au maximum)',
      invalidValidity: 'Validité : nombre entier de jours de 1 à {max}',
      unknownProfile: 'Profil inconnu : {profile}',
      opcuaNeedsUri:
        'Un certificat d’application OPC UA a besoin de son URI d’application (par exemple urn:hostname:Application)',
      invalidCsr: 'Demande de signature illisible ({message})',
      csrSignature: 'La signature de la demande est invalide',
      unknownAuthority: 'Autorité inconnue',
      parentCannotSign: 'Cette autorité ne peut pas signer une autre autorité (longueur de chemin 0)',
      invalidCertificate: 'Certificat illisible ({message})',
      notAuthority: 'Ce certificat n’est pas un certificat d’autorité (contrainte de base CA absente)',
      keyMismatch: 'La clé privée ne correspond pas au certificat',
      alreadyImported: 'Cette autorité est déjà présente',
      hasChildren: 'Supprimez d’abord ses {count} autorité(s) intermédiaire(s)',
      unknownCertificate: 'Certificat inconnu',
      unknownReason: 'Motif de révocation inconnu : {reason}',
      alreadyRevoked: 'Certificat déjà révoqué',
      revokedKept: 'Un certificat révoqué reste dans la liste de révocation',
      noPrivateKey: 'La clé privée de ce certificat n’est pas connue (demande signée)',
      unknownFormat: 'Format d’export inconnu : {format}',
      pemExpected: 'Fichier PEM attendu'
    }
  }
}
