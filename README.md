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
│       ├── components/   # Composants UI partagés
│       ├── pages/        # Pages de l'application (Informations…)
│       └── modules.js    # ← liste des modules "renderer"
├── shared/               # Code commun main/renderer
└── modules/              # Modules de simulation
    └── opcua/
        ├── main/         # Serveur + client node-opcua
        ├── renderer/     # Interface React du module
        └── shared/       # Constantes partagées
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
