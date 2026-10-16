export default {
  http: {
    name: 'HTTP / REST',
    description: 'Serveur REST simulé (variables, routes, webhooks) et client HTTP / HTTPS',
    dataTypes: {
      Number: 'Nombre',
      Integer: 'Entier',
      Boolean: 'Booléen',
      String: 'Texte',
      JSON: 'JSON'
    },
    server: {
      title: 'Configuration du serveur',
      running: 'En marche · {count} requête(s)',
      host: "Interface d'écoute",
      port: 'Port',
      basePath: "Chemin de l'API",
      https: 'HTTPS (certificat auto-signé)',
      api: 'API REST des variables',
      cors: 'En-têtes CORS',
      portsHint:
        'Ports standards : 80 (HTTP) et 443 (HTTPS) — droits administrateur requis sous Linux pour les ports < 1024.',
      certificate: 'certificat {name}'
    },
    auth: {
      title: 'Authentification',
      type: 'Méthode',
      types: {
        none: 'Aucune',
        basic: 'Basic (utilisateurs)',
        bearer: 'Jeton Bearer',
        apiKey: "Clé d'API"
      },
      hints: {
        none: 'Toutes les requêtes sont acceptées.',
        basic:
          'En-tête Authorization: Basic. Les mots de passe sont hachés (scrypt) dès la saisie ; seule leur empreinte est enregistrée.',
        bearer: 'En-tête Authorization: Bearer <jeton>.',
        apiKey: "La clé est attendue dans l'en-tête choisi."
      },
      username: "Nom d'utilisateur",
      password: 'Mot de passe',
      passwordSet: 'Mot de passe défini (saisir pour le changer)',
      addUser: 'Utilisateur',
      token: 'Jeton',
      headerName: "Nom de l'en-tête",
      apiKey: 'Clé',
      generate: 'Générer'
    },
    variables: {
      title: 'Variables simulées ({count})',
      nameHint: 'Nom vide, en double ou invalide (lettres, chiffres, _ et -, sans espace)',
      writableHint: "Modifiable par l'API REST et les routes"
    },
    routes: {
      title: 'Routes ({count})',
      hint: 'Vérifiées dans l’ordre, après l’API des variables : la première route dont la méthode et le chemin correspondent répond. Chemin à paramètres : /api/devices/:id ; « * » en dernier segment accepte la suite.',
      anyMethod: 'Toutes',
      pathHint: 'Doit commencer par « / »',
      status: 'Code HTTP',
      contentType: 'Type de contenu',
      delay: 'Délai (ms)',
      setVariable: 'Affecter la variable',
      source: 'Valeur prise dans',
      body: 'Corps de la réponse',
      templateHint:
        'Gabarit : {{var.<nom>}}, {{params.<nom>}}, {{query.<nom>}}, {{headers.<nom>}}, {{body}}, {{body.<champ>}}, {{now}}, {{timestamp}}, {{uuid}}. Affectation : body, body.<champ>, query.<nom> ou params.<nom>.',
      headers: 'En-têtes de la réponse'
    },
    webhooks: {
      title: 'Webhooks ({count})',
      hint: 'Appels sortants en JSON : à chaque changement des variables choisies (au plus un appel toutes les « intervalle » secondes) ou périodiquement. Les certificats HTTPS ne sont pas vérifiés.',
      enabled: 'Actif',
      method: 'Méthode',
      mode: 'Déclenchement',
      modes: {
        change: 'Sur changement',
        interval: 'Périodique'
      },
      interval: 'Intervalle (s)',
      intervalHints: {
        change: 'Temps minimal entre deux appels (0 = à chaque changement)',
        interval: 'Période des appels'
      },
      variables: 'Variables',
      allVariables: 'Toutes les variables'
    },
    log: {
      title: 'Journal ({count})',
      onlyErrors: 'Erreurs seulement',
      clear: 'Vider le journal',
      empty: 'Aucune requête.',
      remote: 'Client / cible',
      method: 'Méthode',
      path: 'Chemin',
      duration: 'Durée',
      requestBody: 'Corps de la requête',
      responseBody: 'Corps de la réponse',
      directions: {
        in: 'Requête reçue',
        out: 'Webhook envoyé'
      },
      noResponse: 'sans réponse (défaut injecté)',
      forced: 'code forcé (défaut injecté)',
      unauthorized: 'authentification refusée'
    },
    headers: {
      name: 'En-tête',
      value: 'Valeur',
      add: 'En-tête'
    },
    client: {
      title: 'Configuration du client',
      baseUrl: 'Adresse de base',
      useLocal: 'Serveur local',
      useLocalHint: "Utiliser l'adresse du serveur HTTP démarré dans Sulfur",
      timeout: "Délai d'attente (ms)",
      allowInsecure: 'Accepter les certificats non vérifiés',
      secretsHint:
        'Les mots de passe, jetons et clés du client ne sont pas enregistrés : ils sont à ressaisir au prochain lancement.',
      commonHeaders: 'En-têtes communs ({count})',
      request: 'Requête',
      send: 'Envoyer',
      body: 'Corps',
      headers: 'En-têtes ({count})',
      history: 'Historique ({count})',
      noHistory: 'Aucune requête envoyée.',
      restore: 'Reprendre cette requête',
      noBodyForGet: 'Pas de corps pour une requête GET',
      responseHeaders: 'En-têtes de la réponse ({count})',
      truncated: 'réponse tronquée',
      pollEvery: 'Interroger toutes les',
      label: 'Libellé',
      watchPath: 'Chemin ou URL',
      jsonPath: 'Chemin JSON',
      writeMethod: 'Écriture',
      watch: 'Surveiller',
      watchHint:
        "Interroge l'URL en GET et publie la valeur du chemin JSON pour le simulateur et les courbes ; avec une méthode d'écriture, le simulateur peut l'écrire (corps { \"value\": … }).",
      noWatch: 'Aucune surveillance.'
    },
    units: {
      bytes: '{n} o',
      kilobytes: '{n} ko',
      megabytes: '{n} Mo'
    },
    errors: {
      invalidPort: 'Port invalide (1 à 65535)',
      portPrivileged: 'Le port {port} nécessite des droits administrateur : choisissez un port ≥ 1024',
      portInUse: 'Le port {port} est déjà utilisé',
      invalidName: 'Nom de variable invalide : « {name} »',
      unknownType: 'Type inconnu : {type}',
      variableExists: 'La variable « {name} » existe déjà',
      unknownVariable: 'Variable inconnue : {name}',
      invalidMethod: 'Méthode HTTP invalide : {method}',
      invalidPath: 'Chemin invalide : « {path} » (doit commencer par « / »)',
      invalidStatus: 'Code HTTP invalide : {status}',
      invalidUrl: 'URL invalide : « {url} »',
      userWithoutPassword: "L'utilisateur {name} n'a pas de mot de passe",
      basicNeedsUser: "L'authentification Basic demande au moins un utilisateur",
      bearerNeedsToken: "L'authentification Bearer demande un jeton",
      apiKeyNeedsKey: "L'authentification par clé d'API demande un en-tête et une clé",
      notNumber: 'Valeur non numérique : {value}',
      invalidJson: 'JSON invalide',
      tooLarge: 'Corps de requête trop volumineux',
      unauthorized: 'Authentification requise',
      notFound: 'Aucune route pour {path}',
      methodNotAllowed: 'Méthode {method} non autorisée',
      readOnly: 'La variable « {name} » est en lecture seule',
      missingValue: 'Valeur absente de la requête ({source})',
      timeout: "Pas de réponse dans le délai d'attente ({timeout} ms)",
      refused: 'Connexion refusée par {host}',
      reset: 'Connexion fermée par le serveur',
      noBaseUrl: "Indiquez l'adresse de base ou une URL complète",
      noPath: 'Indiquez un chemin ou une URL',
      pathNotFound: 'Chemin JSON introuvable dans la réponse : {path}',
      minPoll: "Période d'interrogation minimale : 100 ms",
      unknownWatch: 'Surveillance inconnue',
      watchReadOnly: "Cette surveillance n'a pas de méthode d'écriture"
    }
  }
}
