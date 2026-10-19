export default {
  plcsim: {
    name: 'PLCSim Advanced',
    description: 'Automates virtuels S7-1500 de S7-PLCSIM Advanced (Windows)',
    windowsOnly:
      "S7-PLCSIM Advanced ne fonctionne que sous Windows : son API est une bibliothèque Windows native (.NET Framework et C++), que Linux et macOS ne peuvent pas charger, même avec les DLL. Ce module n'est donc pas disponible sur ce système. Le module Siemens S7 peut joindre une instance PLCSim Advanced d'un autre PC par le réseau (PUT/GET).",
    tabs: {
      config: 'Configuration',
      variables: 'Variables'
    },
    connection: {
      title: 'API Simulation Runtime',
      connected: 'Connecté · API {version}',
      loading: "Chargement de l'API…",
      apiPath: "Dossier de l'API ou DLL (Siemens.Simatic.Simulation.Runtime.Api)",
      auto: 'Automatique : version la plus récente dans {path}',
      autoConnect: 'Se connecter au démarrage de Sulfur',
      mode: 'Runtime Manager',
      modes: {
        local: 'Ce PC',
        remote: 'PC distant'
      },
      remoteHost: 'PC distant (adresse IP ou nom)',
      remotePort: 'Port',
      remoteComputer: 'PC distant',
      remoteVersion: 'Runtime Manager {version}',
      remoteHint:
        'Sur le PC distant, ouvrez le port du Runtime Manager dans le panneau de contrôle de PLCSIM Advanced (« Runtime Manager Port », {port} par défaut) et autorisez-le dans son pare-feu. Les instances listées et pilotées sont alors celles du PC distant.',
      noApi:
        "S7-PLCSIM Advanced n'est pas installé sur ce PC : indiquez le dossier qui contient les DLL de l'API (Siemens.Simatic.Simulation.Runtime.Api.x64.dll), copiées depuis le dossier API d'un PC où il est installé ({path}\\<version>). Utilisez la même version que le PC distant.",
      dll: 'DLL',
      runtime: 'Runtime Manager',
      runtimeAvailable: 'Disponible',
      runtimeMissing: 'Indisponible : démarrez S7-PLCSIM Advanced (ou son Runtime Manager)',
      networkMode: 'Mode réseau',
      storage: 'Stockage des instances',
      hint: "S7-PLCSIM Advanced doit être installé avec une licence valide. L'API est chargée par Windows PowerShell 5.1 (.NET Framework), lancé en arrière-plan.",
      softbusHint:
        'En mode Softbus, les instances ne sont joignables que par TIA Portal sur ce PC. Pour les joindre avec le client Siemens S7 (PUT/GET), passez PLCSIM Advanced en mode TCP/IP dans son panneau de contrôle.'
    },
    networkModes: {
      Softbus: 'Softbus (local)',
      TCPIPSingleAdapter: 'TCP/IP (une carte réseau)',
      TCPIPMultipleAdapter: 'TCP/IP (plusieurs cartes réseau)',
      UnknownState: 'Inconnu'
    },
    instances: {
      title: 'Instances ({count})',
      notConnected: "Connectez-vous à l'API pour lister les automates virtuels.",
      cpu: 'CPU',
      ip: 'Adresses IP',
      actions: 'Actions',
      confirm: 'Confirmer ?',
      none: 'Aucune instance enregistrée. Créez-en une ci-dessous, puis chargez-y un projet depuis TIA Portal.',
      newName: 'Nouvelle instance',
      cpuType: 'Type de CPU',
      create: 'Créer',
      hint: "Une nouvelle instance est vide : une fois sous tension, chargez-y le programme depuis TIA Portal (interface PLCSIM Advanced). Cliquez sur une ligne pour choisir l'instance dont les variables sont affichées ci-dessous.",
      ipTitle: 'Adresse IP de {name}',
      interface: 'Interface',
      address: 'Adresse IP',
      mask: 'Masque de sous-réseau',
      gateway: 'Passerelle',
      ipNeedsPower: "Mettez d'abord l'instance sous tension",
      applyIp: 'Appliquer'
    },
    states: {
      Off: 'Hors tension',
      Booting: 'Démarrage',
      Stop: 'STOP',
      Startup: 'Mise en route',
      Run: 'RUN',
      Freeze: 'Figée',
      ShuttingDown: 'Arrêt en cours',
      Hold: 'Attente',
      InvalidOperatingState: 'État invalide'
    },
    operations: {
      powerOn: 'Mettre sous tension',
      powerOff: 'Mettre hors tension',
      run: 'RUN',
      stop: 'STOP',
      memoryReset: 'Effacement général',
      unregister: 'Supprimer'
    },
    variables: {
      title: 'Variables de {name}',
      titleNone: 'Variables',
      noInstance: 'Choisissez une instance sous tension pour lire ses variables.',
      address: 'Adresse (entrées, sorties, mémentos)',
      label: 'Libellé',
      labelPlaceholder: 'Facultatif',
      watch: 'Surveiller',
      addressHint:
        "Écrire les entrées (I) de l'automate virtuel simule le procédé. Les blocs de données sont accessibles par le nom de leurs variables, depuis la table des variables.",
      load: 'Lire la table des variables',
      reload: 'Relire la table des variables',
      hmiOnly: 'Uniquement les variables accessibles depuis IHM',
      filter: 'Filtrer par nom',
      needsPower: "La table des variables se lit une fois l'instance sous tension.",
      location: 'Emplacement',
      truncated: '{count} premières variables sur {total} : affinez le filtre.',
      empty: "Aucune variable : chargez un programme depuis TIA Portal dans l'instance."
    },
    watches: {
      pollEvery: 'Lire toutes les',
      instance: 'Instance',
      variable: 'Variable',
      none: "Aucune variable surveillée. Ajoutez-en depuis les variables d'une instance.",
      hint: 'Les variables surveillées sont publiées comme points pour le simulateur (flux) et les courbes ; elles sont conservées au redémarrage de Sulfur.'
    },
    runtimeErrors: {
      IsEmpty: "Aucun programme chargé : chargez d'abord un projet depuis TIA Portal dans l'instance",
      NotUpToDate: "La table des variables n'est pas à jour",
      DoesNotExist: "Cette variable n'existe pas dans la table des variables",
      IndexOutOfRange: "Adresse en dehors de la mémoire de l'instance",
      TypeMismatch: 'Le type ne correspond pas à la variable',
      SignalTypeMismatch: 'Le type ne correspond pas à la variable',
      LicenseNotFound: 'Aucune licence S7-PLCSIM Advanced trouvée',
      NoLicenseAvailable: 'Aucune licence S7-PLCSIM Advanced disponible',
      WarningTrialModeActive: "Mode d'essai actif (pas de licence)",
      RuntimeNotAvailable: 'Runtime Manager indisponible : démarrez S7-PLCSIM Advanced',
      InstanceNotRunning: "L'instance n'est pas sous tension",
      NotRunning: "L'instance n'est pas sous tension",
      InvalidOperatingState: "Opération impossible dans l'état actuel de l'instance",
      AlreadyExists: 'Une instance de ce nom existe déjà',
      LimitReached: "Nombre maximal d'instances atteint",
      NotAllowed: 'Opération non autorisée',
      AccessDenied: 'Accès refusé',
      Timeout: "L'opération ne s'est pas terminée à temps",
      InterfaceRemoved: "L'instance n'existe plus",
      WrongArgument: 'Argument invalide',
      ApiNotInitialized: 'API non initialisée',
      StoragePathAlreadyInUse: 'Le dossier de stockage est déjà utilisé par une autre instance',
      AnotherVariantOfPlcsimRunning: 'Une autre variante de PLCSIM est en cours d’exécution',
      NotSupported: 'Non pris en charge par cette instance',
      ConnectionError: 'pas de Runtime Manager joignable à cette adresse et ce port'
    },
    errors: {
      windowsOnly: "S7-PLCSIM Advanced n'est disponible que sous Windows",
      apiNotFound:
        'API Simulation Runtime introuvable dans {path} : installez S7-PLCSIM Advanced, ou indiquez le dossier qui contient ses DLL (Siemens.Simatic.Simulation.Runtime.Api.x64.dll)',
      missingHost: "Indiquez l'adresse IP ou le nom du PC distant",
      invalidPort: 'Port invalide : {value}',
      unknownHost: 'PC distant introuvable : {host}',
      remoteConnect:
        "Connexion au Runtime Manager de {target} impossible : {message}. Vérifiez que son port est ouvert dans le panneau de contrôle de PLCSIM Advanced et que le pare-feu l'autorise.",
      remoteLost: 'Connexion au Runtime Manager de {target} perdue',
      pathNotFound: 'Chemin introuvable : {path}',
      startTimeout: "L'API n'a pas répondu en 60 s",
      apiLoad: "Échec du chargement de l'API : {message}",
      spawn: 'Impossible de lancer Windows PowerShell : {message}',
      bridgeExited: "La liaison avec l'API s'est arrêtée (code {code}) : {detail}",
      notConnected: "Non connecté à l'API",
      callTimeout: "Pas de réponse de l'API à « {method} » après {timeout} ms",
      unknownInstance: 'Instance inconnue : {name}',
      instanceOff: "L'instance {name} est hors tension",
      emptyName: "Indiquez un nom pour l'instance",
      duplicateName: 'Une instance nommée {name} existe déjà',
      unknownOperation: 'Opération inconnue : {operation}',
      invalidIp: '{field} invalide : {value}',
      noInstance: 'Choisissez une instance',
      emptyTag: 'Indiquez le nom de la variable',
      areaOnly: '{address} : seules les entrées (I), sorties (Q) et mémentos (M) sont accessibles par adresse',
      minPoll: 'Intervalle minimal : 100 ms',
      unknownWatch: 'Variable surveillée inconnue'
    }
  }
}
