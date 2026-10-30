/** Textes communs de l'application (français, langue de référence). */
export default {
  app: {
    tagline: 'Simulateur modulaire',
    groups: {
      tools: 'Outils',
      automation: 'Automatismes industriels',
      it: 'Informatique et supervision'
    },
    noModule: 'Aucun module chargé',
    moduleError: "Cette page n'a pas pu être affichée.",
    resetModuleConfig: 'Rétablir la configuration par défaut du module',
    retry: 'Réessayer',
    updateAvailable: 'Mise à jour disponible : v{version}',
    updateReady: 'Mise à jour prête : v{version}',
    search: 'Rechercher…',
    searchPlaceholder: 'Aller à un module ou une page…',
    noResult: 'Aucun résultat pour « {query} »',
    paletteKeys: {
      navigate: 'naviguer',
      open: 'ouvrir',
      close: 'fermer'
    },
    activity: {
      sessions: 'En marche · {count} session(s)',
      running: 'En marche',
      client: 'Client connecté',
      active: 'Actif',
      stopped: 'Arrêté'
    },
    statusBar: {
      active: '{count} module(s) actif(s)',
      sessions: '{count} session(s)'
    }
  },
  errors: {
    externalBusy: 'Arrêtez les serveurs et clients de ces modules avant d’actualiser les modules externes : {modules}',
    modulePackage: 'Paquet de module refusé : {problem}',
    packageExpired: 'Ce paquet n’est plus en attente d’installation : choisissez-le à nouveau.',
    packageNotFound: 'Aucun paquet installé pour le module « {id} »',
    modulesBusy: 'Arrêtez les serveurs et clients de ces modules avant de les désactiver : {modules}',
    config: {
      notJson: "Le fichier n'est pas un JSON valide",
      notSulfur: "Le fichier n'est pas une configuration Sulfur",
      unsupportedVersion:
        "La version {version} du format de configuration n'est pas prise en charge par cette version de Sulfur",
      noModule: 'Le fichier ne contient aucune configuration pour les modules de cette version de Sulfur',
      busy: "Arrêtez les serveurs et déconnectez les clients avant d'importer une configuration"
    }
  },
  modules: {
    problems: {
      invalid: 'manifeste invalide : champ « {field} » absent ou incorrect',
      reservedId: 'l’identifiant « {id} » est réservé par Sulfur',
      duplicateId: 'un autre module utilise déjà l’identifiant « {id} »',
      apiMajor: 'écrit pour l’API des modules {required}, incompatible avec l’API {current} de cette version de Sulfur',
      apiTooNew:
        'demande l’API des modules {required} ; cette version de Sulfur fournit la {current} : mettre Sulfur à jour',
      appTooOld: 'demande Sulfur {required} ou plus récent (version actuelle : {current}) : mettre Sulfur à jour',
      unreadable: 'paquet illisible : {file} absent ou invalide ({message})',
      mismatch: 'le code du paquet ne correspond pas à son module.json ({file})',
      loadFailed: 'le code du module n’a pas pu être chargé : {message}',
      activateFailed: 'le module n’a pas pu démarrer : {message}',
      rendererFailed: 'l’interface du module n’a pas pu être chargée : {message}',
      archive: 'archive invalide : {message}',
      missingFile: 'fichier « {file} » absent du paquet'
    }
  },
  home: {
    name: 'Accueil',
    description: 'Présentation de Sulfur et de ses modules',
    headline: 'Simulateur modulaire de protocoles industriels et informatiques',
    intro:
      "Sulfur simule les serveurs et les clients des protocoles de l'automatisme et de la supervision : OPC UA, Modbus, Siemens S7, MQTT, SNMP, HTTP, NTP, Syslog… Testez des équipements, des logiciels de supervision et des intégrations sans l'installation réelle, et reproduisez les pannes à la demande.",
    steps: {
      start: {
        title: 'Démarrer un module',
        text: 'Choisissez un protocole, démarrez son serveur simulé ou connectez son client à un équipement réel.'
      },
      simulate: {
        title: 'Simuler',
        text: 'Injectez des défauts (délai, coupure, codes d’erreur) et créez des flux de nœuds qui pilotent les valeurs.'
      },
      record: {
        title: 'Enregistrer',
        text: 'Suivez les valeurs de tous les modules sur des courbes et exportez-les en CSV.'
      },
      save: {
        title: 'Enregistrer et partager',
        text: 'Les réglages sont enregistrés automatiquement ; exportez-les en JSON pour partager un banc de test.'
      }
    },
    groups: {
      tools: 'Travaillent sur les points de données de tous les modules de protocole.',
      automation: 'Protocoles industriels et automates.',
      it: 'Services réseau, messagerie et supervision.'
    },
    stats: {
      active: 'Modules actifs',
      activeOf: 'sur {count}',
      sessions: 'Sessions clientes',
      sessionsHint: 'Clients connectés aux serveurs simulés',
      available: 'Modules disponibles',
      availableHint: '{count} groupe(s)'
    },
    activeTitle: 'Modules actifs',
    activeEmpty: 'Aucun serveur ni client en marche. Démarrez un module : il apparaîtra ici avec son point d’accès.',
    columns: {
      module: 'Module',
      endpoint: 'Point d’accès',
      activity: 'Activité'
    },
    open: 'Ouvrir {name}',
    allModules: 'Tous les modules',
    license: 'Licence Apache 2.0 — © 2026 Maxime MALLET',
    repository: 'Code source et documentation'
  },
  info: {
    name: 'Informations',
    description: 'Adresses IP et informations système du PC',
    system: 'Système',
    hostname: 'Nom du PC',
    os: "Système d'exploitation",
    appVersion: 'Version de Sulfur',
    runtime: 'Electron / Node',
    ips: 'Adresses IP du PC',
    noIp: 'Aucune adresse IPv4 externe (PC hors réseau ?)',
    interfaces: 'Interfaces réseau',
    showInternal: 'Afficher les interfaces internes',
    internal: 'interne'
  },
  settings: {
    name: 'Paramètres',
    description: 'Langue, apparence, modules, configurations et mises à jour',
    tabs: {
      general: 'Général',
      modules: 'Modules',
      updates: 'Mises à jour'
    },
    language: 'Langue',
    languageHint: "S'applique à toute l'interface ainsi qu'aux messages des serveurs et clients.",
    theme: 'Thème',
    themeHint: "Par défaut, le thème suit le réglage du système d'exploitation.",
    startPage: 'Page de démarrage',
    startPageHint:
      'Page affichée au lancement de Sulfur. Chaque module retient aussi son dernier onglet (serveur ou client).',
    lastPage: 'Dernière page affichée',
    modules: 'Modules',
    moduleSwitch: {
      title: 'Modules activés',
      hint: "Un module désactivé est masqué de la barre latérale et de l'accueil, arrêté, et n'est plus chargé au démarrage. Ses réglages sont conservés. Arrêtez ses serveurs et clients avant de le désactiver.",
      summary: '{enabled} module(s) activé(s) sur {total}',
      enableAll: 'Tout activer',
      disableAll: 'Tout désactiver',
      additional: 'Additionnel',
      external: 'Externe',
      rejected: 'Modules non chargés ({count})',
      api: 'API des modules {version}'
    },
    externalModules: {
      title: 'Modules externes',
      hint: 'Modules développés hors de Sulfur avec son SDK, y compris les vôtres. Installez un paquet (fichier .sulfur-module) avec Installer un paquet, ou copiez son dossier dans le dossier des paquets. Pris en compte au prochain démarrage de Sulfur, ou aussitôt avec Actualiser.',
      enable: 'Charger les modules externes',
      warning:
        'Les paquets ne sont pas signés : un module externe s’exécute avec les droits de Sulfur. N’installez que vos propres modules ou ceux d’une source de confiance.',
      folder: 'Dossier des paquets :',
      open: 'Ouvrir',
      loaded: '{count} module(s) externe(s) chargé(s)',
      reload: 'Actualiser',
      reloadHint:
        'Relire les paquets (ajoutés, mis à jour ou retirés) sans redémarrer Sulfur ; l’interface est rechargée',
      reloadNeeded: 'Actualisez les modules externes pour appliquer ce choix.',
      install: 'Installer un paquet…',
      installTitle: 'Installer un paquet de module',
      packageFiles: 'Paquet de module Sulfur',
      installed: 'Paquets installés',
      none: 'Aucun paquet installé.',
      notLoaded: 'non chargé',
      unknownAuthor: 'auteur non indiqué',
      by: 'par {author}',
      remove: 'Supprimer',
      confirmRemove: 'Supprimer {name}',
      cancel: 'Annuler',
      installedOk: '{name} {version} installé. Cochez Charger les modules externes, puis Actualiser, pour l’utiliser.',
      removedOk: '{name} supprimé.',
      confirm: {
        title: 'Installer {name} ?',
        id: 'Identifiant',
        version: 'Version',
        author: 'Auteur',
        content: 'Contenu',
        files: '{count} fichier(s), {size}',
        current: 'Version installée',
        warning:
          'Ce paquet n’est pas signé et Sulfur ne peut pas vérifier sa provenance. Une fois chargé, son code s’exécute avec les droits de Sulfur (fichiers, réseau). Ne l’installez que si vous l’avez écrit vous-même ou si vous faites confiance à son auteur.',
        install: 'Installer',
        update: 'Mettre à jour vers la {version}',
        replace: 'Remplacer la version {version}'
      }
    },
    pages: 'Application',
    themes: {
      dark: 'Sombre',
      light: 'Clair',
      system: 'Système'
    },
    themeDescriptions: {
      dark: 'Interface sombre',
      light: 'Interface claire',
      system: "Suit le réglage du système d'exploitation (par défaut)"
    },
    configurations: {
      title: 'Configurations',
      hint: 'Les réglages des modules sont enregistrés automatiquement. Exportez-les dans un fichier JSON pour partager un banc de test, ou importez-en un (serveurs arrêtés et clients déconnectés).',
      export: 'Exporter…',
      import: 'Importer…',
      exportTitle: 'Exporter la configuration de Sulfur',
      importTitle: 'Importer une configuration Sulfur',
      exported: 'Configuration exportée dans {path}',
      imported: 'Configuration importée depuis {path}',
      exportedKept: 'Le fichier contient aussi les configurations conservées des modules non installés : {modules}',
      kept: 'Configurations conservées pour les modules non installés, appliquées quand ils seront installés et chargés : {modules}',
      ignored: 'Sections ignorées (identifiant invalide ou réservé, contenu incorrect) : {modules}'
    },
    updates: {
      title: 'Mises à jour',
      hint: 'Les nouvelles versions sont publiées sous forme de releases GitHub.',
      autoCheck: 'Rechercher automatiquement les mises à jour',
      autoCheckHint: 'Au démarrage, puis toutes les 6 heures.',
      current: 'Version installée : v{version}',
      unsupported: "Les mises à jour ne sont disponibles que dans l'application installée.",
      check: 'Rechercher maintenant',
      checking: 'Recherche des mises à jour…',
      upToDate: 'Sulfur est à jour (dernière vérification : {time}).',
      available: 'La version {version} est disponible.',
      download: 'Télécharger et installer',
      openDownload: 'Ouvrir la page de téléchargement',
      macHint: "Sous macOS, téléchargez la nouvelle version depuis la page de la release et remplacez l'application.",
      releaseNotes: 'Notes de version',
      downloading: 'Téléchargement… {progress} %',
      downloaded: 'La version {version} est prête à être installée.',
      downloadedHint: 'Sinon, elle sera installée à la fermeture de Sulfur.',
      install: 'Redémarrer et installer',
      notes: {
        title: 'Notes de version',
        refresh: 'Actualiser',
        loading: 'Lecture des releases GitHub…',
        empty: 'Aucune release publiée.',
        installed: 'Installée',
        newer: 'Nouvelle',
        github: 'Ouvrir la release sur GitHub',
        unreachable: 'Les releases GitHub n’ont pas pu être lues : {message}',
        rateLimited: 'GitHub limite temporairement les requêtes : réessayez plus tard.'
      }
    }
  }
}
