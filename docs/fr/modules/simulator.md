# Module Simulateur

[Documentation](../README.md) · [Tous les modules](../README.md#modules) · [English](../../en/modules/simulator.md) · **Français**

Agit sur les serveurs et clients des autres modules par les points qu'ils publient.

- **Injection de défauts** : délai de réponse, absence de réponse, coupure de connexion (connexions
  ouvertes fermées, nouvelles refusées), exception Modbus ou code de retour S7 forcés (toutes les requêtes,
  lectures ou écritures), code d'état OPC UA forcé (BadSensorFailure, BadCommunicationError…) et valeurs figées
  sur les points choisis. Un défaut s'active à la main ou par un flux, jusqu'à son arrêt ou pour
  une durée donnée ; modifier un défaut actif l'applique aussitôt.
- **Flux** (à la manière de Node-RED) : des nœuds reliés par des fils se transmettent des messages
  (`msg.payload`), édités sur un canevas (glisser depuis la palette, relier une sortie à une entrée,
  Suppr efface la sélection). **Déployer** envoie tous les flux au process principal, où ils
  tournent en continu ; les flux déployés sont relancés au démarrage, **Arrêter** / **Relancer** les
  suspendent. Un flux peut être désactivé. Nœuds :
  - déclencheurs : *Déclencheur* (à la main, au déploiement et/ou toutes les n secondes),
    *Changement de point* ;
  - points : *Lire un point*, *Écrire un point* (`msg.payload` ou valeur fixe) ;
  - temps et défauts : *Attendre*, *Rampe* (linéaire, depuis la valeur actuelle ou une valeur
    donnée), *Défaut* (activer / arrêter un défaut de la table, ou selon `msg.payload`) ; les défauts
    activés par les flux sont arrêtés au redéploiement ;
  - logique : *Aiguillage* (une sortie par règle : =, ≠, <, ≤, >, ≥, entre, vrai, faux, sinon),
    *Mise à l'échelle*, *Compteur*, *Filtre de changement* (avec bande morte) ;
  - *Fonction* : JavaScript exécuté pour chaque message dans un contexte isolé (`vm`), limité à 1 s,
    avec `msg`, `node`, `context`, `flow` et `global` ; une ou plusieurs sorties ;
  - *Générateur* : valeurs sinus, rampe, aléatoire ou bascule, mis en pause / relancé par un message ;
  - *Débogage* : messages affichés dans l'onglet Débogage, avec les avertissements et erreurs des nœuds.
  Chaque nœud affiche son statut en dessous (dernière valeur, messages en attente, erreur). Relier un
  *Changement de point* d'un module à un *Écrire un point* d'un autre simule une passerelle entre
  protocoles.
- **Enregistrement** : les évolutions des points choisis (serveurs ou valeurs surveillées par les
  clients) sont enregistrées dans un nouveau flux (écritures et attentes), modifiable et rejouable.
- Les scénarios enregistrés par une version antérieure (ou présents dans une configuration importée)
  sont convertis en flux : un déclencheur manuel suivi d'un nœud par étape, rebouclé pour un scénario
  en boucle.
