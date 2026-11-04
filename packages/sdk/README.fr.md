# SDK des modules Sulfur

[English](README.md) · **Français**

`@azerxim/sulfur-sdk` est le contrat entre [Sulfur](https://github.com/Azerxim/Sulfur) et ses
modules : manifeste, contexte du process principal, points de données, traductions et composants
d'interface partagés. Les modules livrés avec Sulfur n'utilisent que lui : un module écrit avec le
SDK peut donc être développé hors du dépôt de Sulfur.

La version du paquet **est la version de l'API des modules** (`MODULE_API_VERSION`) et suit le
versionnage sémantique : un module écrit pour le SDK 1.2 fonctionne avec toute version de Sulfur
qui fournit une API des modules 1.x à partir de 1.2, pas avec une API 2.x. Retirer ou modifier un
export demande une nouvelle version majeure.

## Installation

Le paquet est publié sur [npm](https://www.npmjs.com/package/@azerxim/sulfur-sdk), sans
configuration ni jeton :

```sh
npm install --save-dev @azerxim/sulfur-sdk
```

Il est aussi publié sur GitHub Packages. Pour l'installer depuis ce registre, ajouter au `.npmrc` du
projet du module (`GITHUB_TOKEN` : jeton d'accès personnel avec le droit `read:packages`, que GitHub
Packages demande même pour un paquet public) :

```ini
@azerxim:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

## Points d'entrée

| Import                       | Où                      | Contenu                                                                                     |
| ---------------------------- | ----------------------- | ------------------------------------------------------------------------------------------- |
| `@azerxim/sulfur-sdk`        | main et interface       | manifeste (`defineManifest`, `checkManifest`), traductions (`registerMessages`, `moduleT`, `formatTime`…), points de données (`pointKey`, `toNumber`, `FAULT_TYPES`), `withDefaults`, réseaux privés, `simulate` |
| `@azerxim/sulfur-sdk/main`   | process principal       | `ensureCertificate` (certificat TLS auto-signé), `hashPassword` / `verifyPassword` (scrypt), dossiers servis confinés (`resolveInside`, `prepareRoot`) |
| `@azerxim/sulfur-sdk/ui`     | interface (React)       | `Button`, `Card`, `Input`, `CommitInput`, `Select`, `Field`, `Checkbox`, `Tabs`, `TabbedPage`, `StatusDot`, `ErrorBanner`, `Modal`, `CertificatesDialog`, `usePersistentState`, `useStoredState` |
| `@azerxim/sulfur-sdk/build`  | Node (construction)     | `buildModule` (paquet d'un module externe), `packModule` (archive `.sulfur-module`), `sulfurShared` (plugin Vite) |
| `@azerxim/sulfur-sdk/archive` | Node                   | lecture et écriture des archives `.sulfur-module` (`packModule`, `readModuleArchive`)       |
| `@azerxim/sulfur-sdk/module.css` | CSS (Tailwind v4)   | utilitaires Tailwind d'un module externe, sur le thème de Sulfur (`theme.css`) |
| `@azerxim/sulfur-sdk/host`   | Sulfur uniquement       | cache des configurations de l'interface ; pas pour les modules                              |

Les déclarations TypeScript sont incluses (`types/`) ; elles décrivent tout le contrat, en
particulier `ModuleContext`, `MainModule`, `RendererModule` et `PointsApi`.

## Un module

```js
// shared/constants.js
import { defineManifest } from '@azerxim/sulfur-sdk'

export const DEMO_MODULE = defineManifest({
  id: 'demo', // préfixe des canaux IPC
  name: 'Démo',
  description: 'Module de démonstration',
  version: '1.0.0',
  author: 'Jane Doe', // facultatif, affiché avant l'installation
  edition: 'additional',
  minAppVersion: '0.5.0'
})
```

```js
// main/index.js — process principal
import { ensureCertificate } from '@azerxim/sulfur-sdk/main'
import { DEMO_MODULE } from '../shared/constants'

let running = false

export default {
  manifest: DEMO_MODULE,
  activate(ctx) {
    ctx.handle('start', async () => {
      const { cert, key } = await ensureCertificate(`${ctx.dataDir}/pki`, 'Demo@Sulfur')
      running = true
      ctx.emit('status', { running })
    })
    ctx.expose({ name: 'Démo', points: () => [], read: () => ({}), write: async () => {} })
  },
  busy: () => running,
  deactivate() {
    running = false
  }
}
```

```jsx
// renderer/index.js — interface
import { faCube } from '@fortawesome/free-solid-svg-icons'
import { Button, Card, usePersistentState } from '@azerxim/sulfur-sdk/ui'
import { DEMO_MODULE } from '../shared/constants'

function DemoView() {
  const [config, setConfig] = usePersistentState('demo', 'server', { port: 1234 })
  return (
    <Card title="Démo">
      <Button onClick={() => window.sulfur.invoke('demo:start', config)}>Démarrer</Button>
    </Card>
  )
}

export default { manifest: DEMO_MODULE, icon: faCube, Component: DemoView }
```

Traductions : `registerMessages({ en, fr }, 'demo')` puis `moduleT('demo')` ; le nom et la
description affichés viennent des clés `demo.name` et `demo.description`. Les textes communs
(`ui.start`, `errors.alreadyStarted`…) sont fournis par le SDK.

## Serveurs et clients multiples

Un module peut proposer autant de serveurs, de clients… (« rôles ») que l'utilisateur le souhaite,
aucun n'existant au départ (API 1.2) :

```js
// main/index.js — une instance par serveur ou client créé dans l'interface
import { defineInstances } from '@azerxim/sulfur-sdk/main'

const instances = defineInstances(ctx, {
  server: {
    label: () => t('ui.server'),
    create: (instance, { emit }) => new DemoServer({ onStatus: (s) => emit('status', s) }),
    busy: (server) => server.running,
    dispose: (server) => server.stop()
  }
})
instances.handle('server', 'start', (server, config) => server.start(config)) // demo:server:start (id, config)
```

```jsx
// renderer : un onglet par instance, boutons d'ajout, renommage et suppression
import { InstancesPage, useInstanceStatuses } from '@azerxim/sulfur-sdk/ui'
import { instanceSection } from '@azerxim/sulfur-sdk'

function DemoView() {
  const statuses = useInstanceStatuses('demo', 'server')
  return (
    <InstancesPage moduleId="demo" roles={[{ role: 'server', label: 'Serveur', icon: faServer }]} statuses={statuses}>
      {(instance) => <ServerPanel instance={instance} status={statuses[instance.id] ?? {}} />}
    </InstancesPage>
  )
}
// Dans le panneau : usePersistentState('demo', instanceSection('server', instance.id), défauts)
```

`instancesPointsApi` (`@azerxim/sulfur-sdk`) assemble les points de données du module à partir de
ceux de chaque instance ; `migrateToInstances` convertit la configuration d'une version qui n'avait
qu'un serveur et un client.

## Compléter un autre module

Un module peut ajouter des onglets à la page d'un autre module (API 1.2) : il déclare ses cibles dans
son manifeste (`extends: ['s7']`, affiché avant l'installation) et ses onglets dans sa partie
renderer (`extensions: [{ target: 's7', tab: { id, label, icon, Component } }]`, `icon` et
`Component` du module devenant facultatifs). L'onglet reçoit `target` et `module` et n'appelle que
les canaux de son propre module. `InstancesPage` affiche les onglets qui visent sa page ; une autre
page les lit avec `useExtensions(<son id>)`. Voir le
[guide des modules](https://github.com/Azerxim/Sulfur/blob/main/docs/fr/module-guide.md).

## Module externe

Pas à pas, à partir d'un modèle prêt à l'emploi : voir le
[guide de développement de module](https://github.com/Azerxim/Sulfur/blob/main/docs/module-guide.fr.md).

Un module développé hors du dépôt de Sulfur est livré sous forme de **paquet** : un dossier qui
contient son descripteur `module.json` (manifeste, groupe de la barre latérale, fichiers) et ses
fichiers construits. `buildModule` le produit avec [Vite](https://vite.dev) :

```js
// build.mjs — node build.mjs
import tailwindcss from '@tailwindcss/vite'
import { buildModule, packModule } from '@azerxim/sulfur-sdk/build'
import { DEMO_MODULE } from './src/shared/constants.js'

await buildModule({
  manifest: DEMO_MODULE,
  group: 'tools', // 'tools', 'automation' ou 'it'
  renderer: 'src/renderer/index.jsx',
  main: 'src/main/index.js', // facultatif : module sans process principal
  outDir: 'dist/demo',
  vite: { renderer: { plugins: [tailwindcss()] } }
})
await packModule('dist/demo') // dist/demo-1.0.0.sulfur-module, à installer depuis les Paramètres
```

```
dist/demo/
  module.json    manifeste, group, renderer, main, style
  renderer.mjs   export par défaut { manifest, icon, Component }
  main.mjs       export par défaut { manifest, activate, … }
  style.css      utilitaires Tailwind du module
```

- **Modules partagés** : React (`react`, `react/jsx-runtime`, `react-dom`) et le SDK ne sont pas
  embarqués ; Sulfur fournit les siens à l'exécution (une seule instance : mêmes traductions, même
  langue, même état de React). Les autres dépendances (définitions d'icônes
  `@fortawesome/free-solid-svg-icons`, bibliothèques npm) sont embarquées dans le paquet. Les
  icônes s'affichent avec `Icon` du SDK (`<Icon icon={faCube} className="size-4" />`), jamais en
  important `@fortawesome/react-fontawesome` : il serait embarqué et ses styles ajoutés à la page
  supplanteraient les tailles Tailwind. Les dépendances natives ne sont pas prises en charge.
- **Styles** : le CSS importé par l'interface devient `style.css`. Avec Tailwind CSS v4, partir de
  `@import '@azerxim/sulfur-sdk/module.css';` (puis `@source` vers les sources du module) : seuls
  les utilitaires du module sont produits, sur les variables du thème de Sulfur (thème clair
  compris).
- **Archive** : `packModule(dir)` écrit le paquet en un seul fichier `<id>-<version>.sulfur-module`
  (archive ZIP, `module.json` en premier) à côté du dossier, pour partager le module.
- **Installation** : Paramètres → Modules → *Modules externes* → *Installer un paquet…* : Sulfur
  vérifie l'archive, affiche le module, sa version et son auteur, puis l'installe après
  confirmation (une version installée est remplacée). Pendant le développement, le dossier du paquet
  peut aussi être copié dans le dossier des paquets (bouton *Ouvrir*). Cocher ensuite *Charger les
  modules externes* puis cliquer sur *Actualiser* (sans redémarrer Sulfur). Le descripteur est
  vérifié avant tout code ; un paquet refusé est listé avec la raison. Les paquets ne sont pas
  signés : chacun peut créer et installer son propre module ; comme un module s'exécute avec les
  droits de Sulfur, leur chargement est désactivé par défaut (voir la
  [roadmap](https://github.com/Azerxim/Sulfur/blob/main/ROADMAP.fr.md#modules-standard-et-additionnels)).

## Roadmap

Évolutions prévues de l'API des modules : [roadmap du SDK](ROADMAP.fr.md).

## Licence

[Licence Apache 2.0](LICENSE). Les modules additionnels écrits avec le SDK peuvent avoir leur propre
licence.
