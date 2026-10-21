export default {
  tftp: {
    name: 'TFTP',
    description: "Serveur TFTP simulé (firmware, configurations d'équipements) et client",
    modes: {
      octet: 'Binaire (octet)',
      netascii: 'Texte (netascii)'
    },
    errorCodes: {
      0: '0 – Erreur non définie',
      1: '1 – Fichier introuvable',
      2: '2 – Accès refusé',
      3: '3 – Disque plein'
    },
    server: {
      title: 'Configuration du serveur',
      running: 'Démarré · {count} transfert(s)',
      host: "Interface d'écoute",
      port: 'Port',
      root: 'Dossier servi',
      choose: 'Choisir…',
      pickRoot: 'Dossier servi par le serveur TFTP',
      openRoot: 'Ouvrir le dossier',
      timeout: "Délai d'attente (s)",
      retries: 'Retransmissions',
      maxBlockSize: 'Taille de bloc max.',
      allowWrite: 'Accepter les envois (WRQ)',
      allowOverwrite: 'Remplacer les fichiers existants',
      hint: "TFTP n'a pas d'authentification : tout client peut lire le dossier servi. Options prises en charge : blksize, tsize, timeout. Le port standard 69 demande les droits administrateur sous Linux.",
      counters:
        '{reads} fichier(s) envoyé(s), {writes} reçu(s), {errors} en échec · {bytesOut} octets envoyés, {bytesIn} reçus',
      transfers: 'Transferts en cours ({count})',
      noTransfer: 'Aucun transfert en cours.',
      log: 'Journal ({count})',
      clearLog: 'Effacer',
      noLog: "Aucun événement pour l'instant."
    },
    client: {
      title: 'Transfert',
      host: 'Serveur (adresse IP ou nom)',
      remoteFile: 'Fichier distant',
      mode: 'Mode',
      blockSize: 'Taille de bloc',
      tsize: 'Demander la taille du fichier (tsize)',
      get: 'Télécharger (GET)',
      put: 'Envoyer (PUT)…',
      abort: 'Interrompre',
      saveAs: 'Enregistrer le fichier téléchargé',
      hint: 'Une taille de bloc autre que 512, ou la taille du fichier, est négociée avec le serveur (RFC 2347). Un serveur qui ne gère pas les options répond par blocs de 512 octets.',
      summary:
        '{size} en {duration} ms ({rate}/s) · {blocks} bloc(s) de {blockSize} octets · {retransmissions} retransmission(s)',
      history: 'Historique ({count})',
      noHistory: "Aucun transfert pour l'instant."
    },
    log: {
      started: 'Serveur démarré sur {endpoint} — dossier {root}',
      stopped: 'Serveur arrêté',
      faultNoResponse: 'Requête pour {file} ignorée : absence de réponse simulée',
      unknownTid: "Paquet d'un identifiant de transfert inconnu ({other}) rejeté",
      sent: '{file} envoyé : {bytes} octets, {blocks} bloc(s) de {blockSize} octets, {rate} Kio/s, {retransmissions} retransmission(s)',
      received:
        '{file} reçu : {bytes} octets, {blocks} bloc(s) de {blockSize} octets, {rate} Kio/s, {retransmissions} retransmission(s)',
      timeout: 'Transfert de {file} abandonné : le client ne répond plus',
      clientError: 'Transfert de {file} interrompu par le client : {message}',
      outside: 'Accès hors du dossier servi refusé ({file})',
      refused: '{direction} {file} refusé : erreur {code} ({message})'
    },
    errors: {
      invalidPort: 'Port invalide (1 à 65535)',
      invalidTimeout: "Délai d'attente invalide (1 à 255 secondes)",
      invalidRetries: 'Nombre de retransmissions invalide (0 à 50)',
      invalidBlockSize: 'Taille de bloc invalide ({min} à {max} octets)',
      invalidRoot: "Le dossier servi n'est pas un dossier : {path}",
      portPrivileged: 'Le port {port} demande les droits administrateur : choisissez un port ≥ 1024',
      portInUse: 'Le port {port} est déjà utilisé',
      remote: 'Erreur {code} du serveur : {message}',
      timeout: 'Pas de réponse du serveur (délai dépassé)',
      missingHost: "Saisissez l'adresse du serveur",
      missingFile: 'Saisissez le nom du fichier distant',
      invalidMode: 'Mode de transfert inconnu',
      unknownHost: 'Hôte inconnu : {host}',
      busy: 'Un transfert est déjà en cours',
      unexpectedOption: 'Le serveur a accepté une option non demandée : {name}',
      badOption: "Valeur invalide de l'option {name} reçue du serveur : {value}",
      readOnlyPoint: 'Le point {id} est en lecture seule'
    }
  }
}
