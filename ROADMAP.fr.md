# Roadmap de Sulfur

[English](ROADMAP.md) · **Français**

Orientation prévue pour Sulfur, par ordre de priorité. Les versions regroupent le travail par thème,
sans date fixée. Plus un élément est bas dans la liste, moins il est certain et plus il peut changer.

## Initialisation

- [X] Socle modulaire Electron + React + TailwindCSS : modules en deux parties, process principal (IPC)
  et interface
- [X] Module **OPC UA** : serveur simulé (variables modifiables en marche) et client (navigation,
  lecture / écriture, abonnements) ; modes et politiques de sécurité, utilisateurs avec mots de
  passe hachés, magasins de certificats avec approbation
- [X] Module **Modbus TCP** : serveur (quatre tables, points simulés typés) et client (décodage,
  scrutation) ; Modbus/TCP Security (TLS mutuel, autorisation par rôle), liste blanche d'adresses IP,
  limitation de débit, mode lecture seule, journal de sécurité
- [X] Page Informations (adresses IP, système), page Paramètres
- [X] Anglais (par défaut) et français, thèmes clair et sombre, sections réductibles

## Stabilisation

Fiabiliser l'existant avant d'ajouter des fonctionnalités.

- [x] **Sauvegarde des configurations** : aujourd'hui, les réglages des serveurs et des clients sont
  perdus à la fermeture. Les enregistrer par module et les restaurer au démarrage.
- [x] **Import / export** des configurations en JSON, pour partager un banc de test.
- [x] **Tests automatisés dans le dépôt** : tests OPC UA, Modbus et traductions avec Vitest
  (`npm test`).
- [x] **Intégration continue** (GitHub Actions) : build, tests et lint à chaque push.
- [x] **Lint et formatage** : ESLint + Prettier avec une configuration commune.
- [x] **Packaging** : icône de l'application, installeurs Windows (NSIS) et Linux (AppImage) produits
  par la CI.

## Fonctions de simulation

Rendre les simulateurs plus utiles pour tester des équipements et logiciels réels.

- [x] **Injection de défauts** : délais de réponse, coupures de connexion, exceptions forcées (Modbus) ou
  codes d'état d'erreur (OPC UA), pour tester le comportement des clients en cas de problème.
- [x] **Scénarios** : enchaîner des évolutions de valeurs dans le temps (scriptées ou enregistrées) et
  les rejouer (module Simulateur, comme l'injection de défauts).
- [x] **Flux de nœuds** à la manière de Node-RED : éditeur graphique, flux déployés qui tournent en
  continu (déclencheurs, points, rampes, défauts, logique, fonction JavaScript, générateurs,
  débogage) ; remplacent les scénarios, convertis automatiquement.
- [x] **Courbes et enregistrement** : graphiques des valeurs surveillées, export CSV (module Courbes).
- [x] **OPC UA** : tableaux et types structurés, méthodes, événements et alarmes, lecture d'historique,
  import d'espace d'adressage (NodeSet2 XML).
- [x] **Modbus** : explorateur de registres côté serveur, plusieurs Unit ID sur un même serveur
  (simulation de passerelle), identification de l'équipement (fonction 43 / 14), lecture/écriture
  multiple (fonction 23).

## Éditions standard et premium

Sulfur est distribué sous [licence Apache 2.0](LICENSE). L'application et les modules **standard**
restent gratuits et open source dans ce dépôt ; les modules **premium**, marqués *(premium)* dans
cette roadmap, seront développés dans un dépôt privé et distribués à part sous licence commerciale.
Les modules sans marque sont standard.

| Édition | Modules |
| --- | --- |
| **Standard** (gratuite, Apache-2.0) | OPC UA, Modbus TCP, HTTP / REST, NTP, MQTT, SNMP, Syslog, Siemens S7, PLCSim Advanced, Simulateur, Courbes |
| **Premium** (licence commerciale) | Siemens S7 Enhanced, Sparkplug B, EtherNet/IP (CIP), BACnet/IP, OPC UA PubSub, IEC 60870-5-104, DNP3, IEC 61850 |

Les modules déjà publiés sous Apache-2.0 restent standard. Structure à mettre en place avant le
premier module premium :

- [x] **Licence** : Apache-2.0 pour l'application et les modules standard, [CLA](CLA.md) des
  contributeurs signé à la première pull request (pour que les contributions puissent aussi servir
  dans l'édition premium).
- [ ] **Manifeste de module** : identifiant, version, édition (`standard` / `premium`), version de
  l'API de module requise et version minimale de Sulfur ; un module incompatible est refusé avec un
  message clair.
- [ ] **SDK de module** : publier le contrat de module (`ctx.handle` / `emit` / `expose` / `peers`,
  `src/shared/points.js`, outils de traduction, composants d'interface communs) sous forme de paquet
  versionné, pour développer les modules premium hors de ce dépôt. L'API de module suit le
  versionnage sémantique.
- [ ] **Modules externes** : `src/main/modules.js` et `src/renderer/src/modules.js` deviennent un
  registre alimenté par les modules intégrés et par les paquets de modules installés dans le dossier
  des données utilisateur. L'interface d'un module externe est chargée dynamiquement (protocole
  dédié) et partage React et les composants d'interface via le SDK au lieu de les embarquer à
  nouveau.
- [ ] **Paquets de modules** : archives signées (Ed25519), signature vérifiée avant le chargement :
  seuls les modules signés par l'éditeur sont chargés, puisqu'un module s'exécute avec les droits
  du process principal. Installation, mise à jour et suppression des modules depuis une page
  *Modules* des Paramètres.
- [ ] **Licences** : fichier de licence signé, vérifié hors ligne avec une clé publique intégrée à
  l'application (titulaire, date d'expiration, modules premium couverts) ; page *Licence* dans les
  Paramètres. Sans licence valide, un module premium est listé mais verrouillé.
- [ ] **Configurations** : à l'import, les sections d'un module premium non installé ou sans licence
  sont conservées et signalées (elles sont ignorées aujourd'hui).
- [ ] **Dépôt premium** : dépôt privé avec sa propre CI (build avec le SDK, tests, signature des
  paquets), contrat de licence utilisateur final (EULA), publication des paquets en même temps que
  les installeurs de l'application.

## Nouveaux modules : informatique et supervision

Protocoles plus simples, rapides à livrer, utiles pour superviser et intégrer des équipements.

- [x] **MQTT** : broker et client, TLS, simulation de topics
- [ ] **Sparkplug B** *(premium)* : au-dessus du module MQTT
- [x] **SNMP** : agent et manager, v1 / v2c / v3 (authentification et chiffrement USM), MIB simulée
  et traps
- [x] **Syslog** : serveur et émetteur, UDP / TCP / TLS
- [x] **HTTP / REST** : serveur simulé et client (JSON, webhooks, HTTPS, authentification)
- [x] **NTP** : serveur de temps simulé, y compris une heure volontairement décalée pour tester
  l'horodatage et la validité des certificats sur les équipements

## Nouveaux modules : automatismes industriels

- [x] **Siemens S7** (S7comm) : automate simulé (mémoire I / Q / M / DB, points simulés,
  identification, RUN / STOP) et client (rack / emplacement ou TSAP, lecture / écriture typées,
  surveillance)
- [x] **Siemens PLCSim Advanced** : piloter des automates virtuels S7-1500 (création et démarrage
  d'instances, lecture / écriture des variables, points publiés pour le simulateur et les courbes).
  Disponible sous Windows uniquement : PLCSim Advanced doit être installé et l'utilisateur indique
  le chemin de ses DLL (API Simulation Runtime) dans les réglages du module.
- [ ] **Siemens S7 Enhanced** *(premium)* : protocole S7CommPlus des S7-1200 / S7-1500 (firmware
  V4 et suivants) : accès symbolique aux blocs de données optimisés (sans activer PUT / GET),
  navigation dans les variables de l'automate, communication sécurisée (TLS) des firmwares récents ;
  en extension du module Siemens S7
- [ ] **EtherNet/IP (CIP)** *(premium)* : automates Rockwell / Allen-Bradley
- [ ] **BACnet/IP** *(premium)* : gestion technique du bâtiment (CVC, éclairage)
- [ ] **OPC UA PubSub** *(premium)* : mode publication / abonnement d'OPC UA, en extension du module OPC UA

## Nouveaux modules : énergie et transport

- [ ] **IEC 60870-5-104** et **DNP3** *(premium)* : téléconduite
- [ ] **IEC 61850** (MMS, GOOSE) *(premium)* : postes électriques ; nécessite une bibliothèque native (libiec61850)

Chaque nouveau module suit le contrat existant (main / renderer / shared, ses propres traductions) ;
les modules premium utilisent le SDK de module et sont distribués en paquets signés.
L'ordre au sein de chaque version sera fixé selon les besoins.

## Plus tard

- **Liens entre modules** : relier une variable d'un module à un autre (par exemple une variable
  OPC UA recopiée dans un registre Modbus) pour simuler une passerelle ou une installation complète.
  Déjà possible avec un flux du simulateur (*Changement de point* → *Écrire un point*) ; reste à
  proposer un lien direct, sans flux.
- **Renforcement de la sécurité** :
  - activer le sandbox de l'interface ;
  - chiffrer les configurations enregistrées qui contiennent des secrets ;
  - valider les certificats auprès d'une autorité de certification, avec listes de révocation, en
    plus de l'épinglage ;
  - jetons utilisateur X.509 pour OPC UA.
- **Interface** : plusieurs fenêtres, raccourcis clavier, revue d'accessibilité, nouvelles langues.
- **Mises à jour** : mise à jour automatique de l'application.

## Limites connues

- Les champs numériques utilisent le séparateur décimal du système, quelle que soit la langue de
  l'interface.
- Au tout premier lancement après avoir choisi le thème clair dans une version antérieure, la fenêtre
  peut s'ouvrir une fois en sombre.
- Le code de l'interface est volumineux (≈ 2,1 Mo) et n'a pas encore été optimisé.
- Le broker MQTT n'accepte que les clients MQTT 3.1 et 3.1.1 (MQTT 5.0 n'est pas pris en charge par
  aedes) ; le client MQTT prend en charge la 5.0.
- L'agent SNMP envoie ses notifications en SNMPv1 et SNMPv2c uniquement (pas de notification SNMPv3).
