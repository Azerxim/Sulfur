# Sulfur

[![CI](https://github.com/Azerxim/Sulfur/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Azerxim/Sulfur/actions/workflows/ci.yml?query=branch%3Amain)
[![Release](https://img.shields.io/github/v/release/Azerxim/Sulfur)](https://github.com/Azerxim/Sulfur/releases/latest)

[English](README.md) · **Français**

Application de simulateur modulaire — Electron + React (JavaScript) + TailwindCSS v4.
Interface en anglais (par défaut) et en français, thème clair ou sombre (celui du système par défaut).
Voir la [roadmap](ROADMAP.fr.md) pour la suite. Licence : [Apache-2.0](LICENSE).

## Démarrage

```bash
npm install
npm run dev        # lancement en développement (HMR)
npm run build      # build de production dans out/
npm run dist       # packaging (electron-builder) dans dist/
npm test           # tests automatisés (Vitest)
npm run lint       # analyse statique (ESLint)
npm run format     # mise en forme (Prettier)
```

## Tests

Le dossier `tests/` contient des tests d'intégration exécutés contre de vrais serveurs et clients
(sockets, TLS, certificats) et des tests unitaires : sécurité, modification à chaud, tableaux et structures, méthodes, alarmes et événements, historique et import NodeSet2 OPC UA, Modbus TCP,
Modbus/TCP Security, RTU et ASCII (trames, RTU over TCP, liaison série, diffusion), HTTP / REST (API, routes, authentification, HTTPS, webhooks), NTP (paquets, horloge simulée, client), Siemens S7 (adresses, codec, serveur et client, découpage selon la PDU, défauts), PLCSim Advanced (protocole du pont, gestionnaire), MQTT (topics et jokers, broker et client, authentification, TLS, défauts), SNMP (v1 / v2c / v3, Get / GetNext / GetBulk / Walk / Set, surveillance, traps et informs, défauts), Syslog (RFC 5424 et 3164, délimitation TCP, UDP / TCP / TLS, défauts), injection de défauts, flux de nœuds et enregistrement de courbes sur les deux protocoles, protocole et encodage des valeurs, configurations enregistrées et fichiers d'import / export, traductions (mêmes clés et paramètres dans
chaque langue, toute clé utilisée dans le code existe). Chaque test utilise un port libre et un magasin
de certificats temporaire.

```bash
npm test             # exécution unique
npm run test:watch   # relance à chaque modification
```

## Lint et formatage

- **ESLint** (`eslint.config.mjs`) : règles JavaScript recommandées, variables globales Node / navigateur
  selon le process, règles des hooks React (`rules-of-hooks`, `exhaustive-deps`) pour l'interface.
- **Prettier** (`.prettierrc.json`) : sans point-virgule, guillemets simples, 120 colonnes. Les règles de
  mise en forme sont laissées à Prettier (`eslint-config-prettier`). Les fichiers Markdown ne sont pas
  reformatés.

```bash
npm run lint           # signale les problèmes
npm run format         # met en forme tous les fichiers
npm run format:check   # vérifie la mise en forme sans modifier (CI)
```

VS Code : les extensions recommandées (ESLint, Prettier) sont listées dans `.vscode/extensions.json`.

## Intégration continue

GitHub Actions (`.github/workflows/ci.yml`) s'exécute à chaque push et pull request : `npm ci`, lint,
vérification de la mise en forme, tests et build, sous Ubuntu avec Node 24. Mêmes vérifications en local
avant de pousser :

```bash
npm run lint && npm run format:check && npm test && npm run build
```

## Packaging

```bash
npm run dist:linux   # AppImage et .deb → dist/Sulfur-<version>-x86_64.AppImage, dist/Sulfur_<version>_amd64.deb
npm run dist:win     # installeur NSIS → dist/Sulfur-Setup-<version>.exe (sous Windows)
npm run dist:mac     # DMG → dist/Sulfur-<version>-x64.dmg et dist/Sulfur-<version>-arm64.dmg (sous macOS)
```

- Configuration dans `electron-builder.yml`. Icône de l'application : `resources/icon.png` (1024 px,
  Linux, icône de fenêtre, convertie en .icns pour macOS) et `resources/icon.ico` (Windows). `resources/` est embarqué avec
  l'application ; `build/` est réservé aux ressources propres au packaging, comme `build/icons/`
  (icône Linux à chaque taille standard, générée depuis `resources/icon.png`).
- L'installeur Windows laisse choisir le dossier d'installation et crée un raccourci sur le bureau.
  Les installeurs ne sont pas signés : sous macOS, le premier lancement se fait par clic droit →
  *Ouvrir* (ou `xattr -cr /Applications/Sulfur.app`).
- La CI exécute lint, tests et build sur `main` et sur chaque pull request. Sur les tags de version `v*`, elle
  produit en plus les installeurs Windows, Linux et macOS, joints à une release GitHub en brouillon avec
  les fichiers `latest*.yml` utilisés par les mises à jour :

```bash
npm version patch          # incrémente package.json et crée le tag vX.Y.Z
git push --follow-tags
```

- Mises à jour (`src/main/updater.js`, electron-updater) : l'application consulte les releases GitHub
  au démarrage, puis toutes les 6 heures ; désactivable dans *Paramètres → Mises à jour*. Les releases
  en brouillon sont ignorées : une mise à jour n'est proposée qu'une fois sa release publiée.
  L'installation est automatique sous Windows, en AppImage et en .deb ; sous macOS (application non
  signée), la nouvelle version est seulement signalée, avec un lien vers sa release.

## Architecture

```
src/
├── main/                 # Process principal Electron
│   ├── index.js          # Fenêtre + cycle de vie
│   ├── module-host.js    # Chargement des modules, IPC
│   ├── config-store.js   # Configurations enregistrées des modules (config.json)
│   ├── config-transfer.js # Import / export des configurations (canaux config:*)
│   ├── system-info.js    # Infos PC (IP, système) — canal system:info
│   └── modules.js        # ← liste des modules "main"
├── preload/index.js      # Pont sécurisé : window.sulfur.invoke / on
├── renderer/             # Interface React
│   └── src/
│       ├── App.jsx       # Shell (sidebar + module actif)
│       ├── components/   # Composants UI partagés (Card, CertificatesDialog…)
│       ├── pages/        # Pages de l'application (Accueil, Informations, Paramètres)
│       ├── preferences.jsx # Langue et thème (useI18n, usePreferences)
│       ├── module-config.js # Réglages enregistrés des modules (usePersistentState)
│       └── modules.js    # ← liste des modules "renderer"
├── shared/               # Code commun main/renderer (i18n, langues, simulateur…)
│   ├── points.js         # Points de données partagés entre modules (contrat)
│   ├── certificate.js    # Certificats TLS auto-signés des serveurs (process principal)
│   └── locales/          # Textes communs (fr.js, en.js)
└── modules/              # Modules de simulation
    ├── opcua/
    │   ├── main/         # Serveur + client node-opcua
    │   ├── renderer/     # Interface React du module
    │   └── shared/       # Constantes partagées
    ├── modbus/
    │   ├── main/         # Protocole, trames (MBAP, RTU, ASCII), liaison série, serveur, client, PKI
    │   ├── renderer/     # Interface React du module
    │   └── shared/       # Constantes + encodage des valeurs (codec)
    ├── http/             # Serveur REST (variables, routes, webhooks) + client HTTP
    ├── ntp/              # Serveur de temps à horloge simulée + client NTP
    ├── s7/               # Automate S7 simulé (S7comm) + client S7
    ├── plcsim/           # Automates virtuels S7-PLCSIM Advanced (Windows, pont PowerShell vers l'API)
    ├── mqtt/             # Broker MQTT (topics simulés) + client MQTT
    ├── snmp/             # Agent SNMP (MIB simulée, notifications) + manager et récepteur de traps
    ├── syslog/           # Serveur Syslog (UDP / TCP / TLS) + émetteur de messages
    ├── dns/              # Serveur DNS faisant autorité (zone locale, relais) + client DNS
    ├── ldap/             # Annuaire LDAP / LDAPS (LDIF, protocole BER) + client LDAP
    ├── simulator/        # Injection de défauts et flux de nœuds (utilise les points des autres modules)
    ├── trends/           # Courbes, enregistrement et export CSV (idem)
    └── ca/               # Autorité de certification : autorités, émission, CSR, révocation (CRL), PKCS#12
```

## Langues et thème

La langue et le thème se choisissent dans **Paramètres** (mémorisés, y compris par le process principal
pour ouvrir la fenêtre directement dans le bon thème). La langue s'applique à l'interface et aux messages
produits par le process principal (erreurs, journaux des serveurs). Par défaut : anglais, thème du système d'exploitation.

- Les textes sont rangés par dictionnaire : `src/shared/locales/` (application) et
  `src/modules/<id>/shared/locales/` (chaque module, clés préfixées par l'identifiant du module).
- Dans le code : `t('ui.monitoring', { count: 3 })`. Côté React, `const { t } = useI18n()`.
  Dans un module, utiliser le `t` de `src/modules/<id>/shared/i18n.js`.
- Une clé absente d'une langue est affichée en anglais.
- Un module qui ne fournit pas la langue choisie est affiché **entièrement en anglais** (textes communs
  compris), sans mélange de langues.

**Ajouter une langue** (ex. allemand) :

1. déclarer `de: { label: 'Deutsch', locale: 'de-DE' }` dans `src/shared/languages.js` ;
2. créer `de.js` à côté de chaque `fr.js` (`src/shared/locales/` et `src/modules/*/shared/locales/`) ;
3. l'enregistrer dans le `index.js` voisin : `registerMessages({ fr, en, de })`.

Le **thème clair** redéfinit les variables de couleurs Tailwind (`ink`, `slate`, accents) sous
`:root[data-theme='light']` dans `src/renderer/src/index.css` : les composants n'ont pas de classes
spécifiques au thème. Le texte posé sur la couleur d'accent utilise `text-on-accent`.

## Configurations enregistrées

Les réglages des serveurs et clients de chaque module (port, sécurité, variables / points, endpoint,
requête préparée…) sont enregistrés au fil des modifications et restaurés au lancement suivant, dans
`<userData>/modules/<id>/config.json` (Linux : `~/.config/sulfur/…`, Windows : `%APPDATA%\sulfur\…`).
Les serveurs ne sont pas démarrés automatiquement. Le mot de passe du client OPC UA n'est jamais enregistré.

Dans l'interface d'un module, `usePersistentState('<id>', '<section>', défauts)` remplace `useState` : la
valeur enregistrée est complétée par les valeurs par défaut, si bien qu'un réglage ajouté dans une
version ultérieure garde sa valeur par défaut.

**Import / export** (Paramètres → Configurations) : la configuration de tous les modules est exportée dans
un seul fichier JSON, pour partager un banc de test :

```json
{ "format": "sulfur-config", "version": 1, "appVersion": "0.2.0", "exportedAt": "…",
  "modules": { "opcua": { "server": { … } }, "modbus": { "client": { … } } } }
```

L'import remplace la configuration des modules présents dans le fichier (les modules inconnus de cette
version sont ignorés et signalés). Il est refusé tant qu'un serveur tourne ou qu'un client est connecté
(un module le signale par une fonction `busy()` facultative dans sa partie main). Si l'interface d'un
module ne peut pas s'afficher (configuration incohérente par exemple), un bouton rétablit sa
configuration par défaut.

### Ajouter un module

1. Créer `src/modules/<id>/` avec `main/index.js`, `renderer/index.js` et `shared/`.
2. **Main** : exporter `{ manifest, activate(ctx), deactivate(), busy() }` (`busy` facultatif).
   - `ctx.handle('action', fn)` expose le canal IPC `<id>:action`
   - `ctx.emit('event', payload)` diffuse `<id>:event` vers l'interface
   - `ctx.expose(api)` publie les points de données du module (liste, lecture, écriture, défauts
     injectables) pour le simulateur et les courbes ; `ctx.peers()` retourne ceux des autres modules.
     Le contrat est décrit dans `src/shared/points.js`.
3. **Renderer** : exporter `{ manifest, icon, Component }` (icône `lucide-react`).
   - `window.sulfur.invoke('<id>:action', ...args)` / `window.sulfur.on('<id>:event', fn)`
4. Enregistrer le module dans `src/main/modules.js` et `src/renderer/src/modules.js`.
5. Fournir ses textes dans `shared/locales/` (au minimum `en.js`, puis `index.js` :
   `registerMessages({ en, fr }, '<id>')`) et un `shared/i18n.js` exportant `t = moduleT('<id>')`.
   Le nom et la description affichés viennent des clés `<id>.name` / `<id>.description`.

## Module OPC UA

- **Serveur** : variables simulées (sinus, rampe, aléatoire, bascule, statique) exposées sous
  `Objects/<dossier racine>` avec des NodeId `ns=1;s=<dossier>.<variable>`. Endpoint par défaut :
  `opc.tcp://localhost:4840/UA/Sulfur`. Une variable String reçoit la valeur générée sous forme de texte.
  - **Tableaux** (taille fixe, éléments simulés avec un déphasage) et **types structurés**
    (ExtensionObject, champs `Nom:Type`, `[]` pour un tableau) ;
  - **méthodes** avec arguments d'entrée / sortie : écho, lecture / écriture des variables du même nom
    ou échec avec un code d'erreur choisi ;
  - **alarmes à seuils** (ExclusiveLimitAlarmType : très haut, haut, bas, très bas) acquittables, et
    émission d'**événements** à la demande ;
  - **historique** : les variables historisées conservent leurs 10 000 dernières valeurs (HistoryRead) ;
  - **import NodeSet2 XML** : les types et nœuds du fichier sont ajoutés à l'espace d'adressage ; les
    modèles compagnons requis fournis avec node-opcua (DI, Machinery…) sont chargés automatiquement.
    Les fichiers importés sont enregistrés avec la configuration.

  Variables, méthodes et alarmes se modifient serveur démarré ; les types structurés et les modèles
  importés sont chargés au démarrage.
- **Client** : connexion à n'importe quel serveur OPC UA, navigation dans l'espace d'adressage,
  lecture/écriture (y compris tableaux et structures, en JSON) et surveillance temps réel
  (abonnements), appel de méthodes, lecture d'historique, réception des événements et alarmes avec
  acquittement.
- **Sécurité** (serveur et client) :
  - modes `None`, `Sign`, `SignAndEncrypt` et politiques Basic256Sha256, Aes128-Sha256-RsaOaep,
    Aes256-Sha256-RsaPss (+ Basic256 / Basic128Rsa15 obsolètes) ;
  - authentification anonyme et/ou par identifiant / mot de passe (utilisateurs définis côté serveur) ;
    les mots de passe sont hachés (scrypt + sel) dès la saisie, seule l'empreinte est conservée ;
  - certificat du serveur `OPCUA@Sulfur` (généré au premier démarrage) ;
  - magasins de certificats séparés serveur / client, avec approbation des certificats rejetés depuis
    l'interface. Emplacement : `<userData>/modules/opcua/pki/{server,client}`
    (Linux : `~/.config/sulfur/…`, Windows : `%APPDATA%\sulfur\…`).
  - côté client, « Découvrir les endpoints » liste les couples mode / politique proposés par le serveur.

## Module Modbus

- **Transports** : Modbus TCP (en-tête MBAP), Modbus/TCP Security (TLS), **RTU over TCP** (trames RTU
  avec CRC dans une connexion TCP, comme celles des passerelles série / Ethernet en mode
  transparent), et **Modbus RTU** / **Modbus ASCII** sur liaison série (port RS-232 / RS-485,
  vitesse, bits de données, parité, bits de stop ; ports détectés listés). Les ports série passent
  par la bibliothèque `serialport`.
  - Sur une liaison série et en RTU over TCP, les Unit ID vont de 1 à 247 : le serveur ignore les
    requêtes destinées à un autre Unit ID, comme sur un bus partagé, et applique les écritures en
    diffusion (Unit ID 0) à tous les équipements sans répondre. Le client envoie une requête à la
    fois et respecte le silence de 3,5 caractères entre les trames ; le Unit ID 0 envoie des
    écritures en diffusion.
  - Les trames RTU sont délimitées par le code fonction (et le nombre d'octets annoncé), puis par un
    silence pour une fonction inconnue ; les trames invalides (CRC, LRC, parasites) sont comptées
    dans le journal du serveur. Une erreur de CRC ferme une connexion RTU over TCP ; sur une liaison
    série, le lecteur se resynchronise.
- **Serveur** : les quatre tables (coils, discrete inputs, input registers, holding registers),
  fonctions 1 à 6, 15, 16, 23 (lecture / écriture multiple) et 43 / 14 (identification de
  l'équipement). Points simulés typés (Boolean, UInt16/Int16, UInt32/Int32, Float32, Float64, ordre
  des mots ABCD / CDAB / BADC / DCBA), modifiables serveur démarré. Liste des clients connectés (ou
  du port série ouvert) et journal des événements de sécurité.
  - **Plusieurs équipements** sur un même serveur (simulation de passerelle) : chacun répond à son
    Unit ID avec sa propre mémoire, ses points et son identification ; un Unit ID non configuré
    reçoit l'exception 0B, ou est servi par le premier équipement si l'option est cochée.
    Équipements ajoutés, modifiés ou retirés serveur démarré.
  - **Identification** (fonction 43 / 14) : objets 00 à 06 (fabricant, code produit, révision, URL,
    produit, modèle, application) par équipement ; lecture basique, régulière (par flux, réponses
    découpées si besoin) et par objet ; niveau de conformité 0x82.
  - **Explorateur de registres** : mémoire brute d'un équipement par pages (UInt16, Int16,
    hexadécimal, binaire, bits), rafraîchie en continu ; les adresses occupées par un point sont
    repérées et chaque valeur est modifiable.
- **Client** : lecture / écriture de toutes les tables avec décodage (UInt16 → Float64, hexadécimal,
  binaire), écriture puis lecture en une requête (fonction 23), lecture de l'identification de
  l'équipement et surveillance périodique.
- **Sécurité** :
  - **Modbus/TCP Security** (TLS ≥ 1.2, port standard 802) avec authentification mutuelle par
    certificats X.509 épinglés (magasins approuvés / rejetés, approbation depuis l'interface) ;
  - **autorisation par rôle** : rôle lu dans le certificat client (extension
    `1.3.6.1.4.1.50316.802.1`), droits lecture / écriture par rôle, rôle par défaut ou refus ;
  - liste blanche d'adresses IP (CIDR), nombre maximal de connexions, limite de requêtes par
    seconde (exception 06), mode lecture seule, points protégés en écriture, filtrage du Unit ID
    (exception 11), fermeture des connexions envoyant des trames invalides (transports TCP) ;
  - certificat serveur `MODBUS@Sulfur`, certificat client régénéré avec le rôle choisi ;
    emplacement : `<userData>/modules/modbus/pki/{server,client}`.
- Ports par défaut 5020 (TCP) / 8020 (TLS) : les ports standards 502 / 802 nécessitent des droits
  administrateur sous Linux.

## Module HTTP / REST

- **Serveur** HTTP ou HTTPS (certificat auto-signé `HTTP@Sulfur`, généré au premier démarrage), port
  par défaut 8080 :
  - **variables simulées** (nombre, entier, booléen, texte, JSON ; sinus, rampe, aléatoire,
    bascule), modifiables serveur démarré, exposées par une API REST intégrée :
    `GET <base>/variables`, `GET <base>/variables/<nom>`, `PUT | PATCH | POST <base>/variables/<nom>`
    (corps `{ "value": … }` ou valeur seule) pour les variables modifiables ;
  - **routes** vérifiées dans l'ordre : méthode, chemin à paramètres (`/api/devices/:id`, `*` en
    fin), code, en-têtes, délai et gabarit de réponse (`{{var.<nom>}}`, `{{params.<nom>}}`,
    `{{query.<nom>}}`, `{{headers.<nom>}}`, `{{body.<champ>}}`, `{{now}}`, `{{uuid}}`…) ; une route
    peut affecter une variable à partir de la requête (ex. `body.value`) ;
  - **authentification** : Basic (utilisateurs, mots de passe hachés en scrypt dès la saisie), jeton
    Bearer ou clé d'API dans un en-tête ; en-têtes CORS ;
  - **webhooks** : appels sortants en JSON à chaque changement des variables choisies (avec un
    espacement minimal) ou périodiques ;
  - journal des requêtes reçues et des appels de webhooks, avec leurs corps.
- **Client** : requêtes de toutes méthodes vers une adresse de base ou une URL complète
  (authentification, en-têtes communs, certificats non vérifiés acceptés sur demande), réponse
  lisible (code, durée, en-têtes, JSON indenté) et historique ; **surveillance** d'une valeur JSON
  (chemin comme `data.value`) interrogée périodiquement et publiée comme point ; avec une méthode
  d'écriture, le simulateur peut l'écrire. Les mots de passe, jetons et clés du client ne sont pas
  enregistrés.
- Défauts du simulateur : délai de réponse, absence de réponse, coupure de connexion, code HTTP forcé
  (toutes les requêtes ou celles qui concernent les variables choisies), valeurs figées.

## Module NTP

- **Serveur** (UDP, port par défaut 1123 ; le port standard 123 demande des droits administrateur
  sous Linux) : répond aux requêtes client NTP v1 à v4 avec une **horloge simulée** : décalage par
  rapport à l'heure réelle (sauts de ±1 min à ±1 an en un clic) ou heure de départ fixée, dérive en
  ppm ; strate (1 à 16), indicateur de seconde intercalaire, identifiant de référence et précision
  annoncés. Tout s'applique à chaud. Utile pour tester l'horodatage des équipements et la validité
  de leurs certificats. Liste des clients récents et journal.
- **Client** : interrogation unique ou périodique d'un serveur ; écart d'horloge, délai aller-retour,
  strate, indicateur de seconde intercalaire, référence, précision, délai et dispersion racine ;
  historique. Une réponse dont le champ Origin ne correspond pas à la requête est ignorée.
- Points pour le simulateur et les courbes : heure du serveur, décalage (modifiable : un flux peut
  provoquer des sauts d'heure), dérive, strate et indicateur de seconde intercalaire (modifiables),
  nombre de requêtes ; écart, délai et strate mesurés par le client.
- Défauts du simulateur : délai (latence réseau simulée, comptée dans le délai aller-retour),
  absence de réponse, Kiss-o'-Death (DENY, RSTR, RATE), horloge figée.

## Module Siemens S7

- **Automate simulé** (S7comm sur ISO-on-TCP, port par défaut 1102 ; le port standard 102 est
  souvent pris sous Windows par les services Siemens et demande des droits administrateur sous
  Linux) : entrées (I), sorties (Q), mémentos (M) et blocs de données configurables ; **points
  simulés** à des adresses S7 (`DB1.DBD0`, `MW10`, `Q0.0`… en types Bool, Byte, Int, DInt, Real,
  LReal, String…) avec les générateurs habituels ; taille de PDU négociée (240, 480, 960) ;
  identification de la CPU renvoyée dans les listes d'état système (SZL 0x0011, 0x001C) et état de
  fonctionnement (0x0424) ; RUN / STOP à la main ou par les clients (services PI) ; protection en
  écriture ; explorateur de mémoire (octets bruts, modifiables) ; clients connectés et journal. Les
  clients se connectent avec n'importe quel rack et emplacement. Vérifié avec Snap7.
- **Client** : connexion par rack et emplacement (connexion PG, OP ou S7 basique) ou TSAP explicites,
  négociation de la PDU ; lecture et écriture typées par adresse (notation internationale ou
  allemande : `E0.1`, `AW2`) ; lecture et écriture d'octets bruts découpées selon la taille de PDU ;
  identification de la CPU (référence, firmware, numéro de série…), état de fonctionnement,
  démarrage à chaud / à froid et STOP (avec confirmation) ; **surveillance** groupée en requêtes
  multi-variables, conservée au redémarrage et publiée comme points. S7-1200 / 1500 : autorisez
  PUT/GET et utilisez des blocs de données à accès standard.
- Défauts du simulateur : délai de réponse, absence de réponse, coupure de connexion, code de retour
  forcé (défaut matériel, accès refusé, adresse hors limites… en lecture, en écriture ou les deux),
  valeurs figées.

## Module PLCSim Advanced (Windows)

Pilote les automates virtuels S7-1500 de **S7-PLCSIM Advanced** par son API Simulation Runtime
(assembly .NET `Siemens.Simatic.Simulation.Runtime.Api`), chargée par Windows PowerShell 5.1 dans un
processus d'arrière-plan : aucun module natif à compiler. Le dossier de l'API est détecté
automatiquement (version la plus récente dans
`C:\Program Files (x86)\Common Files\Siemens\PLCSIMADV\API\<version>`) ou indiqué dans le module.

- Connexion à l'API (éventuellement au démarrage de Sulfur) : version de l'API, disponibilité du
  Runtime Manager, mode réseau (Softbus ou TCP/IP).
- **PC distant** : connexion au Runtime Manager d'un autre PC (adresse IP ou nom, port ouvert dans le
  panneau de contrôle de PLCSIM Advanced, 50000 par défaut) ; les instances listées et pilotées sont
  alors celles de ce PC. La perte de connexion est signalée.
- **Sans PLCSIM Advanced installé** : le module demande le dossier qui contient les DLL de l'API
  (copiées depuis un PC où il est installé). L'API est une bibliothèque Windows native (C++/CLI) :
  elle ne peut pas être chargée sous Linux ni macOS, où le module reste indisponible.
- **Instances** : création (type de CPU), mise sous / hors tension, RUN / STOP, effacement général,
  suppression, adresse IP de chaque interface. Le programme se charge depuis TIA Portal.
- **Variables** : table des variables du programme chargé (filtre, tableaux développés), ou adresses
  des entrées, sorties et mémentos ; **surveillance** de plusieurs instances, écriture depuis la liste
  et publication comme points : un flux du simulateur peut piloter les entrées de l'automate virtuel
  pour simuler le procédé. Les variables surveillées sont conservées au redémarrage.
- Test sur l'API réelle : `SULFUR_PLCSIM_LIVE=1 npm test` (crée, met sous tension puis supprime une
  instance de test).

## Module MQTT

- **Broker** (MQTT 3.1, 3.1.1 et 5.0, port par défaut 1883 ; TLS sur 8883 avec un certificat
  auto-signé `MQTT@Sulfur` généré au premier démarrage) : sessions persistantes et expiration de
  session, QoS 0 / 1 / 2, messages retenus, dernière volonté (avec délai en 5.0), alias de topic,
  options d'abonnement 5.0 (no local, retain as published, retain handling, identifiants
  d'abonnement) et propriétés des messages transmises aux clients 5.0 ; abonnements partagés et
  authentification étendue non pris en charge. **topics simulés** publiés par le broker
  lui-même (valeur nombre, entier, booléen ou texte ; générateur sinus, rampe, aléatoire ou
  bascule), périodiquement ou à chaque changement, en valeur seule ou en JSON
  `{"value": …, "timestamp": …}`, avec QoS et indicateur « retenu » choisis. Un topic modifiable
  accepte une nouvelle valeur publiée sur `<topic>/set`. Authentification facultative (utilisateurs
  avec mots de passe hachés ; les connexions anonymes peuvent être refusées). Liste des clients
  connectés et de leurs abonnements, explorateur de topics (dernier contenu de chaque topic), journal
  des messages avec filtre de topic (jokers `+` et `#`) et événements de connexion.
- **Client** (mqtt.js, MQTT 3.1, 3.1.1 ou 5.0, TCP ou TLS) : identifiant, utilisateur, session
  propre, keep alive, reconnexion automatique, message de dernière volonté ; abonnements avec QoS et
  champ JSON facultatif (`value`, `data.temp`…) dont la dernière valeur est affichée ; publication
  (topic, contenu, QoS, retenu) ; journal des messages reçus.
- Points pour le simulateur et les courbes : topics simulés (modifiables : publie la nouvelle
  valeur), nombres de clients et de messages du broker ; dernière valeur de chaque abonnement du
  client (un abonnement sans joker est modifiable : la valeur est publiée sur son topic).
- Défauts du simulateur : délai (publications reçues), absence de réponse (CONNECT sans réponse,
  messages plus distribués), coupure (clients déconnectés et refusés), valeurs figées.

## Module SNMP

- **Agent** (net-snmp, UDP, port par défaut 1161 ; le port standard 161 demande des droits
  administrateur sous Linux) : SNMPv1, v2c et v3. Communauté en lecture et communauté en lecture /
  écriture, utilisateurs SNMPv3 (USM : authentification MD5 ou SHA-1 / SHA-2, chiffrement DES ou
  AES), identifiant de moteur choisi ou généré. Groupe système de la MIB-II (sysDescr, sysObjectID,
  sysUpTime, sysContact, sysName, sysLocation, sysServices) et **objets simulés** (Integer,
  Counter32, Gauge32, TimeTicks, OctetString, IpAddress, OID ; générateur sinus, rampe, aléatoire
  ou bascule), modifiables par SetRequest s'ils sont déclarés en écriture. Requêtes Get, GetNext,
  GetBulk et Set, journal des requêtes.
- **Notifications** : l'agent envoie une notification (OID choisi, objets choisis joints) à des
  destinataires en SNMPv1 (trap), SNMPv2c ou SNMPv3 (trap ou inform acquitté) ; une notification
  SNMPv3 utilise l'un des utilisateurs de l'agent et l'identifiant de moteur de l'agent.
- **Manager** : requêtes Get, GetNext, GetBulk, Walk et Set en v1, v2c ou v3 (plusieurs OID à la
  fois, valeurs typées pour Set) ; OID surveillés lus périodiquement ; **récepteur de
  notifications** (port par défaut 1162 ; toutes les communautés acceptées, traps et informs SNMPv3 avec
  l'utilisateur du manager) avec la liste des traps et informs reçus.
- Points pour le simulateur et les courbes : objets simulés (modifiables), nombre de requêtes,
  notifications envoyées (l'écrire envoie la notification) ; OID surveillés (modifiables : envoie un
  SetRequest avec le type de la dernière lecture), notifications reçues.
- Défauts du simulateur : délai, absence de réponse, erreur forcée (genErr, tooBig, noSuchName,
  badValue, noAccess, resourceUnavailable, authorizationError — sur toutes les requêtes, les
  lectures ou les écritures), valeurs figées.

## Module Syslog

- **Serveur** : reçoit les messages Syslog en UDP et TCP (port par défaut 1514 ; le port standard
  514 demande des droits administrateur sous Linux) et TLS (port 6514, certificat auto-signé
  `Syslog@Sulfur`). En TCP / TLS, chaque message est lu selon sa propre délimitation (RFC 6587) :
  longueur en tête (octet counting) ou fin de ligne. Les messages sont analysés au format RFC 5424
  (horodatage, hôte, application, processus, identifiant, données structurées) ou RFC 3164 (BSD),
  en texte libre sinon ; les 2 000 derniers sont conservés. Compteurs par gravité, filtre par gravité
  minimale et par texte, détail de chaque message (données structurées, message brut), pause de
  l'affichage.
- **Émetteur** : messages au format RFC 5424 ou RFC 3164 en UDP, TCP (longueur en tête ou fin de
  ligne) ou TLS ; facilité, gravité, nom d'hôte, application, processus, identifiant, données
  structurées ; texte avec `{n}` (numéro du message) et `{time}` ; rafale de plusieurs messages par
  envoi, envoi périodique, aperçu du message brut, historique.
- Points pour le simulateur et les courbes : nombre de messages, erreurs (gravité ≤ 3), dernière
  gravité et dernier message reçus, connexions ouvertes ; messages envoyés, et un point
  `send message` : écrire un texte envoie un message avec les réglages de l'émetteur.
- Défaut du simulateur : coupure (connexions TCP / TLS fermées et refusées).

## Module DNS

- **Serveur** faisant autorité sur un domaine de test, en UDP et TCP (port 1053 par défaut, port
  standard 53 avec droits administrateur sous Linux) :
  - enregistrements A, AAAA, CNAME, MX, TXT, SRV, PTR, NS, modifiables serveur démarré ; noms
    relatifs rattachés au domaine, `@` pour le domaine, jokers `*.nom` ; enregistrement SOA généré au
    sommet de la zone et enregistrements inverses (PTR) déduits des A / AAAA ;
  - chaînes de CNAME suivies dans la zone, NXDOMAIN (avec SOA) pour un nom inconnu de la zone,
    réponse vide pour un nom sans enregistrement du type demandé, troncature (TC) des réponses UDP
    plus grandes que la taille acceptée par le client (EDNS) ;
  - noms hors zone relayés vers des serveurs amont, ou refusés (REFUSED) ;
  - journal des requêtes reçues (client, nom, type, réponse, réponses) et compteurs ; défauts
    injectés par le simulateur (délai, absence de réponse, SERVFAIL / NXDOMAIN / REFUSED forcé).
- **Client** : requête de tout type (ANY compris) en UDP ou TCP (nouvel essai automatique en TCP si
  la réponse est tronquée), indicateur de récursion, PTR à partir d'une adresse IP ; code de réponse,
  indicateurs, sections réponse, autorité et additionnelle avec leur TTL, durée et historique.

## Module LDAP

- **Serveur** LDAP v3 (port 1389 par défaut, LDAPS 1636 ; ports standards 389 / 636 avec droits
  administrateur sous Linux) sur un annuaire de test en lecture seule, pour vérifier
  l'authentification centralisée de switchs, pare-feux, IHM ou applications :
  - annuaire saisi en **LDIF** (annuaire d'exemple avec utilisateurs et groupes), modifiable serveur
    démarré ; `userPassword` en clair ou haché ({SSHA}, {SHA}, {SSHA256}, {SSHA512}) ; `memberOf`
    déduit des groupes (`member`, `uniqueMember`) ;
  - liaison simple (DN et mot de passe) ou anonyme (désactivable), recherche avec portées base / un
    niveau / sous-arbre et filtres RFC 4515 (et, ou, non, égalité, sous-chaînes, ≥, ≤, présence),
    limite de taille, comparaison, rootDSE (contextes de nommage), opération étendue « Who am I » ;
    les mots de passe ne sont jamais renvoyés et les écritures sont refusées (unwillingToPerform) ;
  - **LDAPS** ou **StartTLS** avec le certificat auto-signé `LDAP@Sulfur`
    (`<userData>/modules/ldap/pki/own`) ;
  - journal des événements (liaisons et motif d'échec, recherches avec leur filtre) et compteurs ;
    défauts injectés par le simulateur (délai, absence de réponse, code de résultat forcé).
- **Client** (bibliothèque ldapts) : URL `ldap://` ou `ldaps://`, StartTLS, DN et mot de passe de
  liaison (mot de passe non enregistré), test d'authentification avec « Who am I », recherche (base,
  portée, filtre, attributs, limite) et historique.
- Le serveur implémente lui-même le codage BER et le protocole LDAP (la bibliothèque ldapjs a été
  abandonnée).

## Module Simulateur

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

## Module Courbes

- Échantillonnage périodique (50 ms minimum) de 8 points au plus : variables et points des serveurs,
  valeurs surveillées par les clients OPC UA et Modbus (booléens en 0 / 1). Les 100 000 derniers
  échantillons sont conservés.
- Graphique temps réel avec fenêtre glissante (1 min à 1 h, ou tout l'enregistrement), zoom par
  glisser, réticule et info-bulle listant toutes les courbes ; un graphique commun (un seul axe) ou
  un graphique par point pour des échelles différentes. Palette adaptée aux daltoniens, variantes
  claire et sombre.
- Tableau des points avec la valeur au curseur (ou la dernière), le minimum et le maximum.
- **Export CSV** (séparateur `;`, horodatage ISO, point ou virgule décimale), une colonne par point.

## Module Autorité de certification

PKI de test pour équiper un banc sans OpenSSL : certificats pour OPC UA, Modbus/TCP Security, MQTT,
HTTPS, Syslog TLS, ou pour des équipements réels.

- **Autorités** : racine auto-signée, ou intermédiaire signée par une racine (longueur de chemin 0) ;
  clés ECDSA P-256 / P-384 ou RSA 2048 à 4096. Import d'une autorité existante (certificat + clé
  privée, PEM ou DER, clé chiffrée avec son mot de passe).
- **Émission** avec une nouvelle clé, par profil : serveur TLS, client TLS, serveur et client,
  **application OPC UA** (URI d'application obligatoire, usages de clé exigés par les politiques de
  sécurité OPC UA) et **Modbus/TCP Security** (rôle du client dans l'extension
  `1.3.6.1.4.1.50316.802.1`, lu par le serveur Modbus). Noms alternatifs DNS, IP et URI (noms de ce
  PC ajoutés en un clic) ; validité bornée par celle de l'autorité.
- **Signature d'une demande (CSR PKCS#10)** générée par un équipement : sujet, clé et noms
  alternatifs de la demande (complétés par ceux saisis) ; la clé privée reste sur l'équipement.
- **Révocation** avec motif et **liste de révocation** (CRL v2 avec numéro de CRL, valable 30 jours,
  régénérée à chaque révocation ou à la demande).
- **Export** : certificat (PEM, DER), certificat et chaîne jusqu'à la racine (PEM), clé privée (PEM
  PKCS#8), **PKCS#12** (.p12 / .pfx) protégé par mot de passe avec les paramètres d'OpenSSL 3
  (PBES2 AES-256-CBC / PBKDF2-SHA256, HMAC-SHA256), CRL (PEM, DER). Détail de chaque certificat
  (champs décodés, empreintes SHA-256 / SHA-1, PEM à copier).
- Stockage : `<userData>/modules/ca/authorities/<id>` (clés privées en droits 600). Les autorités ne
  font pas partie de la configuration exportée.

## Licence

Sulfur est distribué sous [licence Apache 2.0](LICENSE) — Copyright © 2026 Maxime MALLET. Les modules
de ce dépôt forment l'édition **standard**, gratuite ; des modules **premium**, distribués à part sous
licence commerciale, sont prévus (voir la [roadmap](ROADMAP.fr.md#éditions-standard-et-premium)).

Les contributions sont les bienvenues : voir [CONTRIBUTING.fr.md](CONTRIBUTING.fr.md). Chaque
contributeur signe une fois le [Contributor License Agreement](CLA.md), à sa première pull request.
