export default {
  simulator: {
    name: 'Simulateur',
    description: 'Injection de défauts et scénarios sur les serveurs et clients des autres modules',
    groups: {
      server: 'Serveur',
      client: 'Client'
    },
    faults: {
      title: 'Injection de défauts ({count})',
      hint: "Les défauts s'appliquent aux serveurs des autres modules (et à leurs points pour les valeurs figées ou les codes d'état forcés). Durée 0 = jusqu'à l'arrêt.",
      types: {
        delay: 'Délai de réponse',
        noResponse: 'Absence de réponse',
        cut: 'Coupure de connexion',
        exception: 'Exception Modbus forcée',
        badStatus: "Code d'état forcé",
        freeze: 'Valeurs figées'
      },
      typeHints: {
        delay: 'Chaque réponse est envoyée après le délai indiqué.',
        noResponse: "Les requêtes sont reçues mais jamais servies : les clients atteignent leur délai d'attente.",
        cut: 'Les connexions ouvertes sont fermées et les nouvelles refusées tant que le défaut est actif.',
        exception: "Les requêtes reçoivent le code d'exception choisi.",
        badStatus:
          "Les variables gardent leur valeur mais signalent le code d'état choisi (toutes les variables si aucune n'est choisie).",
        freeze: "La simulation des points choisis s'arrête (tous les points si aucun n'est choisi)."
      },
      scopes: {
        all: 'Toutes les requêtes',
        read: 'Lectures',
        write: 'Écritures'
      },
      module: 'Module',
      type: 'Défaut',
      settings: 'Réglages',
      delayMs: 'Délai (ms)',
      code: 'Code',
      scope: 'Requêtes',
      points: 'Points',
      allPoints: 'Tous les points',
      duration: 'Durée (s)',
      state: 'État',
      active: 'Actif',
      remaining: 'Actif · {seconds} s',
      inactive: 'Inactif',
      activate: 'Activer',
      deactivate: 'Arrêter',
      clearAll: 'Tout arrêter',
      newName: 'Défaut {n}'
    },
    scenarios: {
      title: 'Scénarios ({count})',
      hint: 'Un scénario enchaîne des étapes dans le temps : écrire une valeur, rampe, attente, activer ou arrêter un défaut. Les défauts activés par un scénario sont arrêtés à sa fin.',
      empty: 'Aucun scénario. Créez-en un, ou enregistrez les évolutions de points pour les rejouer.',
      newName: 'Scénario {n}',
      recordedName: 'Enregistrement {time}',
      loop: 'En boucle',
      play: 'Lancer',
      stop: 'Arrêter',
      steps: 'Étapes ({count})',
      addStep: 'Étape',
      running: 'Étape {step} / {count}',
      iteration: 'boucle {n}',
      record: 'Enregistrer',
      recording: 'Enregistrement… {count} changement(s)',
      stopRecording: "Arrêter l'enregistrement",
      recordPoints: 'Points à enregistrer',
      recordHint: 'Les évolutions des points choisis sont enregistrées dans un nouveau scénario.',
      duplicate: 'Dupliquer',
      moveUp: 'Monter',
      moveDown: 'Descendre',
      noPoint: 'Aucun point disponible : configurez des variables ou des points dans les modules OPC UA et Modbus.'
    },
    steps: {
      set: 'Écrire',
      ramp: 'Rampe',
      wait: 'Attendre',
      fault: 'Défaut'
    },
    step: {
      point: 'Point',
      value: 'Valeur',
      from: 'De',
      fromCurrent: 'actuelle',
      to: 'À',
      duration: 'Durée (s)',
      fault: 'Défaut',
      on: 'Activer',
      off: 'Arrêter'
    },
    errors: {
      unknownModule: 'Module inconnu : {id}',
      unsupportedFault: 'Le module {module} ne prend pas en charge ce défaut',
      unknownFault: 'Défaut inconnu',
      invalidDuration: 'Durée invalide : {value}',
      notNumeric: "Le point {point} n'a pas de valeur numérique pour la rampe",
      stepFailed: 'Étape {step} ({type}) : {message}',
      alreadyRunning: 'Un scénario est déjà en cours',
      alreadyRecording: 'Un enregistrement est déjà en cours',
      noPoints: 'Choisissez au moins un point',
      emptyScenario: "Le scénario n'a aucune étape"
    }
  }
}
