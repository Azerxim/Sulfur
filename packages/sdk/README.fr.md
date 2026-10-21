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

Le paquet est publié sur GitHub Packages. Ajouter au `.npmrc` du projet du module :

```ini
@azerxim:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

`GITHUB_TOKEN` est un jeton d'accès personnel avec le droit `read:packages` (GitHub Packages en
demande un, même pour un paquet public). Puis :

```sh
npm install --save-dev @azerxim/sulfur-sdk
```

## Points d'entrée

| Import                       | Où                      | Contenu                                                                                     |
| ---------------------------- | ----------------------- | ------------------------------------------------------------------------------------------- |
| `@azerxim/sulfur-sdk`        | main et interface       | manifeste (`defineManifest`, `checkManifest`), traductions (`registerMessages`, `moduleT`, `formatTime`…), points de données (`pointKey`, `toNumber`, `FAULT_TYPES`), `withDefaults`, réseaux privés, `simulate` |
| `@azerxim/sulfur-sdk/main`   | process principal       | `ensureCertificate` (certificat TLS auto-signé), `hashPassword` / `verifyPassword` (scrypt), dossiers servis confinés (`resolveInside`, `prepareRoot`) |
| `@azerxim/sulfur-sdk/ui`     | interface (React)       | `Button`, `Card`, `Input`, `CommitInput`, `Select`, `Field`, `Checkbox`, `Tabs`, `StatusDot`, `ErrorBanner`, `Modal`, `CertificatesDialog`, `usePersistentState`, `useStoredState` |
| `@azerxim/sulfur-sdk/build`  | Node (construction)     | `buildModule` (paquet d'un module externe), `sulfurShared` (plugin Vite) |
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
  edition: 'premium',
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
import { Box } from 'lucide-react'
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

export default { manifest: DEMO_MODULE, icon: Box, Component: DemoView }
```

Traductions : `registerMessages({ en, fr }, 'demo')` puis `moduleT('demo')` ; le nom et la
description affichés viennent des clés `demo.name` et `demo.description`. Les textes communs
(`ui.start`, `errors.alreadyStarted`…) sont fournis par le SDK.

## Module externe

Un module développé hors du dépôt de Sulfur est livré sous forme de **paquet** : un dossier qui
contient son descripteur `module.json` (manifeste, groupe de la barre latérale, fichiers) et ses
fichiers construits. `buildModule` le produit avec [Vite](https://vite.dev) :

```js
// build.mjs — node build.mjs
import tailwindcss from '@tailwindcss/vite'
import { buildModule } from '@azerxim/sulfur-sdk/build'
import { DEMO_MODULE } from './src/shared/constants.js'

await buildModule({
  manifest: DEMO_MODULE,
  group: 'tools', // 'tools', 'automation' ou 'it'
  renderer: 'src/renderer/index.jsx',
  main: 'src/main/index.js', // facultatif : module sans process principal
  outDir: 'dist/demo',
  vite: { renderer: { plugins: [tailwindcss()] } }
})
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
  langue, même état de React). Les autres dépendances (`lucide-react`, bibliothèques npm) sont
  embarquées dans le paquet. Les dépendances natives ne sont pas prises en charge.
- **Styles** : le CSS importé par l'interface devient `style.css`. Avec Tailwind CSS v4, partir de
  `@import '@azerxim/sulfur-sdk/module.css';` (puis `@source` vers les sources du module) : seuls
  les utilitaires du module sont produits, sur les variables du thème de Sulfur (thème clair
  compris).
- **Installation** : copier le dossier du paquet dans le dossier des paquets (Paramètres → Modules
  → *Modules externes*, bouton *Ouvrir*), cocher *Charger les modules externes* puis cliquer sur
  *Actualiser* (sans redémarrer Sulfur ; de même après une mise à jour du paquet). Le descripteur est vérifié avant tout code ; un paquet refusé est listé avec la raison.
  Les paquets ne sont pas encore signés : leur chargement est désactivé par défaut. La signature des
  paquets vient avec la prochaine étape de la
  [roadmap](https://github.com/Azerxim/Sulfur/blob/main/ROADMAP.fr.md#éditions-standard-et-premium).

## Licence

[Licence Apache 2.0](LICENSE). Les modules premium écrits avec le SDK peuvent avoir leur propre
licence.
