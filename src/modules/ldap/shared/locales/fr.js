export default {
  ldap: {
    name: 'LDAP',
    description: 'Annuaire LDAP / LDAPS simulé (authentification, recherche) et client',
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
  }
}
