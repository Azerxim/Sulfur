export default {
  trends: {
    name: 'Courbes',
    description: 'Courbes des valeurs des autres modules, enregistrement et export CSV',
    groups: {
      server: 'Serveur',
      client: 'Client',
      plc: 'Automate'
    },
    chart: {
      title: 'Courbes',
      empty: "Choisissez des points puis lancez l'enregistrement.",
      waiting: 'En attente des premiers échantillons…',
      windows: {
        60000: '1 min',
        300000: '5 min',
        900000: '15 min',
        3600000: '1 h',
        0: 'Tout'
      },
      window: 'Fenêtre',
      layout: 'Affichage',
      shared: 'Un graphique, un axe',
      split: 'Un graphique par point',
      hint: 'Glissez horizontalement pour zoomer. Des points aux échelles très différentes se lisent mieux avec un graphique par point.',
      follow: 'Suivre',
      paused: 'En pause (zoom) : cliquez sur Suivre pour reprendre',
      time: 'Heure'
    },
    recording: {
      start: 'Enregistrer',
      stop: 'Arrêter',
      clear: 'Effacer',
      export: 'Exporter en CSV',
      interval: "Période d'échantillonnage (ms)",
      decimal: 'Séparateur décimal du CSV',
      decimalPoint: 'Point (1.5)',
      decimalComma: 'Virgule (1,5)',
      running: 'Enregistrement · {count} échantillon(s)',
      stopped: '{count} échantillon(s)',
      exported: 'Exporté dans {file}',
      limit: 'Les {count} derniers échantillons sont conservés.'
    },
    series: {
      title: 'Points ({count})',
      add: 'Ajouter un point',
      tooMany: '{count} points au maximum',
      point: 'Point',
      atCursor: 'Au curseur',
      none: 'Aucun point disponible : configurez des variables ou des points dans les modules OPC UA et Modbus, ou surveillez des valeurs avec leurs clients.',
      hide: 'Masquer',
      show: 'Afficher',
      remove: 'Retirer',
      last: 'Dernière valeur',
      min: 'Min',
      max: 'Max',
      unavailable: 'indisponible'
    },
    errors: {
      minInterval: 'Période minimale : {min} ms',
      noSeries: 'Choisissez au moins un point',
      alreadyRecording: "L'enregistrement est déjà en cours",
      noData: 'Aucun échantillon à exporter'
    }
  }
}
