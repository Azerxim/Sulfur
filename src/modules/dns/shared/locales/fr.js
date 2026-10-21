export default {
  dns: {
    name: 'DNS',
    description: 'Serveur DNS simulé (zone locale, relais) et client de résolution',
    server: {
      title: 'Configuration du serveur',
      running: 'En marche · {count} requête(s)',
      host: "Interface d'écoute",
      port: 'Port',
      domain: 'Domaine de la zone',
      ttl: 'TTL par défaut (s)',
      tcp: 'Écouter aussi en TCP',
      autoPtr: 'Enregistrements inverses (PTR) déduits des A / AAAA',
      forward: 'Relayer les autres noms',
      upstreams: 'Serveurs amont (adresse[:port], séparés par des virgules)',
      hint: 'Le serveur fait autorité sur le domaine de la zone (NXDOMAIN pour un nom inconnu de la zone). Les autres noms sont relayés vers les serveurs amont, ou refusés (REFUSED) si le relais est désactivé. Le port standard 53 nécessite des droits administrateur sous Linux.',
      counters: '{answered} répondue(s) · {nxdomain} NXDOMAIN · {forwarded} relayée(s) · {refused} refusée(s)'
    },
    records: {
      title: 'Enregistrements de la zone ({count})',
      hint: 'Les noms relatifs sont rattachés à {domain} ; @ désigne le domaine, un nom terminé par un point est absolu, *.nom est un joker. Valeurs : MX « 10 mail », SRV « priorité poids port cible ».',
      fqdn: 'Nom complet'
    },
    queries: {
      title: 'Requêtes reçues ({count})',
      clear: 'Effacer',
      client: 'Client',
      name: 'Nom',
      rcode: 'Réponse',
      answers: 'Réponses',
      forwarded: 'relayée',
      none: 'Aucune requête reçue pour le moment.'
    },
    client: {
      title: 'Requête',
      server: 'Serveur DNS',
      name: 'Nom ou adresse',
      timeout: "Délai d'attente (ms)",
      query: 'Interroger',
      tcp: 'TCP',
      recursion: 'Récursion demandée (RD)',
      ptrHint: 'PTR : saisissez une adresse IP, elle est convertie en nom inverse.',
      result: 'Réponse',
      summary: '{server} · {transport} · {duration} ms · {size} octets',
      truncated: 'réponse UDP tronquée, renvoyée en TCP',
      answers: 'Réponses',
      authorities: 'Autorité',
      additionals: 'Additionnelles',
      noData: "Le nom existe mais n'a pas d'enregistrement de ce type.",
      history: 'Historique ({count})',
      noHistory: 'Aucune requête envoyée pour le moment.'
    },
    errors: {
      invalidName: 'Nom invalide : {value}',
      invalidValue: 'Valeur invalide : {value}',
      invalidTarget: 'Nom cible invalide : {value}',
      invalidIPv4: 'Adresse IPv4 invalide : {value}',
      invalidIPv6: 'Adresse IPv6 invalide : {value}',
      invalidMx: 'MX : « préférence nom » attendu ({value})',
      invalidSrv: 'SRV : « priorité poids port cible » attendu ({value})',
      emptyTxt: 'Texte vide',
      unknownType: "Type d'enregistrement inconnu : {type}",
      badRecord: 'Enregistrement {name} {type} : {problem}',
      invalidTtl: 'TTL invalide pour {name}',
      invalidUpstream: 'Serveur amont invalide : {value}',
      noUpstream: 'Saisissez au moins un serveur amont, ou désactivez le relais',
      invalidPort: 'Port invalide (1 à 65535)',
      portPrivileged: 'Le port {port} nécessite des droits administrateur : choisissez un port ≥ 1024',
      portInUse: 'Le port {port} est déjà utilisé',
      invalidServer: "Saisissez l'adresse IP du serveur DNS",
      missingName: 'Saisissez le nom à résoudre',
      timeout: 'Aucune réponse en {timeout} ms',
      tcpRefused: 'Connexion TCP refusée par {server}:{port}',
      readOnlyPoint: 'Le point {id} est en lecture seule'
    }
  }
}
