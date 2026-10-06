# Sulfur

Application de simulation modulaire — Electron + React (JavaScript) + TailwindCSS v4.

## Démarrage

```bash
npm install
npm run dev        # lancement en développement (HMR)
npm run build      # build de production dans out/
npm run dist       # packaging (electron-builder) dans dist/
```

## Architecture

```
src/
├── main/                 # Process principal Electron
│   ├── index.js          # Fenêtre + cycle de vie
│   ├── module-host.js    # Chargement des modules, IPC
│   ├── system-info.js    # Infos PC (IP, système) — canal system:info
│   └── modules.js        # ← liste des modules "main"
├── preload/index.js      # Pont sécurisé : window.sulfur.invoke / on
├── renderer/             # Interface React
│   └── src/
│       ├── App.jsx       # Shell (sidebar + module actif)
│       ├── components/   # Composants UI partagés (Card, CertificatesDialog…)
│       ├── pages/        # Pages de l'application (Informations…)
│       └── modules.js    # ← liste des modules "renderer"
├── shared/               # Code commun main/renderer (simulateur de valeurs…)
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

### Ajouter un module

1. Créer `src/modules/<id>/` avec `main/index.js`, `renderer/index.js` et `shared/`.
2. **Main** : exporter `{ manifest, activate(ctx), deactivate() }`.
   - `ctx.handle('action', fn)` expose le canal IPC `<id>:action`
   - `ctx.emit('event', payload)` diffuse `<id>:event` vers l'interface
3. **Renderer** : exporter `{ manifest, icon, Component }` (icône `lucide-react`).
   - `window.sulfur.invoke('<id>:action', ...args)` / `window.sulfur.on('<id>:event', fn)`
4. Enregistrer le module dans `src/main/modules.js` et `src/renderer/src/modules.js`.

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
