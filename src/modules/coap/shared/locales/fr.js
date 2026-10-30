export default {
  coap: {
    name: 'CoAP / LwM2M',
    description: 'Serveur et client CoAP (observation, découverte), serveur LwM2M et appareil LwM2M simulé',
    tabs: {
      server: 'Serveur CoAP',
      client: 'Client CoAP',
      lwm2mServer: 'Serveur LwM2M',
      device: 'Appareil LwM2M'
    },
    address: 'Adresse d’écoute',
    host: 'Hôte',
    port: 'Port (UDP)',
    since: 'Depuis',
    log: {
      title: 'Journal ({count})',
      clear: 'Effacer le journal',
      empty: 'Aucun échange.'
    },
    server: {
      title: 'Serveur CoAP simulé',
      hint: 'Ressources lues par GET, modifiées par PUT si elles l’autorisent, observées (RFC 7641) et annoncées par /.well-known/core. CoAP sur UDP, sans DTLS.',
      running: 'En marche · {requests} requête(s) · {observers} observateur(s)',
      resources: 'Ressources simulées ({count})',
      path: 'Chemin',
      resourceTitle: 'Titre',
      format: 'Format',
      observable: 'Observable',
      writable: 'Modifiable',
      interval: 'Notif. (ms)',
      intervalHint: 'Notifications des observateurs au plus toutes les N ms (0 : à chaque changement)',
      observers: 'Observateurs ({count})',
      observer: 'Client',
      notifications: 'Notifications',
      noObserver: 'Aucun client n’observe une ressource.',
      observe: {
        register: 'observation',
        cancel: 'fin d’observation'
      },
      faults: {
        noResponse: 'sans réponse (défaut)',
        exception: 'code forcé (défaut)'
      },
      log: {
        started: 'Serveur démarré sur {endpoint}',
        stopped: 'Serveur arrêté',
        observerGone: {
          reset: '{remote} n’observe plus {path} (RST)',
          timeout: '{remote} ne répond plus : observation de {path} arrêtée'
        }
      }
    },
    client: {
      title: 'Requête CoAP',
      method: 'Méthode',
      query: 'Paramètres (Uri-Query)',
      accept: 'Format demandé (Accept)',
      noAccept: 'Aucun',
      format: 'Format du contenu',
      timeout: 'Délai (s)',
      confirmable: 'Confirmable (CON)',
      useServer: 'Serveur de Sulfur (port {port})',
      payload: 'Contenu',
      send: 'Envoyer',
      observe: 'Observer',
      observeHint: 'GET avec l’option Observe : les notifications suivantes s’ajoutent à l’historique',
      discover: 'Découvrir',
      discoverHint: 'Ressources annoncées par /.well-known/core',
      links: 'Ressources découvertes ({count})',
      useLink: 'Utiliser ce chemin',
      observableLink: 'observable',
      noLink: 'Aucune ressource annoncée.',
      observations: 'Observations ({count})',
      notifications: '{count} notification(s) depuis {since}',
      cancel: 'Arrêter',
      history: 'Échanges ({count})',
      notification: 'NOTIFICATION',
      notObservable: 'ressource non observable : réponse unique',
      empty: 'Aucun échange. Envoyez une requête, observez ou découvrez les ressources d’un serveur.',
      errors: {
        timeout: 'Pas de réponse de {uri} en {timeout} s',
        reset: '{uri} a refusé le message (RST)'
      }
    },
    lwm2m: {
      title: 'Serveur LwM2M',
      hint: 'Les appareils s’enregistrent (POST /rd), mettent leur enregistrement à jour avant son expiration et se désenregistrent. Opérations sur un appareil enregistré : lecture, écriture, exécution, découverte, observation.',
      running: 'En marche · {count} appareil(s) enregistré(s)',
      devices: 'Appareils enregistrés ({count})',
      registration: 'LwM2M {version} · liaison {binding} · durée {lifetime} s · mis à jour à {time}',
      operations: 'Opérations',
      noDevice:
        'Aucun appareil enregistré. Configurez un appareil LwM2M vers ce serveur (port {port}), par exemple l’appareil simulé de l’onglet voisin.',
      valuesCount: '{count} valeur(s)',
      path: 'Chemin (objet / instance / ressource)',
      invalidPath: 'Chemin invalide : /objet[/instance[/ressource]]',
      format: 'Format de lecture',
      value: 'Valeur ou arguments',
      ops: {
        read: 'Lire',
        discover: 'Découvrir',
        observe: 'Observer',
        write: 'Écrire',
        execute: 'Exécuter',
        notify: 'Notification'
      },
      log: {
        started: 'Serveur LwM2M démarré sur {endpoint}',
        stopped: 'Serveur LwM2M arrêté',
        registered: '{endpoint} enregistré depuis {remote} (durée {lifetime} s)',
        updated: '{endpoint} : enregistrement mis à jour',
        deregistered: '{endpoint} désenregistré',
        expired: '{endpoint} : enregistrement expiré (pas de mise à jour)'
      },
      errors: {
        unknownDevice: 'Appareil inconnu ou plus enregistré',
        invalidPath: 'Chemin LwM2M invalide : {path}',
        writeResource: 'L’écriture porte sur une ressource : /objet/instance/ressource',
        executeResource: 'L’exécution porte sur une ressource : /objet/instance/ressource',
        invalidValue: 'Valeur invalide pour cette ressource : {value}',
        timeout: '{endpoint} ne répond pas',
        reset: '{endpoint} a refusé la requête (RST)'
      }
    },
    device: {
      title: 'Appareil LwM2M simulé',
      hint: 'Objets Device (3), Temperature (3303) et Light Control (3311), instance 0 : lecture en texte, TLV ou SenML JSON, écriture, exécution (redémarrage, remise à zéro du min / max), observation. Enregistrement mis à jour avant son expiration ; nouvel essai toutes les 30 s en cas d’échec.',
      endpoint: 'Nom de l’appareil (endpoint)',
      serverHost: 'Serveur LwM2M',
      serverPort: 'Port du serveur',
      lifetime: 'Durée (s)',
      useServer: 'Serveur de Sulfur (port {port})',
      manufacturer: 'Fabricant',
      model: 'Modèle',
      serial: 'Numéro de série',
      objects: {
        temperature: 'Temperature (3303)',
        light: 'Light Control (3311)'
      },
      temperature: {
        min: 'Température min',
        max: 'Température max',
        period: 'Période (ms)'
      },
      update: 'Mettre à jour',
      updateHint: 'Mise à jour immédiate de l’enregistrement (POST sur son emplacement)',
      states: {
        stopped: 'Arrêté',
        registering: 'Enregistrement auprès de {server}…',
        registered: 'Enregistré auprès de {server}',
        error: 'Non enregistré'
      },
      resources: 'Ressources ({count})',
      observed: 'observée',
      log: {
        started: 'Appareil {endpoint} démarré',
        registered: 'Enregistré auprès de {server} ({location})',
        updated: 'Enregistrement mis à jour',
        deregistered: 'Désenregistré',
        failed: 'Enregistrement impossible : {message} ; nouvel essai dans {delay} s',
        observed: 'Le serveur observe {path} ({label})',
        observerGone: 'Le serveur n’observe plus {path}',
        written: '{label} = {value} (écriture du serveur)',
        executed: 'Exécution : {label}'
      },
      errors: {
        invalidEndpoint: 'Nom d’appareil invalide (sans espace, &, ? ni /)',
        invalidLifetime: 'Durée invalide (10 à 86400 s)',
        running: 'L’appareil est déjà démarré',
        refused: 'Le serveur a refusé l’enregistrement ({code})',
        noServer: 'Pas de réponse de {server}',
        unknownResource: 'Ressource inconnue : {path}'
      }
    },
    errors: {
      invalidBoolean: 'Valeur booléenne invalide : {value}',
      invalidPath: 'Chemin invalide : {path}',
      reservedPath: 'Le chemin /.well-known est réservé à la découverte',
      duplicatePath: 'Chemin en double : {path}',
      invalidType: 'Type invalide',
      invalidFormat: 'Format invalide',
      invalidSimulation: 'Simulation invalide',
      invalidInterval: 'Intervalle de notification invalide',
      invalidJson: 'Contenu JSON invalide',
      serverRunning: 'Le serveur est déjà démarré',
      serverStopped: 'Démarrez le serveur pour modifier une valeur',
      invalidPort: 'Port invalide (1 à 65535)',
      portInUse: 'Le port UDP {port} est déjà utilisé',
      portPrivileged: 'Le port {port} nécessite des droits administrateur : choisissez un port au-delà de 1023',
      addressUnavailable: 'Cette adresse n’existe pas sur ce PC',
      missingHost: 'Indiquez l’hôte',
      invalidMethod: 'Méthode invalide',
      invalidTimeout: 'Délai invalide (1 à 300 s)',
      invalidHex: 'Contenu hexadécimal invalide',
      readOnlyPoint: 'Le point {id} est en lecture seule'
    }
  }
}
