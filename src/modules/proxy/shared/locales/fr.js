export default {
  proxy: {
    name: 'Proxy TCP / UDP',
    description:
      'Relais TCP / UDP entre un client et un équipement réels : journal hexadécimal et défauts sur le trafic',
    protocols: {
      tcp: 'TCP',
      udp: 'UDP'
    },
    directions: {
      both: 'Les deux sens',
      up: 'Client → équipement',
      down: 'Équipement → client'
    },
    rules: {
      title: 'Redirections ({count})',
      hint: "Le client se connecte au port local du proxy au lieu de l'équipement ; le proxy relaie tout le trafic, dans les deux sens, et peut le perturber. Les adresses se modifient redirection arrêtée, les défauts à tout moment.",
      running: '{count} démarrée(s)',
      startAll: 'Tout démarrer',
      stopAll: 'Tout arrêter',
      listen: 'Écoute',
      target: 'Équipement',
      listenHost: 'Adresse locale',
      listenPort: 'Port local',
      targetHost: 'Hôte de l’équipement',
      targetPort: 'Port de l’équipement',
      protocol: 'Protocole',
      empty: 'Aucune redirection. Ajoutez-en une pour relayer le trafic vers un équipement.',
      traffic: '↑ {up} · ↓ {down}',
      trafficHint: 'Octets relayés : client → équipement (↑) et équipement → client (↓)',
      connections: '{count} connexion(s)',
      sessions: '{count} session(s)',
      faults: 'Défauts',
      activeFaults: '{count} défaut(s) actif(s)'
    },
    faults: {
      title: 'Défauts sur le trafic',
      latency: 'Latence (ms)',
      jitter: 'Gigue (ms)',
      jitterHint: 'Retard aléatoire ajouté entre 0 et cette valeur ; l’ordre des envois est conservé.',
      loss: 'Perte (%)',
      lossTcp: 'UDP seulement : en TCP, une perte rendrait le flux incohérent.',
      corrupt: 'Altération (%)',
      corruptHint: 'Part des envois dont un bit d’un octet pris au hasard est inversé.',
      direction: 'Sens concerné',
      block: 'Bloquer le trafic',
      blockHint: 'Données ignorées ; dans les deux sens, les nouvelles connexions sont aussi refusées.',
      cut: 'Couper les connexions',
      cutHint: 'Ferme aussitôt toutes les connexions en cours (sessions UDP comprises).',
      reset: 'Aucun défaut',
      simulator: 'Défauts du simulateur actifs sur toutes les redirections : {types}',
      simulatorTypes: {
        delay: 'retard',
        noResponse: 'absence de réponse',
        cut: 'coupure'
      }
    },
    connections: {
      title: 'Connexions ({count})',
      none: 'Aucune connexion en cours.',
      client: 'Client',
      since: 'Depuis',
      traffic: 'Trafic'
    },
    log: {
      title: 'Journal ({count})',
      empty: 'Aucun échange. Les données relayées, les connexions et les erreurs s’affichent ici.',
      allRules: 'Toutes les redirections',
      capture: 'Enregistrer les données',
      captureHint: 'Décoché : seuls les connexions, coupures et erreurs sont enregistrés (trafic important).',
      timestamps: 'Heure',
      pause: 'Figer l’affichage',
      resume: 'Reprendre l’affichage',
      paused: 'Affichage figé',
      export: 'Exporter le journal',
      exportTitle: 'Exporter le journal du proxy',
      exportFilter: 'Journal',
      exported: 'Journal exporté dans {file}',
      clear: 'Effacer le journal',
      truncated: '{shown} dernières entrées affichées sur {count}',
      views: {
        both: 'Hexadécimal et texte',
        hex: 'Hexadécimal',
        text: 'Texte'
      },
      dirs: {
        up: 'Client → équipement',
        down: 'Équipement → client'
      },
      faults: {
        blocked: 'bloqué',
        lost: 'perdu',
        corrupted: 'altéré'
      },
      delay: '+{ms} ms',
      partial: '{shown} octets sur {size} conservés',
      started: 'Redirection démarrée : {endpoint} → {target}',
      stopped: 'Redirection arrêtée ({endpoint})',
      error: 'Erreur : {message}',
      refused: 'Connexion de {remote} refusée (trafic bloqué)',
      connected: 'Connexion de {remote}, relayée vers {target}',
      closed: 'Connexion de {remote} fermée par {by} (↑ {up} o, ↓ {down} o)',
      by: {
        client: 'le client',
        target: 'l’équipement',
        idle: 'inactivité',
        cut: 'une coupure',
        stop: 'l’arrêt'
      },
      targetRefused: 'Connexion de {remote} : {target} refuse la connexion',
      targetError: 'Équipement {target} : {message}',
      udpSession: 'Session UDP de {remote}, relayée vers {target}',
      cut: 'Connexions coupées ({count})',
      simulatorCut: 'Connexions coupées par le simulateur'
    },
    errors: {
      invalidProtocol: 'Protocole invalide (TCP ou UDP)',
      invalidListenPort: 'Port local invalide (1 à 65535)',
      invalidTargetPort: 'Port de l’équipement invalide (1 à 65535)',
      missingTarget: 'Indiquez l’hôte de l’équipement',
      loop: 'La redirection pointe vers son propre port local',
      invalidDelay: 'Latence et gigue : de 0 à {max} ms',
      invalidPercent: 'Perte et altération : de 0 à 100 %',
      invalidDirection: 'Sens invalide',
      alreadyRunning: 'La redirection « {name} » est déjà démarrée',
      stopToChange: 'Arrêtez la redirection pour changer ses adresses',
      portInUse: 'Le port {port} est déjà utilisé sur {host}',
      portPrivileged: 'Le port {port} nécessite des droits administrateur : choisissez un port au-delà de 1023',
      addressUnavailable: 'L’adresse {host} n’existe pas sur ce PC',
      readOnlyPoint: 'Le point {id} est en lecture seule'
    }
  }
}
