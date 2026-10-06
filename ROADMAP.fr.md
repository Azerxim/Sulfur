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
- [ ] **Packaging** : icône de l'application, installeurs Windows (NSIS) et Linux (AppImage) produits
  par la CI.

## Fonctions de simulation

Rendre les simulateurs plus utiles pour tester des équipements et logiciels réels.

- [ ] **Injection de défauts** : délais de réponse, coupures de connexion, exceptions forcées (Modbus) ou
  codes d'état d'erreur (OPC UA), pour tester le comportement des clients en cas de problème.
- [ ] **Scénarios** : enchaîner des évolutions de valeurs dans le temps (scriptées ou enregistrées) et
  les rejouer.
- [ ] **Courbes et enregistrement** : graphiques des valeurs surveillées, export CSV.
- [ ] **OPC UA** : tableaux et types structurés, méthodes, événements et alarmes, lecture d'historique,
  import d'espace d'adressage (NodeSet2 XML).
- [ ] **Modbus** : explorateur de registres côté serveur, plusieurs Unit ID sur un même serveur
  (simulation de passerelle), identification de l'équipement (fonction 43 / 14), lecture/écriture
  multiple (fonction 23).

## Nouveaux modules : informatique et supervision

Protocoles plus simples, rapides à livrer, utiles pour superviser et intégrer des équipements.

- [ ] **MQTT** : broker et client, TLS, simulation de topics ; **Sparkplug B** au-dessus de MQTT
- [ ] **SNMP** : agent et manager, v1 / v2c / v3 (authentification et chiffrement USM), MIB simulée
  et traps
- [ ] **Syslog** : serveur et émetteur, UDP / TCP / TLS
- [ ] **HTTP / REST** : serveur simulé et client (JSON, webhooks, HTTPS, authentification)
- [ ] **NTP** : serveur de temps simulé, y compris une heure volontairement décalée pour tester
  l'horodatage et la validité des certificats sur les équipements

## Nouveaux modules : automatismes industriels

- [ ] **Siemens S7** (S7comm)
- [ ] **EtherNet/IP (CIP)** : automates Rockwell / Allen-Bradley
- [ ] **BACnet/IP** : gestion technique du bâtiment (CVC, éclairage)
- [ ] **OPC UA PubSub** : mode publication / abonnement d'OPC UA, en extension du module OPC UA

## Nouveaux modules : énergie et transport

- [ ] **IEC 60870-5-104** et **DNP3** : téléconduite
- [ ] **IEC 61850** (MMS, GOOSE) : postes électriques ; nécessite une bibliothèque native (libiec61850)

Chaque nouveau module suit le contrat existant (main / renderer / shared, ses propres traductions).
L'ordre au sein de chaque version sera fixé selon les besoins.

## Plus tard

- **Liens entre modules** : relier une variable d'un module à un autre (par exemple une variable
  OPC UA recopiée dans un registre Modbus) pour simuler une passerelle ou une installation complète.
- **Renforcement de la sécurité** :
  - activer le sandbox de l'interface ;
  - chiffrer les configurations enregistrées qui contiennent des secrets ;
  - valider les certificats auprès d'une autorité de certification, avec listes de révocation, en
    plus de l'épinglage ;
  - jetons utilisateur X.509 pour OPC UA.
- **Interface** : plusieurs fenêtres, raccourcis clavier, revue d'accessibilité, nouvelles langues.
- **Mises à jour** : mise à jour automatique de l'application.

## Limites connues

- Appliquer une simulation numérique (sinus, rampe…) à une variable OPC UA de type `String` échoue.
- Les champs numériques utilisent le séparateur décimal du système, quelle que soit la langue de
  l'interface.
- Au tout premier lancement après avoir choisi le thème clair dans une version antérieure, la fenêtre
  peut s'ouvrir une fois en sombre.
- Le code de l'interface est volumineux (≈ 830 ko) et n'a pas encore été optimisé.
