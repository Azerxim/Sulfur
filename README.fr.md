# Sulfur

[![CI](https://github.com/Azerxim/Sulfur/actions/workflows/ci.yml/badge.svg)](https://github.com/Azerxim/Sulfur/actions/workflows/ci.yml)

[English](README.md) · **Français**

Application de simulateur modulaire — Electron + React (JavaScript) + TailwindCSS v4.
Interface en anglais (par défaut) et en français, thème sombre (par défaut) ou clair.
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
(sockets, TLS, certificats) et des tests unitaires : sécurité, modification à chaud, tableaux et structures, méthodes, alarmes et événements, historique et import NodeSet2 OPC UA, Modbus TCP
et Modbus/TCP Security, HTTP / REST (API, routes, authentification, HTTPS, webhooks), NTP (paquets, horloge simulée, client), Siemens S7 (adresses, codec, serveur et client, découpage selon la PDU, défauts), PLCSim Advanced (protocole du pont, gestionnaire), injection de défauts, flux de nœuds et enregistrement de courbes sur les deux protocoles, protocole et encodage des valeurs, configurations enregistrées et fichiers d'import / export, traductions (mêmes clés et paramètres dans
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
npm run dist:linux   # AppImage → dist/Sulfur-<version>-x86_64.AppImage
npm run dist:win     # installeur NSIS → dist/Sulfur-Setup-<version>.exe (sous Windows)
```

- Configuration dans `electron-builder.yml`. Icône de l'application : `resources/icon.png` (1024 px,
  Linux et icône de fenêtre) et `resources/icon.ico` (Windows). `resources/` est embarqué avec
  l'application ; `build/` est réservé aux ressources propres au packaging.
- L'installeur Windows laisse choisir le dossier d'installation et crée un raccourci sur le bureau.
  Les installeurs ne sont pas signés.
- La CI produit les deux installeurs sur `main`, sur les tags `v*` et à la demande (*Actions → CI → Run
  workflow*) ; ils sont téléchargeables dans les artefacts de l'exécution. Sur un tag `v*`, une release
  GitHub en brouillon est créée avec les installeurs joints :

```bash
npm version patch          # incrémente package.json et crée le tag vX.Y.Z
git push --follow-tags
```

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
│       ├── pages/        # Pages de l'application (Informations, Paramètres)
│       ├── preferences.jsx # Langue et thème (useI18n, usePreferences)
│       ├── module-config.js # Réglages enregistrés des modules (usePersistentState)
│       └── modules.js    # ← liste des modules "renderer"
├── shared/               # Code commun main/renderer (i18n, langues, simulateur…)
│   ├── points.js         # Points de données partagés entre modules (contrat)
│   └── locales/          # Textes communs (fr.js, en.js)
└── modules/              # Modules de simulation
    ├── opcua/
    │   ├── main/         # Serveur + client node-opcua
    │   ├── renderer/     # Interface React du module
    │   └── shared/       # Constantes partagées
    ├── modbus/
    │   ├── main/         # Protocole, serveur, client, PKI, sécurité
    │   ├── renderer/     # Interface React du module
    │   └── shared/       # Constantes + encodage des valeurs (codec)
    ├── http/             # Serveur REST (variables, routes, webhooks) + client HTTP
    ├── ntp/              # Serveur de temps à horloge simulée + client NTP
    ├── s7/               # Automate S7 simulé (S7comm) + client S7
    ├── plcsim/           # Automates virtuels S7-PLCSIM Advanced (Windows, pont PowerShell vers l'API)
    ├── simulator/        # Injection de défauts et flux de nœuds (utilise les points des autres modules)
    └── trends/           # Courbes, enregistrement et export CSV (idem)
```

## Langues et thème

La langue et le thème se choisissent dans **Paramètres** (mémorisés, y compris par le process principal
pour ouvrir la fenêtre directement dans le bon thème). La langue s'applique à l'interface et aux messages
produits par le process principal (erreurs, journaux des serveurs). Par défaut : anglais, thème sombre.

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

## Module Modbus TCP

- **Serveur** : les quatre tables (coils, discrete inputs, input registers, holding registers),
  fonctions 1 à 6, 15, 16, 23 (lecture / écriture multiple) et 43 / 14 (identification de
  l'équipement). Points simulés typés (Boolean, UInt16/Int16, UInt32/Int32, Float32, Float64, ordre
  des mots ABCD / CDAB / BADC / DCBA), modifiables serveur démarré. Liste des clients connectés et
  journal des événements de sécurité.
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
    (exception 11), fermeture des connexions envoyant des trames invalides ;
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

## Licence

Sulfur est distribué sous [licence Apache 2.0](LICENSE) — Copyright © 2026 Maxime MALLET. Les modules
de ce dépôt forment l'édition **standard**, gratuite ; des modules **premium**, distribués à part sous
licence commerciale, sont prévus (voir la [roadmap](ROADMAP.fr.md#éditions-standard-et-premium)).

Les contributions sont les bienvenues : voir [CONTRIBUTING.fr.md](CONTRIBUTING.fr.md). Chaque
contributeur signe une fois le [Contributor License Agreement](CLA.md), à sa première pull request.
