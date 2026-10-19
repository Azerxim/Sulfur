export default {
  syslog: {
    name: 'Syslog',
    description: 'Serveur Syslog (UDP / TCP / TLS, RFC 5424 et 3164) et émetteur de messages',
    transports: {
      udp: 'UDP',
      tcp: 'TCP',
      tls: 'TLS'
    },
    formats: {
      rfc5424: 'RFC 5424',
      rfc3164: 'RFC 3164 (BSD)',
      unknown: 'Texte libre'
    },
    framings: {
      octet: 'Longueur en tête (octet counting)',
      lf: 'Fin de ligne (LF)'
    },
    severities: {
      emerg: 'Urgence',
      alert: 'Alerte',
      crit: 'Critique',
      err: 'Erreur',
      warning: 'Avertissement',
      notice: 'Notification',
      info: 'Information',
      debug: 'Débogage'
    },
    server: {
      title: 'Configuration du serveur',
      running: 'En marche · {count} message(s)',
      host: "Interface d'écoute",
      port: 'Port',
      portsHint:
        'Ports standard : 514 (UDP / TCP) et 6514 (TLS) — droits administrateur requis sous Linux pour les ports < 1024.',
      certificate: 'certificat {name}',
      connections: '{count} connexion(s) TCP / TLS',
      cut: 'connexions coupées (défaut injecté)'
    },
    messages: {
      title: 'Messages ({count})',
      clear: 'Effacer les messages',
      minSeverity: 'Gravité minimale',
      allSeverities: 'Toutes',
      search: 'Rechercher (texte, hôte, application)',
      pause: "Mettre l'affichage en pause",
      resume: "Reprendre l'affichage",
      paused: 'Affichage en pause',
      received: 'Reçu',
      source: 'Source',
      facility: 'Facilité',
      severity: 'Gravité',
      host: 'Hôte',
      app: 'Application',
      message: 'Message',
      none: 'Aucun message reçu.',
      noMatch: 'Aucun message ne correspond au filtre.',
      stopped: 'Serveur arrêté.',
      details: 'Détails',
      timestamp: 'Horodatage du message',
      format: 'Format',
      procId: 'Processus',
      msgId: 'Identifiant du message',
      structuredData: 'Données structurées',
      raw: 'Message brut',
      shown: '{shown} sur {count} affiché(s)'
    },
    stats: {
      title: 'Messages par gravité',
      total: 'Total'
    },
    client: {
      title: 'Destination',
      host: 'Serveur (adresse IP ou nom)',
      useLocal: 'Serveur local',
      useLocalHint: 'Envoyer au serveur Syslog démarré dans Sulfur',
      port: 'Port',
      transport: 'Transport',
      framing: 'Délimitation',
      rejectUnauthorized: 'Vérifier le certificat du serveur',
      connected: 'Connecté à {destination}',
      idle: 'Inactif',
      repeating: 'Envoi toutes les {seconds} s',
      disconnect: 'Fermer la connexion'
    },
    compose: {
      title: 'Message',
      format: 'Format',
      facility: 'Facilité',
      severity: 'Gravité',
      hostname: "Nom d'hôte",
      hostnameHint: 'Vide : nom de ce PC ({name})',
      appName: 'Application (APP-NAME / tag)',
      procId: 'Processus (PROCID)',
      msgId: 'Identifiant (MSGID)',
      structuredData: 'Données structurées',
      structuredDataHint: 'RFC 5424 uniquement, ex. [origin ip="192.0.2.1"][meta sequenceId="1"]',
      message: 'Texte',
      messageHint: "{n} : numéro du message, {time} : heure d'envoi",
      count: 'Messages par envoi',
      interval: 'Période (s)',
      preview: 'Aperçu',
      send: 'Envoyer',
      startRepeat: 'Envoyer en continu',
      stopRepeat: 'Arrêter'
    },
    history: {
      title: 'Envois ({count})',
      clear: "Effacer l'historique",
      empty: 'Aucun message envoyé.',
      destination: 'Destination',
      count: 'Messages',
      message: 'Dernier message'
    },
    errors: {
      invalidPort: 'Port invalide (1 à 65535)',
      portPrivileged: 'Le port {port} nécessite les droits administrateur : choisissez un port ≥ 1024',
      portInUse: 'Le port {port} est déjà utilisé',
      noTransport: 'Activez au moins un transport (UDP, TCP ou TLS)',
      samePort: 'TCP et TLS ne peuvent pas partager le port {port}',
      missingHost: 'Indiquez le serveur destinataire',
      invalidTransport: 'Transport inconnu',
      invalidFormat: 'Format de message inconnu',
      invalidFacility: 'Facilité invalide (0 à 23)',
      invalidSeverity: 'Gravité invalide (0 à 7)',
      invalidCount: 'Nombre de messages invalide (1 à {max})',
      minInterval: 'Période minimale : 0,1 s',
      connectTimeout: 'Délai de connexion dépassé',
      refused: 'Connexion refusée par {destination}',
      readOnlyPoint: 'Le point {id} est en lecture seule'
    }
  }
}
