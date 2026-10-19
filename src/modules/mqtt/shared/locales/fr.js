export default {
  mqtt: {
    name: 'MQTT',
    description: 'Broker MQTT simulé (topics simulés, authentification, TLS) et client MQTT',
    dataTypes: {
      Number: 'Nombre',
      Integer: 'Entier',
      Boolean: 'Booléen',
      String: 'Texte'
    },
    formats: {
      plain: 'Valeur',
      json: 'JSON'
    },
    versions: {
      3: 'MQTT 3.1',
      4: 'MQTT 3.1.1',
      5: 'MQTT 5.0'
    },
    server: {
      title: 'Configuration du broker',
      running: 'En marche · {clients} client(s) · {count} message(s)',
      host: "Interface d'écoute",
      port: 'Port',
      tls: 'TLS (mqtts)',
      portsHint: 'Ports standard : 1883 (MQTT) et 8883 (TLS). Clients MQTT 3.1 et 3.1.1.',
      certificate: 'certificat {name}',
      cut: 'connexions coupées (défaut injecté)'
    },
    auth: {
      title: 'Authentification ({count} utilisateur(s))',
      anonymous: "Accepter les connexions sans nom d'utilisateur",
      anonymousHint:
        'Décoché : seuls les utilisateurs ci-dessous peuvent se connecter (code CONNACK 5 sinon, code 4 pour un mauvais mot de passe).',
      username: 'Utilisateur',
      password: 'Mot de passe',
      passwordSet: 'Mot de passe défini (saisir pour le changer)',
      noUser: 'Aucun utilisateur.'
    },
    topics: {
      title: 'Topics simulés ({count})',
      topic: 'Topic',
      interval: 'Publication (ms)',
      intervalHint: '0 : publié à chaque changement de valeur',
      qos: 'QoS',
      retain: 'Retenu',
      retainHint: 'Message retenu : envoyé aux nouveaux abonnés',
      format: 'Contenu',
      writable: 'Modifiable',
      writableHint: 'Un client peut changer la valeur en la publiant sur <topic>/set',
      hint: 'Les topics sont publiés par le broker lui-même. Les topics modifiables acceptent une nouvelle valeur publiée sur <topic>/set (valeur seule, ou JSON {"value": …}).',
      invalid: 'Topic invalide ou en double'
    },
    clients: {
      title: 'Clients connectés ({count})',
      id: 'Identifiant',
      address: 'Adresse',
      user: 'Utilisateur',
      version: 'Protocole',
      subscriptions: 'Abonnements',
      since: 'Connecté à',
      none: 'Aucun client connecté.',
      stopped: 'Broker arrêté.'
    },
    log: {
      title: 'Messages ({count})',
      clear: 'Effacer les messages et les topics',
      filter: 'Filtre de topic (jokers + et #)',
      events: 'Événements de connexion',
      time: 'Heure',
      topic: 'Topic',
      payload: 'Contenu',
      from: 'Émetteur',
      broker: 'broker',
      empty: 'Aucun message.',
      noMatch: 'Aucun message ne correspond au filtre.',
      bytes: '{size} octets',
      eventText: {
        connect: '{clientId} connecté',
        disconnect: '{clientId} déconnecté',
        subscribe: '{clientId} abonné à {topic}',
        unsubscribe: '{clientId} désabonné de {topic}',
        error: '{topic} : {message}'
      }
    },
    explorer: {
      title: 'Topics ({count})',
      topic: 'Topic',
      last: 'Dernier contenu',
      count: 'Messages',
      time: 'Dernier',
      empty: 'Aucun topic publié pour le moment.'
    },
    client: {
      title: 'Connexion',
      host: 'Broker (adresse IP ou nom)',
      useLocal: 'Broker local',
      useLocalHint: 'Se connecter au broker MQTT démarré dans Sulfur',
      port: 'Port',
      tls: 'TLS (mqtts)',
      rejectUnauthorized: 'Vérifier le certificat du broker',
      version: 'Protocole',
      clientId: 'Identifiant client',
      clientIdHint: 'Vide : identifiant aléatoire',
      username: 'Utilisateur',
      password: 'Mot de passe',
      passwordHint: 'Enregistré avec la configuration (en clair)',
      clean: 'Session propre (clean session)',
      keepalive: 'Keep alive (s)',
      autoReconnect: 'Reconnexion automatique',
      connectedTo: 'Connecté à {url} · {clientId}',
      connecting: 'Connexion…',
      will: 'Message de dernière volonté',
      willHint: 'Publié par le broker si le client se déconnecte anormalement.',
      willEnabled: 'Envoyer un message de dernière volonté'
    },
    subscriptions: {
      title: 'Abonnements ({count})',
      topic: 'Filtre de topic',
      qos: 'QoS',
      field: 'Champ JSON',
      fieldHint: 'Chemin de la valeur dans un contenu JSON (ex. value ou data.temp) ; vide : contenu entier',
      granted: 'Accordé',
      refused: 'refusé',
      pending: 'en attente',
      last: 'Dernière valeur',
      hint: 'Chaque abonnement est un point de données pour le simulateur et les courbes ; écrire un abonnement sans joker publie la valeur sur son topic.'
    },
    publish: {
      title: 'Publier',
      topic: 'Topic',
      payload: 'Contenu',
      qos: 'QoS',
      retain: 'Retenu',
      send: 'Publier'
    },
    received: {
      title: 'Messages reçus ({count})',
      clear: 'Effacer les messages',
      empty: 'Aucun message reçu.'
    },
    errors: {
      invalidPort: 'Port invalide (1 à 65535)',
      portPrivileged: 'Le port {port} nécessite les droits administrateur : choisissez un port ≥ 1024',
      portInUse: 'Le port {port} est déjà utilisé',
      invalidTopic: 'Topic invalide : « {topic} » (non vide, sans joker + ou #)',
      invalidFilter: 'Filtre de topic invalide : « {topic} »',
      reservedTopic: 'Les topics commençant par $ sont réservés au broker',
      duplicateTopic: 'Le topic {topic} est déjà simulé',
      invalidType: 'Type de valeur inconnu',
      invalidQos: 'QoS invalide (0, 1 ou 2)',
      invalidFormat: 'Format de contenu inconnu',
      invalidInterval: 'Période de publication invalide (0, ou au moins 10 ms)',
      invalidBoolean: 'Valeur booléenne invalide : {value}',
      unknownTopic: 'Topic simulé inconnu',
      emptyUsername: "Un utilisateur n'a pas de nom",
      duplicateUser: "L'utilisateur {name} est défini deux fois",
      missingPassword: "L'utilisateur {name} n'a pas de mot de passe",
      noUser: "Ajoutez un utilisateur, ou acceptez les connexions sans nom d'utilisateur",
      missingHost: 'Indiquez le broker auquel se connecter',
      invalidVersion: 'Version du protocole non prise en charge',
      alreadyConnected: 'Le client est déjà connecté',
      badCredentials: "Connexion refusée : nom d'utilisateur ou mot de passe incorrect",
      notAuthorized: 'Connexion refusée : non autorisé',
      refused: 'Connexion refusée (broker injoignable)',
      connectTimeout: 'Pas de réponse du broker',
      closed: 'Connexion fermée par le broker',
      readOnlyPoint: 'Le point {id} est en lecture seule'
    }
  }
}
