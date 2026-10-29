# Architecture

[Documentation](README.md) · [English](../en/architecture.md) · **Français**

Sulfur est une application Electron. Chaque protocole ou outil est un **module** composé de deux parties :
l'une s'exécute dans le process principal (Node.js : sockets, fichiers, certificats), l'autre dans
l'interface (React). Les deux parties communiquent par des canaux IPC nommés d'après le module.

## Arborescence

```text
src/
├── main/                    # Process principal Electron
│   ├── index.js             # Fenêtre et cycle de vie
│   ├── module-host.js       # Chargement des modules, contexte, IPC
│   ├── modules.js           # ← liste des modules intégrés « main »
│   ├── config-store.js      # Configurations enregistrées des modules (config.json)
│   ├── config-bundle.js     # Format du fichier d'import / export
│   ├── config-transfer.js   # Import / export des configurations (canaux config:*)
│   ├── module-switch.js     # Modules activés / désactivés, paquets (canaux modules:*)
│   ├── external-modules.js  # Modules externes : chargement, actualisation, installation, suppression
│   ├── module-packages.js   # Dossiers des paquets : vérifications, import, protocole sulfur-module://
│   ├── preferences.js       # preferences.json (thème, langue…)
│   ├── system-info.js       # Informations sur le PC (canaux system:*)
│   ├── updater.js           # Mises à jour automatiques (electron-updater)
│   └── releases.js          # Notes de version
├── preload/index.js         # Pont sécurisé : window.sulfur.invoke / on
├── renderer/                # Interface React
│   └── src/
│       ├── App.jsx          # Coquille : barre latérale et page active
│       ├── modules.js       # ← liste des modules intégrés « renderer »
│       ├── components/      # Barre latérale, gestion d'erreur, Markdown
│       ├── pages/           # Accueil, Informations, Paramètres
│       ├── preferences.jsx  # Langue et thème (useI18n, usePreferences)
│       └── module-config.js # Import / export et réinitialisation des configurations
├── shared/                  # Code de l'application partagé entre main et renderer
│   ├── app.js               # Version de Sulfur
│   └── locales/             # Textes de l'application (en.js, fr.js)
└── modules/                 # Modules intégrés (ils n'importent que le SDK)
    ├── builtin.js           # Manifeste des modules intégrés
    └── <id>/
        ├── main/            # Partie process principal (serveurs, clients, protocole)
        ├── renderer/        # Interface React
        └── shared/          # Constantes, codecs, traductions (shared/locales/)
packages/
└── sdk/                     # SDK des modules @azerxim/sulfur-sdk
examples/
├── module-template/         # Modèle pour démarrer son propre module
└── test-signal/             # Exemple de module externe
docs/                        # Cette documentation
tests/                       # Tests Vitest (voir Développement)
```

Alias de chemins (`aliases.mjs`, communs au build et aux tests) : `@shared`, `@modules`, `@renderer` et
`@azerxim/sulfur-sdk[/main|/ui|/build|/host|/archive]`, résolu depuis `packages/sdk/src`.

## Démarrage et arrêt

1. Le process principal lit `preferences.json` et applique la langue, pour que ses messages soient
   traduits dès le départ.
2. Le `ModuleHost` vérifie le manifeste de chaque module, puis active ceux qui sont activés : les
   services de l'application (`system`, `updater`), les modules intégrés dans l'ordre de
   `src/main/modules.js`, puis les modules externes si leur chargement est activé.
3. La fenêtre s'ouvre directement dans le thème enregistré : le preload le reçoit en argument et pose
   `data-theme` avant l'exécution de la page, sans affichage dans le mauvais thème.
4. L'interface charge la configuration enregistrée de chaque module avant son premier rendu.

À la fermeture, les modules sont désactivés dans l'ordre inverse : les modules transverses (simulateur,
courbes), déclarés après les modules de protocole dont ils utilisent les points, sont arrêtés en premier.

## Hôte des modules et contexte

`src/main/module-host.js` fournit à chaque module un contexte `ctx` :

| Membre | Rôle |
| --- | --- |
| `ctx.handle(action, fn)` | Enregistre le canal IPC `<id>:<action>`, appelable depuis l'interface |
| `ctx.emit(event, payload)` | Diffuse `<id>:<event>` à toutes les fenêtres |
| `ctx.dataDir` | Dossier de données persistant du module (`<userData>/modules/<id>`) |
| `ctx.config()` | Configuration enregistrée du module |
| `ctx.setConfig(section, value)` | Remplace une section de cette configuration (état propre au process principal) |
| `ctx.expose(api)` | Publie les points de données du module pour les autres modules |
| `ctx.peers()` | Points publiés par les autres modules actifs : `[{ id, api }]` |
| `ctx.log(...args)` | Journal préfixé par l'identifiant du module |

L'hôte enregistre aussi, pour chaque module, les canaux `<id>:config:load`, `<id>:config:save` et
`<id>:config:reset` (voir [Configurations enregistrées](configuration.md)).

Un module dont le manifeste est invalide ou incompatible, ou dont l'activation échoue, est refusé : il
n'a ni canal, ni configuration, ni page, et il est listé avec la raison dans *Paramètres → Modules*.

## IPC

Le preload (`src/preload/index.js`) expose un seul objet à l'interface :

```js
const data = await window.sulfur.invoke('modbus:server:start', config) // lève une erreur en cas d'échec
const unsubscribe = window.sulfur.on('modbus:server:status', (status) => { … })
```

- les noms de canaux doivent respecter `<moduleId>:<action>` ; tout autre nom est refusé par le preload ;
- le résultat d'un handler est enveloppé par l'hôte dans `{ ok, data }` ou `{ ok: false, error }`, et
  `invoke` transforme une erreur en exception portant le message (traduit) ;
- chaque module regroupe ses canaux dans un petit `renderer/api.js`.

Les identifiants `modules`, `config`, `home`, `info` et `settings` sont réservés à l'application. Ses
propres services du process principal sont aussi chargés comme des modules : `system` (informations
sur le PC, thème, langue) et `updater` (mises à jour).

## Points de données

Les modules de protocole publient leurs valeurs comme **points de données** avec `ctx.expose(api)` ; les
modules transverses ([Simulateur](modules/simulator.md), [Courbes](modules/trends.md)) les
retrouvent avec `ctx.peers()`. Le contrat (`PointsApi`, décrit dans `packages/sdk/src/points.js`) :

| Membre | Contenu |
| --- | --- |
| `name` | Nom affiché du module |
| `points()` | `[{ id, group: 'server' \| 'client', name, dataType, numeric, writable }]` |
| `read(ids)` | `{ [id]: valeur }`, `undefined` si indisponible |
| `write(id, value)` | Écrit une valeur (Promise), lève une erreur traduite si impossible |
| `faultTypes()` | Défauts injectables : `[{ type, codes?, points? }]` |
| `setFaults(faults)` | Défauts actifs de ce module : `[{ id, type, params, points }]` |

Hors de son module, un point est désigné par `<moduleId>/<id local>` (`pointKey` / `parsePointKey`).
Types de défauts communs : `delay`, `noResponse`, `cut`, `exception`, `badStatus`, `kissOfDeath`,
`freeze`.

## SDK des modules

Les modules n'utilisent l'application qu'à travers le **SDK des modules** `@azerxim/sulfur-sdk`
(`packages/sdk`, voir son [README](../../packages/sdk/README.fr.md)) :

| Point d'entrée | Contenu |
| --- | --- |
| `@azerxim/sulfur-sdk` | Manifeste, traductions et textes communs, points de données, aide à la configuration |
| `@azerxim/sulfur-sdk/main` | Outils du process principal : certificats, mots de passe, dossiers servis |
| `@azerxim/sulfur-sdk/ui` | Composants React partagés (`Button`, `Card`, `Tabs`…), `usePersistentState`, thème |
| `@azerxim/sulfur-sdk/build` | Construction et empaquetage des modules externes (`packModule`) |
| `@azerxim/sulfur-sdk/host` | Réservé à l'application |

Le build de Sulfur résout le SDK depuis ses sources ; un test vérifie que les modules intégrés
n'importent rien d'autre de l'application. Le SDK est aussi publié sur npm pour que des modules puissent
être construits hors de ce dépôt (voir [Créer un module](module-guide.md)).

## Manifeste

Chaque module déclare un manifeste, le même objet pour ses parties main et renderer :

| Champ | Contenu |
| --- | --- |
| `id` | Identifiant, préfixe des canaux IPC (`[a-z0-9-]+`, unique) |
| `name` | Nom de repli (le nom affiché vient de la clé `<id>.name`) |
| `description` | Description de repli (clé `<id>.description`) |
| `version` | Version du module (semver) |
| `author` | Auteur ou éditeur (facultatif), affiché avant l'installation d'un paquet |
| `edition` | `standard` (intégré à Sulfur) ou `additional` (paquet séparé) |
| `apiVersion` | Version de l'API des modules pour laquelle le module est écrit (semver) |
| `minAppVersion` | Version minimale de Sulfur (semver) |

L'API des modules (`MODULE_API_VERSION` du SDK, égale à sa version) suit le versionnage sémantique : un
module écrit pour l'API 1.2 fonctionne avec toute API 1.x à partir de 1.2, pas avec une API 2.x. Un
manifeste est refusé s'il est invalide, utilise un identifiant réservé ou déjà pris, vise une API des
modules incompatible ou exige une version plus récente de Sulfur.

Les modules intégrés utilisent `builtinManifest({ id, name, description })` (`src/modules/builtin.js`) :
version de l'application, édition standard, API des modules courante. Un module externe utilise
`defineManifest` du SDK avec sa propre `version` et sa `minAppVersion`.

## Ajouter un module intégré

Pour écrire un module **hors** de ce dépôt, suivez plutôt [Créer un module](module-guide.md).

1. Créer `src/modules/<id>/` avec `main/index.js`, `renderer/index.js` et `shared/`. N'importer le code
   de l'application qu'à travers le SDK (`@azerxim/sulfur-sdk`, `/main`, `/ui`).
2. **Partie main** : exporter `{ manifest, activate(ctx), deactivate(), busy(), migrateConfig() }`. Le
   manifeste vient de `builtinManifest(…)` ; `busy()` (serveur démarré, client connecté) et
   `migrateConfig(config)` (conversion d'une configuration plus ancienne) sont facultatifs.
3. **Partie renderer** : exporter `{ manifest, icon, Component }` (icône `lucide-react`). Regrouper les
   canaux dans `renderer/api.js` avec `window.sulfur.invoke` / `window.sulfur.on`.
4. Enregistrer le module dans `src/main/modules.js` et `src/renderer/src/modules.js`. Les modules
   transverses viennent en dernier.
5. Fournir ses textes dans `shared/locales/` (au minimum `en.js`, puis `index.js` :
   `registerMessages({ en, fr }, '<id>')`) et un `shared/i18n.js` exportant `t = moduleT('<id>')`.
   Le nom et la description affichés viennent des clés `<id>.name` et `<id>.description`.
6. Publier ses valeurs avec `ctx.expose(api)` pour que le simulateur et les courbes puissent les utiliser.
7. Ajouter ses tests dans `tests/<id>.test.js` et sa page dans `docs/modules/`.
