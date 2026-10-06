export default {
  opcua: {
    name: 'OPC UA',
    description: 'Serveur et client OPC UA (Sign / SignAndEncrypt, certificats)',
    securityModes: {
      None: 'Aucune',
      Sign: 'Signature',
      SignAndEncrypt: 'Signature et chiffrement'
    },
    deprecated: '{name} (obsolète)',
    server: {
      title: 'Configuration du serveur',
      running: 'En marche · {count} session(s)',
      port: 'Port',
      resourcePath: 'Chemin de ressource',
      rootFolder: 'Dossier racine',
      variables: 'Variables simulées ({count})',
      certsTitle: 'Certificats du serveur OPC UA'
    },
    security: {
      modes: 'Modes',
      policies: 'Politiques (modes signés)',
      auth: 'Authentification',
      anonymous: 'Accès anonyme autorisé',
      users: 'Utilisateurs ({count})',
      user: 'Utilisateur',
      username: 'Identifiant',
      passwordSet: '•••••• (défini, saisir pour changer)',
      passwordRequired: 'Mot de passe requis',
      hashedHint: 'Les mots de passe sont hachés (scrypt) : seule leur empreinte est conservée.',
      problems: {
        noMode: 'au moins un mode de sécurité est requis',
        noPolicy: 'les modes signés nécessitent au moins une politique',
        noAuth: "autorisez l'accès anonyme ou ajoutez un utilisateur",
        incompleteUser: 'chaque utilisateur doit avoir un identifiant et un mot de passe'
      }
    },
    client: {
      connectedWith: 'Connecté · {security}',
      endpoint: 'Endpoint',
      mode: 'Mode de sécurité',
      policy: 'Politique',
      auth: 'Authentification',
      anonymous: 'Anonyme',
      usernamePassword: 'Identifiant / mot de passe',
      username: 'Identifiant',
      password: 'Mot de passe',
      discover: 'Découvrir les endpoints',
      discovering: 'Découverte…',
      endpoints: 'Endpoints proposés par le serveur ({count})',
      level: 'niveau {level}',
      selected: 'Sélectionné',
      use: 'Utiliser',
      certsTitle: 'Certificats du client OPC UA',
      addressSpace: "Espace d'adressage",
      reload: 'Recharger',
      connectToBrowse: 'Connectez-vous pour parcourir les nœuds.',
      selectedNode: 'Nœud sélectionné',
      selectNode: "Sélectionnez un nœud dans l'arborescence.",
      read: 'Lire',
      monitor: 'Surveiller',
      unmonitor: 'Ne plus surveiller',
      nodeClass: 'Classe',
      newValue: 'Nouvelle valeur',
      write: 'Écrire',
      noMonitored: 'Aucune variable surveillée.'
    },
    errors: {
      userNoName: "Un utilisateur n'a pas d'identifiant",
      userNoPassword: "Mot de passe manquant pour l'utilisateur « {name} »",
      noMode: 'Sélectionnez au moins un mode de sécurité',
      noPolicy: 'Sélectionnez au moins une politique de sécurité pour les modes Signature / Chiffrement',
      noAuth: "Aucune authentification possible : autorisez l'accès anonyme ou ajoutez un utilisateur",
      duplicateNames: 'Noms de variables en double',
      emptyName: 'Le nom de la variable est vide',
      exists: 'La variable « {name} » existe déjà',
      unknownVariable: 'Variable inconnue',
      unknownType: 'Type inconnu : {type}',
      writeUnsupported: 'Écriture non supportée pour le type {type}',
      choosePolicy: 'Choisissez une politique de sécurité pour ce mode',
      writeRefused: 'Écriture refusée : {status}',
      authRefused: 'Authentification refusée (identifiant ou mot de passe incorrect, ou mode non autorisé). {details}',
      certRefused: 'Certificat refusé : approuvez le certificat dans le magasin du serveur et/ou du client. {details}',
      noAnonymous: "Le serveur n'autorise pas l'accès anonyme : utilisez un identifiant / mot de passe.",
      noUsername: "Le serveur n'accepte pas l'authentification par identifiant / mot de passe sur cet endpoint.",
      noEndpoint:
        'Le serveur ne propose pas ce couple mode / politique de sécurité (utilisez « Découvrir » pour voir les endpoints disponibles).'
    }
  }
}
