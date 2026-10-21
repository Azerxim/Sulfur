export default {
  ldap: {
    name: 'LDAP / RADIUS',
    description: 'Annuaire LDAP / LDAPS et serveur RADIUS simulés (authentification centralisée) et clients',
    tabs: {
      server: 'Serveur LDAP',
      client: 'Client LDAP',
      radiusServer: 'Serveur RADIUS',
      radiusClient: 'Client RADIUS'
    },
    security: {
      plain: 'LDAP (non chiffré)',
      ldaps: 'LDAPS (TLS)'
    },
    scopes: {
      base: 'Entrée de base',
      one: 'Un niveau',
      sub: 'Sous-arbre'
    },
    ldif: {
      syntax: '« attribut: valeur » attendu',
      base64: 'valeur base64 invalide',
      dn: 'DN invalide',
      noDn: 'attribut avant la première ligne « dn: »',
      duplicate: 'entrée définie deux fois'
    },
    server: {
      title: 'Configuration du serveur',
      running: 'En marche · {count} connexion(s)',
      host: "Interface d'écoute",
      port: 'Port',
      securityLabel: 'Sécurité',
      sizeLimit: 'Entrées au plus par recherche',
      startTls: 'Autoriser StartTLS',
      allowAnonymous: 'Liaison et recherche anonymes',
      hint: 'Annuaire en lecture seule : liaison simple (DN et mot de passe), recherche, comparaison, StartTLS et « Who am I ». Les écritures sont refusées (unwillingToPerform). Les ports standards 389 / 636 nécessitent des droits administrateur sous Linux.',
      counters:
        '{entries} entrées · {connections} connexion(s) · {binds} liaison(s), {bindFailures} échouée(s) · {searches} recherche(s)',
      certificate: 'certificat {name} · empreinte {thumbprint}…',
      directory: 'Annuaire ({count} entrées)',
      resetLdif: "Annuaire d'exemple",
      confirmReset: "Remplacer l'annuaire par l'annuaire d'exemple ?",
      ldifHint:
        'LDIF : entrées séparées par une ligne vide. userPassword en clair ou haché ({SSHA}, {SHA}, {SSHA256}, {SSHA512}) ; memberOf est déduit des groupes (member, uniqueMember). Les mots de passe ne sont jamais renvoyés par une recherche.',
      accounts: 'Comptes pouvant se lier ({count})',
      accountsHint: 'Entrées ayant un userPassword : leur DN et leur mot de passe authentifient un client.',
      log: 'Journal ({count})',
      clearLog: 'Effacer',
      noLog: 'Aucun événement pour le moment.'
    },
    client: {
      url: 'URL du serveur',
      bindDn: 'DN de liaison',
      anonymous: 'anonyme',
      password: 'Mot de passe',
      authenticate: "S'authentifier",
      startTls: 'StartTLS',
      rejectUnauthorized: 'Refuser un certificat serveur inconnu',
      timeout: "Délai d'attente (ms)",
      search: 'Recherche',
      base: 'Base de recherche',
      scope: 'Portée',
      filter: 'Filtre',
      attributes: 'Attributs (tous si vide)',
      sizeLimit: 'Limite',
      searchButton: 'Rechercher',
      result: 'Résultat',
      bindOk: 'Liaison réussie en tant que {dn} · identité {identity} · {duration} ms',
      searchSummary: '{count} entrée(s) · {duration} ms',
      noEntry: 'Aucune entrée ne correspond à la recherche.',
      history: 'Historique ({count})',
      noHistory: 'Aucune opération pour le moment.',
      kinds: {
        bind: 'liaison',
        search: 'recherche'
      }
    },
    log: {
      started: 'Serveur démarré sur {endpoint} — {count} entrées',
      stopped: 'Serveur arrêté',
      updated: 'Annuaire mis à jour — {count} entrées',
      tlsFailure: 'Échec de la négociation TLS : {message}',
      protocolError: 'Erreur de protocole, connexion fermée : {message}',
      writeRefused: '{op} sur {dn} refusé : annuaire en lecture seule',
      readOnly: 'annuaire en lecture seule',
      unsupported: 'Opération non prise en charge (0x{tag}), connexion fermée',
      saslUnsupported: 'Les liaisons SASL ne sont pas prises en charge',
      anonymousRefused: 'Liaison anonyme refusée',
      anonymousDisabled: 'liaison anonyme désactivée',
      anonymousBind: 'Liaison anonyme',
      bindFailed: 'Échec de la liaison pour {dn} : {reason}',
      emptyPassword: 'mot de passe vide',
      badDn: 'DN invalide',
      noEntry: 'entrée inconnue',
      noPassword: 'entrée sans userPassword',
      wrongPassword: 'mot de passe incorrect',
      bindOk: 'Liaison réussie : {dn}',
      searchRefused: 'Recherche dans {base} refusée : liaison requise',
      bindRequired: 'liaison requise',
      search: 'Recherche {base} ({scope}) {filter} → {count} entrée(s)',
      alreadyTls: 'connexion déjà chiffrée',
      startTlsDisabled: 'StartTLS désactivé',
      startTls: 'Connexion passée en TLS ({protocol})',
      unknownExtended: 'opération étendue {name} non prise en charge'
    },
    errors: {
      ldif: 'LDIF ligne {line} : {problem}',
      invalidPort: 'Port invalide (1 à 65535)',
      invalidSizeLimit: 'Limite de taille invalide',
      portPrivileged: 'Le port {port} nécessite des droits administrateur : choisissez un port ≥ 1024',
      portInUse: 'Le port {port} est déjà utilisé',
      invalidUrl: 'URL ldap://hôte:port ou ldaps://hôte:port attendue',
      invalidScope: 'Portée invalide',
      startTlsOnLdaps: "StartTLS ne s'utilise pas avec ldaps://",
      result: 'Erreur LDAP {code} : {message}',
      connectionRefused: 'Connexion refusée par le serveur',
      readOnlyPoint: 'Le point {id} est en lecture seule'
    }
  },
  radius: {
    methods: {
      pap: 'PAP',
      chap: 'CHAP'
    },
    server: {
      authPort: 'Port d’authentification',
      acctPort: 'Port d’accounting',
      accounting: 'Accounting',
      requireMessageAuthenticator: 'Exiger Message-Authenticator',
      running: 'En marche · {count} requête(s)',
      hint: 'RADIUS sur UDP (RFC 2865, 2866) : authentification PAP et CHAP, accounting, Status-Server. Chaque réponse porte un Message-Authenticator ; l’exiger dans les requêtes protège de Blast-RADIUS. Les ports standards 1812 / 1813 ne demandent pas de droits administrateur.',
      authentication: 'authentification',
      accountingLabel: 'accounting',
      counters:
        '{requests} requête(s) · {accepts} acceptée(s) · {rejects} refusée(s) · {dropped} ignorée(s) · {accounting} accounting',
      directoryUsers: 'comptes de l’annuaire'
    },
    clients: {
      title: 'Clients (NAS) ({count})',
      name: 'Nom',
      address: 'Adresse ou réseau (CIDR)',
      secret: 'Secret partagé',
      hint: 'Seuls les équipements déclarés ici reçoivent une réponse, avec leur secret partagé. 0.0.0.0/0 accepte toute adresse IPv4.'
    },
    users: {
      title: 'Comptes locaux ({count})',
      username: 'Nom d’utilisateur',
      password: 'Mot de passe',
      attributes: 'Attributs de la réponse',
      hint: 'Les mots de passe sont conservés en clair : CHAP en a besoin. Attributs de la réponse : un « Nom = valeur » par ligne, ex. Service-Type = Administrative-User, Session-Timeout = 3600, Filter-Id = admins, Cisco-AVPair = shell:priv-lvl=15, Vendor-Specific = 9:1:texte.'
    },
    directory: {
      title: 'Comptes de l’annuaire LDAP',
      enabled: 'Authentifier les comptes de l’annuaire',
      attribute: 'Attribut du nom d’utilisateur',
      attributes: 'Attributs de la réponse',
      hint: 'Comptes de l’onglet Serveur LDAP (annuaire en marche, ou celui enregistré), retrouvés par cet attribut et vérifiés avec userPassword. Un compte local du même nom passe en premier. CHAP ne fonctionne qu’avec un userPassword en clair.'
    },
    sessions: {
      title: 'Sessions d’accounting ({count})',
      user: 'Utilisateur',
      id: 'Session',
      client: 'Client',
      since: 'Début'
    },
    client: {
      title: 'Demande d’accès',
      host: 'Serveur (adresse IP ou nom)',
      retries: 'Renvois',
      nasIdentifier: 'NAS-Identifier',
      nasIpAddress: 'NAS-IP-Address',
      notSent: 'non envoyé',
      messageAuthenticator: 'Message-Authenticator',
      method: 'Méthode',
      statusServerHint: 'Vérifier que le serveur répond (RFC 5997)',
      attributes: 'Attributs supplémentaires',
      attributesHint:
        'Un « Nom = valeur » par ligne, ajouté aux requêtes (ex. Calling-Station-Id = 00-11-22-33-44-55).',
      accountingTitle: 'Accounting',
      sessionId: 'Acct-Session-Id',
      sessionIdPlaceholder: 'généré au Start',
      sessionOpen: 'Session {id} ouverte depuis {time}',
      noSession: 'Aucune session ouverte',
      acct: {
        start: 'Start',
        interim: 'Interim-Update',
        stop: 'Stop'
      },
      timing: '{destination} · {duration} ms · {attempts} tentative(s)',
      sessionTime: 'durée de session {seconds} s',
      noAttribute: 'Aucun attribut dans la réponse.'
    },
    log: {
      started: 'Serveur démarré sur {endpoints}',
      stopped: 'Serveur arrêté',
      updated: 'Configuration mise à jour — {clients} client(s), {users} compte(s) local(aux)',
      tooShort: 'paquet trop court',
      badLength: 'longueur invalide {length}',
      badAttribute: 'attribut invalide à la position {offset}',
      unknownClient: 'Requête d’un client non déclaré : ignorée',
      malformed: 'Paquet mal formé ignoré : {message}',
      badMessageAuthenticator: 'Message-Authenticator invalide ({client}) : mauvais secret partagé ? Ignorée',
      missingMessageAuthenticator: 'Access-Request sans Message-Authenticator ({client}) : ignorée',
      statusServer: 'Status-Server de {client}',
      unexpectedCode: 'Paquet {code} inattendu : ignoré',
      reject: 'Access-Reject {user} {method} : {reason}',
      accept: 'Access-Accept {user} ({method}, {source}) → {attributes}',
      forced: 'réponse forcée (défaut injecté)',
      noUserName: 'pas de User-Name',
      badPassword: 'User-Password illisible',
      eapUnsupported: 'EAP n’est pas pris en charge',
      noPassword: 'ni User-Password ni CHAP-Password',
      unknownUser: 'utilisateur inconnu',
      chapNeedsCleartext: 'CHAP demande un mot de passe en clair',
      wrongPassword: 'mauvais mot de passe',
      sourceLocal: 'compte local',
      badAccountingAuthenticator:
        'Authentificateur d’Accounting-Request invalide ({client}) : mauvais secret partagé ? Ignorée',
      accounting: 'Accounting {type} · {user} · session {session} · {time}'
    },
    errors: {
      unknownAttribute: 'attribut inconnu {name}',
      reservedAttribute: '{name} ne peut pas être saisi',
      invalidValue: 'valeur invalide pour {name} : {value}',
      attributeSyntax: '« Nom = valeur » attendu',
      attributeLine: 'Ligne {line} : {message}',
      attributeTooLong: 'Attribut {name} trop long (253 octets au plus)',
      packetTooLarge: 'Paquet trop grand (4096 octets au plus)',
      passwordTooLong: 'Mot de passe trop long (128 octets au plus)',
      invalidPort: 'Port invalide (1 à 65535)',
      samePort: 'L’authentification et l’accounting ne peuvent pas partager le même port',
      invalidClient: 'Adresse de client invalide : {address}',
      missingSecret: 'Secret partagé manquant pour le client {name}',
      noClient: 'Déclarer au moins un client (NAS)',
      userAttributes: 'Attributs de la réponse de {name} : {message}',
      portPrivileged: 'Le port {port} demande les droits administrateur : choisir un port ≥ 1024',
      portInUse: 'Le port {port} est déjà utilisé',
      missingHost: 'Saisir le serveur',
      missingClientSecret: 'Saisir le secret partagé',
      invalidMethod: 'Méthode d’authentification inconnue',
      invalidRetries: 'Nombre de renvois invalide (0 à 10)',
      timeout: 'Pas de réponse de {destination} après {attempts} tentative(s)',
      refused: 'Port injoignable : pas de serveur RADIUS à cette adresse',
      badResponseAuthenticator: 'Authentificateur de réponse invalide : mauvais secret partagé ?',
      badResponseMessageAuthenticator: 'Message-Authenticator de la réponse invalide : mauvais secret partagé ?',
      missingUser: 'Saisir le nom d’utilisateur',
      invalidAccounting: 'Requête d’accounting inconnue'
    }
  }
}
