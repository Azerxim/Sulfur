export default {
  ntp: {
    name: 'NTP',
    description: 'Serveur de temps simulé (heure décalée, dérive, strate) et client NTP',
    server: {
      title: 'Configuration du serveur',
      running: 'En marche · {count} requête(s)',
      host: "Interface d'écoute",
      port: 'Port (UDP)',
      portsHint: 'Port standard : 123 — droits administrateur requis sous Linux pour les ports < 1024.'
    },
    clock: {
      title: 'Horloge simulée',
      simulated: 'Heure donnée aux clients',
      preview: 'Heure donnée au démarrage',
      real: 'Heure réelle',
      offset: 'Écart',
      frozen: 'figée (défaut injecté)',
      mode: 'Mode',
      modes: {
        offset: "Décalage de l'heure réelle",
        fixed: 'Heure fixée'
      },
      offsetSeconds: 'Décalage (s)',
      reset: 'Heure réelle',
      resetHint: 'Remettre le décalage à zéro',
      fixedTime: 'Heure de départ (heure locale)',
      apply: 'Appliquer',
      applyHint: "L'horloge repart de cette heure",
      drift: 'Dérive (ppm)',
      driftHint: 'Positif : l’horloge avance plus vite que l’heure réelle ; 1 000 ppm = 3,6 s par heure',
      jump: 'Saut d’heure :',
      shift: 'Décaler :',
      hint: "Une heure décalée permet de tester l'horodatage des équipements et la validité de leurs certificats (dates de début et de fin). Les réglages s'appliquent aussitôt au serveur en marche."
    },
    settings: {
      title: 'Annonces du serveur',
      stratum: 'Strate',
      stratum1: '1 (référence primaire)',
      stratum16: '16 (non synchronisé)',
      leap: 'Seconde intercalaire',
      refId: 'Identifiant de référence',
      refIdHint:
        'Strate 1 : source sur 4 caractères (GPS, PPS, DCF…) ; strates suivantes : adresse IPv4 du serveur amont',
      precision: 'Précision (log₂ s)',
      precisionHint: '−20 ≈ 1 µs, −10 ≈ 1 ms',
      hint: 'Valeurs annoncées dans chaque réponse. Strate 16 ou indicateur 3 : les clients considèrent le serveur comme non synchronisé.'
    },
    leap: {
      0: 'aucune',
      1: '+1 s en fin de journée',
      2: '−1 s en fin de journée',
      3: 'horloge non synchronisée'
    },
    presets: {
      '-31536000': '−1 an',
      '-86400': '−1 jour',
      '-3600': '−1 h',
      '-60': '−1 min',
      60: '+1 min',
      3600: '+1 h',
      86400: '+1 jour',
      31536000: '+1 an'
    },
    activity: {
      clients: 'Clients récents ({count})',
      address: 'Adresse',
      version: 'Version',
      requests: 'Requêtes',
      last: 'Dernière',
      noClient: 'Aucune requête reçue.',
      stopped: 'Serveur arrêté.',
      log: 'Journal',
      clear: 'Vider le journal',
      empty: 'Aucun événement.'
    },
    client: {
      title: 'Client NTP',
      host: 'Serveur (adresse IP ou nom)',
      useLocal: 'Serveur local',
      useLocalHint: 'Interroger le serveur NTP démarré dans Sulfur',
      version: 'Version',
      timeout: "Délai d'attente (ms)",
      pollInterval: 'Période (s)',
      query: 'Interroger',
      startPolling: 'Interroger en continu',
      stopPolling: 'Arrêter',
      polling: 'Interrogation toutes les {seconds} s',
      idle: 'Inactif',
      result: 'Dernier résultat · {server} · {time}',
      serverTime: 'Heure du serveur',
      offset: "Écart d'horloge",
      delay: 'Délai aller-retour',
      rootDelay: 'Délai racine',
      rootDispersion: 'Dispersion racine',
      reference: 'Dernière synchronisation',
      server: 'Serveur',
      kiss: 'Kiss-o’-Death reçu : {code} (le serveur demande de cesser ou de ralentir les interrogations)',
      history: 'Historique ({count})',
      clearHistory: "Vider l'historique",
      noHistory: 'Aucune interrogation.'
    },
    units: {
      days: '{n} j',
      hours: '{n} h',
      minutes: '{n} min',
      seconds: '{n} s'
    },
    log: {
      started: 'Serveur démarré sur {address} — heure simulée {time}',
      stopped: 'Serveur arrêté',
      clockSet: 'Horloge réglée — heure simulée {time}',
      kiss: 'Kiss-o’-Death {code} envoyé à {client} (défaut injecté)',
      socketError: 'Erreur réseau : {message}'
    },
    errors: {
      invalidPort: 'Port invalide (1 à 65535)',
      portPrivileged: 'Le port {port} nécessite des droits administrateur : choisissez un port ≥ 1024',
      portInUse: 'Le port {port} est déjà utilisé',
      invalidStratum: 'Strate invalide (1 à 16)',
      invalidLeap: 'Indicateur de seconde intercalaire invalide (0 à 3)',
      invalidRefId: "L'identifiant de référence de strate 1 compte au plus 4 caractères ASCII",
      invalidOffset: 'Décalage invalide : {value}',
      invalidTime: 'Heure invalide : {value}',
      invalidDrift: 'Dérive invalide : {value} ppm',
      shortPacket: 'Paquet trop court ({size} octets)',
      missingHost: 'Indiquez le serveur à interroger',
      invalidVersion: 'Version NTP non prise en charge (3 ou 4)',
      timeout: "Pas de réponse dans le délai d'attente ({timeout} ms)",
      unexpectedMode: 'Réponse inattendue (mode {mode})',
      minPoll: "Période d'interrogation minimale : 1 s",
      readOnlyPoint: 'Le point {id} est en lecture seule'
    }
  }
}
