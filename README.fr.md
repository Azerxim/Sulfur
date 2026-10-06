# Sulfur

[English](README.md) · **Français**

Application de simulateur modulaire — Electron + React (JavaScript) + TailwindCSS v4.
Interface en anglais (par défaut) et en français, thème sombre (par défaut) ou clair.
Voir la [roadmap](ROADMAP.fr.md) pour la suite.

## Démarrage

```bash
npm install
npm run dev        # lancement en développement (HMR)
npm run build      # build de production dans out/
npm run dist       # packaging (electron-builder) dans dist/
npm test           # tests automatisés (Vitest)
```

## Tests

Le dossier `tests/` contient des tests d'intégration exécutés contre de vrais serveurs et clients
(sockets, TLS, certificats) et des tests unitaires : sécurité et modification à chaud OPC UA, Modbus TCP
et Modbus/TCP Security, protocole et encodage des valeurs, traductions (mêmes clés et paramètres dans
chaque langue, toute clé utilisée dans le code existe). Chaque test utilise un port libre et un magasin
de certificats temporaire.

```bash
npm test             # exécution unique
npm run test:watch   # relance à chaque modification
```

## Architecture

```
src/
├── main/                 # Process principal Electron
│   ├── index.js          # Fenêtre + cycle de vie
│   ├── module-host.js    # Chargement des modules, IPC
│   ├── config-store.js   # Configurations enregistrées des modules (config.json)
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
│   └── locales/          # Textes communs (fr.js, en.js)
└── modules/              # Modules de simulation
    ├── opcua/
    │   ├── main/         # Serveur + client node-opcua
    │   ├── renderer/     # Interface React du module
    │   └── shared/       # Constantes partagées
    └── modbus/
        ├── main/         # Protocole, serveur, client, PKI, sécurité
        ├── renderer/     # Interface React du module
        └── shared/       # Constantes + encodage des valeurs (codec)
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

### Ajouter un module

1. Créer `src/modules/<id>/` avec `main/index.js`, `renderer/index.js` et `shared/`.
2. **Main** : exporter `{ manifest, activate(ctx), deactivate() }`.
   - `ctx.handle('action', fn)` expose le canal IPC `<id>:action`
   - `ctx.emit('event', payload)` diffuse `<id>:event` vers l'interface
3. **Renderer** : exporter `{ manifest, icon, Component }` (icône `lucide-react`).
   - `window.sulfur.invoke('<id>:action', ...args)` / `window.sulfur.on('<id>:event', fn)`
4. Enregistrer le module dans `src/main/modules.js` et `src/renderer/src/modules.js`.
5. Fournir ses textes dans `shared/locales/` (au minimum `en.js`, puis `index.js` :
   `registerMessages({ en, fr }, '<id>')`) et un `shared/i18n.js` exportant `t = moduleT('<id>')`.
   Le nom et la description affichés viennent des clés `<id>.name` / `<id>.description`.

## Module OPC UA

- **Serveur** : variables simulées (sinus, rampe, aléatoire, bascule, statique) exposées sous
  `Objects/<dossier racine>` avec des NodeId `ns=1;s=<dossier>.<variable>`. Endpoint par défaut :
  `opc.tcp://localhost:4840/UA/Sulfur`.
- **Client** : connexion à n'importe quel serveur OPC UA, navigation dans l'espace d'adressage,
  lecture/écriture et surveillance temps réel (abonnements).
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
  fonctions 1 à 6, 15 et 16. Points simulés typés (Boolean, UInt16/Int16, UInt32/Int32,
  Float32, Float64, ordre des mots ABCD / CDAB / BADC / DCBA), modifiables serveur démarré.
  Liste des clients connectés et journal des événements de sécurité.
- **Client** : lecture / écriture de toutes les tables avec décodage (UInt16 → Float64, hexadécimal,
  binaire) et surveillance périodique.
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
