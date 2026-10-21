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

- [X] **Sauvegarde des configurations** : aujourd'hui, les réglages des serveurs et des clients sont
  perdus à la fermeture. Les enregistrer par module et les restaurer au démarrage.
- [X] **Import / export** des configurations en JSON, pour partager un banc de test.
- [X] **Tests automatisés dans le dépôt** : tests OPC UA, Modbus et traductions avec Vitest
  (`npm test`).
- [X] **Intégration continue** (GitHub Actions) : build, tests et lint à chaque pull
  request, installeurs à chaque tag de version.
- [X] **Lint et formatage** : ESLint + Prettier avec une configuration commune.
- [X] **Packaging** : icône de l'application, installeurs Windows (NSIS), Linux (AppImage, .deb) et
  macOS (DMG) produits par la CI.
- [X] **Mises à jour** : nouvelles versions détectées depuis les releases GitHub, téléchargées et
  installées depuis les paramètres (Windows, AppImage, .deb ; sous macOS, lien vers la release).
  Recherche automatique désactivable.

## Fonctions de simulation

Rendre les simulateurs plus utiles pour tester des équipements et logiciels réels.

- [X] **Injection de défauts** : délais de réponse, coupures de connexion, exceptions forcées (Modbus) ou
  codes d'état d'erreur (OPC UA), pour tester le comportement des clients en cas de problème.
- [X] **Scénarios** : enchaîner des évolutions de valeurs dans le temps (scriptées ou enregistrées) et
  les rejouer (module Simulateur, comme l'injection de défauts).
- [X] **Flux de nœuds** à la manière de Node-RED : éditeur graphique, flux déployés qui tournent en
  continu (déclencheurs, points, rampes, défauts, logique, fonction JavaScript, générateurs,
  débogage) ; remplacent les scénarios, convertis automatiquement.
- [X] **Courbes et enregistrement** : graphiques des valeurs surveillées, export CSV (module Courbes).
- [X] **OPC UA** : tableaux et types structurés, méthodes, événements et alarmes, lecture d'historique,
  import d'espace d'adressage (NodeSet2 XML).
- [X] **Modbus** : explorateur de registres côté serveur, plusieurs Unit ID sur un même serveur
  (simulation de passerelle), identification de l'équipement (fonction 43 / 14), lecture/écriture
  multiple (fonction 23).

## Éditions standard et premium

Sulfur est distribué sous [licence Apache 2.0](LICENSE). L'application et les modules **standard**
restent gratuits et open source dans ce dépôt ; les modules **premium**, marqués *(premium)* dans
cette roadmap, seront développés dans un dépôt privé et distribués à part sous licence commerciale.
Les modules sans marque sont standard.

| Édition                                  | Modules                                                                                                         |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Standard** (gratuite, Apache-2.0) | OPC UA, Modbus (TCP, RTU, ASCII), HTTP / REST, NTP, MQTT, SNMP, Syslog, DNS, LDAP / RADIUS, FTP / SFTP, TFTP, Proxy TCP / UDP, DHCP, CoAP / LwM2M, Siemens S7, PLCSim Advanced, Autorité de certification, Explorateur réseau, Terminal série, Simulateur, Courbes |
| **Premium** (licence commerciale)   | Siemens S7 Enhanced, Sparkplug B, EtherNet/IP (CIP), BACnet/IP, OPC UA PubSub, Mitsubishi MC / SLMP, Omron FINS, Beckhoff ADS, KNX/IP, PROFINET DCP, IEC 60870-5-104, DNP3, IEC 61850, DLMS/COSEM, M-Bus, PTP |

Les modules déjà publiés sous Apache-2.0 restent standard. Structure à mettre en place avant le
premier module premium :

- [X] **Licence** : Apache-2.0 pour l'application et les modules standard, [CLA](CLA.md) des
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

## Nouveaux modules : outils

Outils transverses qui servent à tous les modules et facilitent la mise en place d'un banc de test.

- [X] **Autorité de certification** : autorités racines et intermédiaires (ECDSA, RSA), import
  d'une autorité existante, émission par profil (serveur / client TLS, application OPC UA,
  Modbus/TCP Security avec rôle), signature de CSR, révocation et CRL, export PEM / DER / chaîne /
  PKCS#12, sans passer par OpenSSL
  - [ ] installation directe des certificats émis dans les magasins des modules de Sulfur
- [X] **Explorateur réseau** : cibles limitées aux réseaux privés (10.0.0.0/8, 172.16.0.0/12,
  192.168.0.0/16) : adresses, réseaux CIDR, plages et noms d'hôte vérifiés, réseaux privés du PC
  proposés. La recherche et l'identification des équipements viendront plus tard (voir
  [Plus tard](#plus-tard)).
- [X] **Terminal série** : liaisons RS-232 / RS-485 (tous les réglages de ligne, lignes de contrôle
  DTR / RTS / CTS / DSR / DCD, BREAK), envoi en texte ou en hexadécimal (en continu au besoin), journal
  hexadécimal avec découpage des trames et export, passerelle série ↔ TCP brute (serveur TCP), points
  de données pour le simulateur
  - [ ] passerelle RFC 2217 (réglages de ligne changés par le client TCP) et mode client TCP

## Nouveaux modules : informatique et supervision

Protocoles plus simples, rapides à livrer, utiles pour superviser et intégrer des équipements.

- [X] **MQTT** : broker et client, TLS, simulation de topics
- [ ] **Sparkplug B** *(premium)* : au-dessus du module MQTT
- [X] **SNMP** : agent et manager, v1 / v2c / v3 (authentification et chiffrement USM), MIB simulée
  et traps
- [X] **Syslog** : serveur et émetteur, UDP / TCP / TLS
- [X] **HTTP / REST** : serveur simulé et client (JSON, webhooks, HTTPS, authentification)
- [X] **NTP** : serveur de temps simulé, y compris une heure volontairement décalée pour tester
  l'horodatage et la validité des certificats sur les équipements
- [ ] **Proxy TCP / UDP** : relais placé entre un client et un équipement réels (plusieurs
  redirections port local → hôte:port distant), journal des échanges en hexadécimal et export, et
  injection de défauts sur le trafic (latence, perte de paquets, coupures, altération de trames)
  pour tester des équipements sans les modifier
- [X] **DNS** : serveur faisant autorité (zone locale, jokers, PTR automatiques, relais vers des
  serveurs amont, UDP et TCP) et client
- [X] **DHCP** : serveur de test pour un réseau isolé, limité aux réseaux privés (10.0.0.0/8,
  172.16.0.0/12, 192.168.0.0/16) : interface choisie explicitement dont le sous-réseau est privé,
  plage contrôlée par rapport à ce sous-réseau, avertissement confirmé avant chaque démarrage, liste
  facultative d'adresses MAC autorisées, fichier journal de toutes les offres et attributions ;
  client d'essai (DISCOVER, bail, RELEASE)
  - [ ] réservations fixes (adresse MAC → adresse IP)
  - [ ] requêtes transmises par un relais DHCP (giaddr), pour les réseaux de test derrière un routeur
- [X] **TFTP / FTP / SFTP** : serveur de fichiers pour les mises à jour de firmware et les
  sauvegardes de configuration des équipements réseau et des automates
  - [X] **SFTP** : serveur (dossier confiné, mot de passe et clés publiques, lecture seule, clé
    d'hôte Ed25519) et client (parcours, transferts, empreinte épinglée)
  - [X] **TFTP** : serveur (options blksize, tsize et timeout, modes octet et netascii, envois
    autorisés ou non) et client (GET / PUT, progression, retransmissions)
  - [X] **FTP / FTPS** (même module que SFTP) : serveur (FTPS explicite et implicite, modes passif et actif, reprise,
    connexion anonyme en lecture seule) et client (parcours, transferts, dialogue de commandes)
- [X] **RADIUS / LDAP** : serveur d'authentification simulé, pour tester la connexion centralisée
  des switchs, pare-feux et IHM
  - [X] **LDAP / LDAPS** : annuaire LDIF en lecture seule (liaison, recherche, StartTLS, LDAPS,
    memberOf) et client
  - [X] **RADIUS** (même module que LDAP) : serveur (clients NAS avec secret partagé, PAP et CHAP
    pour les comptes locaux et ceux de l'annuaire LDAP, attributs de réponse dont Cisco-AVPair,
    Message-Authenticator, accounting, Status-Server) et client (Access-Request, Status-Server,
    accounting)
    - [ ] EAP (PEAP / EAP-TLS, 802.1X), MS-CHAPv2, attributs de réponse par groupe LDAP, RadSec (RADIUS sur TLS)
- [ ] **CoAP / LwM2M** : serveur et client pour capteurs IoT contraints, en complément de MQTT

## Nouveaux modules : automatismes industriels

- [X] **Modbus RTU / ASCII** : transports ajoutés au module Modbus : RTU et ASCII sur liaison série
  (esclave et maître, Unit ID 1 à 247, écritures en diffusion) et RTU over TCP
- [X] **Siemens S7** (S7comm) : automate simulé (mémoire I / Q / M / DB, points simulés,
  identification, RUN / STOP) et client (rack / emplacement ou TSAP, lecture / écriture typées,
  surveillance)
- [X] **Siemens PLCSim Advanced** : piloter des automates virtuels S7-1500 (création et démarrage
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
- [ ] **Mitsubishi MC / SLMP** et **Omron FINS** *(premium)* : automates Mitsubishi MELSEC et Omron
- [ ] **Beckhoff ADS** *(premium)* : automates TwinCAT, accès symbolique aux variables
- [ ] **KNX/IP** *(premium)* : gestion technique du bâtiment, en complément de BACnet/IP
- [ ] **PROFINET DCP** *(premium)* : découverte, nommage et adressage des équipements (sans
  l'échange cyclique temps réel, qui nécessite un pilote dédié)

## Nouveaux modules : énergie, comptage et transport

- [ ] **IEC 60870-5-104** et **DNP3** *(premium)* : téléconduite
- [ ] **IEC 61850** (MMS, GOOSE) *(premium)* : postes électriques ; nécessite une bibliothèque native (libiec61850)
- [ ] **DLMS/COSEM** (IEC 62056) et **M-Bus** *(premium)* : relève des compteurs d'énergie et d'eau
- [ ] **PTP** (IEEE 1588) *(premium)* : synchronisation précise de l'heure, en complément de NTP
  (utilisée dans les postes IEC 61850) ; précision limitée sans horodatage matériel

Chaque nouveau module suit le contrat existant (main / renderer / shared, ses propres traductions) ;
les modules premium utilisent le SDK de module et sont distribués en paquets signés.
L'ordre au sein de chaque version sera fixé selon les besoins.

## Plus tard

- **Explorateur réseau : recherche et identification** : trouver les équipements des cibles et les
  identifier en réutilisant les modules existants (Modbus 43 / 14, identification S7, OPC UA
  FindServers, SNMP `sysDescr`), toujours dans les seuls réseaux privés.
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

## Limites connues

- Les champs numériques utilisent le séparateur décimal du système, quelle que soit la langue de
  l'interface.
- Le code de l'interface est volumineux (≈ 2,1 Mo) et n'a pas encore été optimisé.
- Le broker MQTT ne gère pas les abonnements partagés (`$share/…`) ni l'authentification étendue de
  MQTT 5.0 (paquet AUTH).
- DHCP : Node.js ne permet pas de lier un socket à une interface (`SO_BINDTODEVICE`). Sous Linux et
  macOS, les requêtes diffusées sur les autres interfaces parviennent au serveur et à son journal ;
  ses réponses ne partent que par l'interface choisie. Le filtre MAC limite cet effet sur un PC
  relié à plusieurs réseaux. Les ports 67 / 68 demandent les droits administrateur (ou la capacité
  `CAP_NET_BIND_SERVICE`) sous Linux. Non testé sous macOS.
