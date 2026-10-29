# Créer un module pour Sulfur

[Documentation](README.md) · [English](../en/module-guide.md) · **Français**

Ce guide explique comment écrire un module pour Sulfur hors de son dépôt, le construire, l'installer
et le partager. N'importe qui peut le faire : un module n'a besoin d'aucune validation ni signature.

Il part du **modèle de module** ([`examples/module-template`](../../examples/module-template)), un
petit module complet : un compteur dans le process principal, publié comme point de données, avec
son interface et ses traductions. Pour un exemple plus fourni (courbe, plusieurs points, CSS
propre), voir [`examples/test-signal`](../../examples/test-signal). La référence de l'API est le
[README du SDK](../../packages/sdk/README.fr.md) et ses déclarations TypeScript.

## Comment fonctionne un module

Un module a deux parties, qui partagent le même **manifeste** :

| Partie               | Où elle s'exécute                          | Rôle                                                                 |
| -------------------- | ------------------------------------------ | -------------------------------------------------------------------- |
| **process principal** (facultative) | Node, dans le process principal de Sulfur | serveurs, clients, accès réseau et fichiers ; canaux IPC `<id>:<action>` |
| **interface**        | React, dans la fenêtre de Sulfur           | page du module dans la barre latérale                                 |

Les deux parties n'utilisent l'application qu'à travers le **SDK** `@azerxim/sulfur-sdk` : manifeste,
contexte du process principal, points de données, traductions, composants d'interface. React et le
SDK ne sont pas embarqués dans le module : Sulfur fournit les siens à l'exécution.

Construit, un module devient un **paquet** : un dossier `module.json` + fichiers construits, puis une
archive `<id>-<version>.sulfur-module` à installer depuis les Paramètres.

> **Sécurité.** Le process principal d'un module s'exécute avec les droits de Sulfur (fichiers,
> réseau). Les paquets ne sont pas signés : Sulfur affiche l'auteur et la version avant
> l'installation, et le chargement des modules externes est désactivé par défaut. N'installez que
> vos propres modules ou ceux d'auteurs de confiance, et dites clairement aux utilisateurs de vos
> modules ce qu'ils font.

## Prérequis

- **Node.js 22** ou plus récent, et npm ;
- **Sulfur 0.4** ou plus récent, pour essayer le module.

Le SDK s'installe depuis npm, sans configuration ni jeton.

## 1. Démarrer depuis le modèle

Copiez le dossier [`examples/module-template`](../../examples/module-template) où vous voulez (c'est un
projet indépendant), puis :

```sh
npm install
npm run build
```

`npm run build` produit
`dist/my-module/` et l'archive `dist/my-module-0.1.0.sulfur-module`.

Choisissez ensuite l'identifiant de votre module (minuscules, chiffres et tirets, par exemple
`acme-gateway`) et remplacez `my-module` partout :

- `src/manifest.js` : `id`, `name`, `description`, `author` ;
- `src/i18n.js` : la clé de premier niveau des traductions et le second argument de
  `registerMessages` / `moduleT` ;
- `package.json` : `name` et `description` (pour npm seulement).

L'identifiant préfixe les canaux IPC, les points de données (`<id>/<point>`), la configuration
enregistrée et le dossier d'installation : il ne doit plus changer une fois le module partagé, et ne
doit pas être celui d'un module de Sulfur.

```text
my-module/
  package.json, build.mjs
  src/
    manifest.js         manifeste (defineManifest) et réglages par défaut
    i18n.js             traductions (anglais, français)
    main/index.js       process principal : export par défaut { manifest, activate, … }
    renderer/index.jsx  interface : export par défaut { manifest, icon, Component }
    renderer/style.css  styles Tailwind sur le thème de Sulfur
```

## 2. Le manifeste

```js
export const manifest = defineManifest({
  id: 'my-module',
  name: 'My module', // nom de repli ; le nom affiché vient de la clé `my-module.name`
  description: 'Counter published as a data point',
  version: '0.1.0', // version du module (semver), à augmenter à chaque publication
  author: 'Your name', // affiché avant l'installation
  edition: 'additional',
  minAppVersion: '0.4.0' // version minimale de Sulfur
})
```

`defineManifest` ajoute `apiVersion`, la version de l'API des modules du SDK installé. Sulfur refuse
un module dont l'API ou `minAppVersion` ne lui conviennent pas, avec la raison dans Paramètres →
Modules.

## 3. Le process principal

`src/main/index.js` exporte par défaut un objet `{ manifest, activate(ctx), deactivate(), busy(),
migrateConfig() }`. Seuls `manifest` et `activate` sont obligatoires.

```js
export default {
  manifest,
  activate(ctx) {
    ctx.handle('start', (options) => start(options)) // canal my-module:start
    ctx.expose({ name: t('my-module.name'), points: () => POINTS, read, write })
  },
  busy: () => timer !== null,
  deactivate() {
    stop()
  }
}
```

Le contexte `ctx` :

| Membre                      | Rôle                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| `ctx.handle(action, fn)`    | canal `<id>:<action>` appelé par l'interface ; le résultat (ou l'erreur levée) lui est renvoyé |
| `ctx.emit(event, payload)`  | événement `<id>:<event>` diffusé à l'interface                                              |
| `ctx.config()`              | configuration enregistrée du module (`{ <section>: valeur }`, écrite par l'interface)       |
| `ctx.setConfig(section, v)` | remplace une section de cette configuration                                                 |
| `ctx.expose(api)`           | publie les points de données du module (voir plus bas)                                      |
| `ctx.peers()`               | points publiés par les autres modules actifs                                                |
| `ctx.dataDir`               | dossier de données propre au module (`<données utilisateur>/modules/<id>`)                  |
| `ctx.log(...)`              | journal du process principal (visible en lançant Sulfur depuis un terminal)                 |

- **Erreurs** : levez une `Error` avec un message traduit (`t('my-module.errors.…')`) ; l'interface
  la reçoit telle quelle.
- **`busy()`** : retourne `true` quand un serveur tourne ou qu'un client est connecté. Sulfur refuse
  alors de désactiver, mettre à jour ou supprimer le module, et d'importer une configuration.
- **`deactivate()`** : arrêtez tout (serveurs, minuteries, sockets) : le module peut être désactivé
  ou rechargé sans redémarrer Sulfur.
- **`migrateConfig(config)`** : convertit une configuration enregistrée par une version antérieure
  du module (au chargement comme à l'import).
- `@azerxim/sulfur-sdk/main` fournit des outils pour les serveurs : certificat TLS auto-signé
  (`ensureCertificate`), mots de passe hachés (`hashPassword`), dossiers servis confinés
  (`resolveInside`).

Les dépendances npm du process principal sont embarquées dans le paquet ; les modules natifs (avec
du code compilé) ne sont pas pris en charge.

## 4. L'interface

`src/renderer/index.jsx` exporte par défaut `{ manifest, icon, Component }` : l'icône de la barre
latérale (un composant [lucide-react](https://lucide.dev/icons)) et le composant React de la page.

```jsx
const invoke = (action, ...args) => window.sulfur.invoke(`${ID}:${action}`, ...args)

function MyModuleView() {
  const [settings, setSettings] = usePersistentState(ID, 'counter', DEFAULTS)
  const [state, setState] = useState(null)
  useEffect(() => window.sulfur.on(`${ID}:state`, setState), []) // retourne le désabonnement
  return (
    <Card title={t('my-module.counter')}>
      <Button onClick={() => invoke('start', settings).then(setState)}>{t('ui.start')}</Button>
    </Card>
  )
}
```

- **Composants** (`@azerxim/sulfur-sdk/ui`) : `Button`, `Card`, `Input`, `CommitInput`, `Select`,
  `Field`, `Checkbox`, `Tabs`, `StatusDot`, `ErrorBanner`, `Modal`… Ils suivent le thème et la langue
  de Sulfur.
- **Réglages enregistrés** : `usePersistentState(id, section, défauts)` remplace `useState` ; la
  valeur est enregistrée, restaurée au démarrage, exportée avec les configurations de Sulfur, et
  lisible côté process principal par `ctx.config()[section]`.
- **Styles** : `style.css` importe `@azerxim/sulfur-sdk/module.css` ; seuls les utilitaires Tailwind
  utilisés par le module sont produits, sur les couleurs du thème (`ink`, `slate`, `sulfur`…), thème
  clair compris. Préfixez vos propres classes CSS par l'identifiant du module.

## 5. Les traductions

`registerMessages({ en, fr }, '<id>')` déclare les textes, `moduleT('<id>')` donne la fonction `t`.
Les clés sont préfixées par l'identifiant ; `<id>.name` et `<id>.description` sont le nom et la
description affichés. Les textes communs (`ui.start`, `ui.stop`…) viennent du SDK. Si votre module ne
fournit pas la langue choisie, il s'affiche entièrement en anglais.

## 6. Les points de données

Les points publiés par `ctx.expose` apparaissent dans le **simulateur** (flux, scénarios) et les
**courbes** sous la clé `<id>/<point>` :

```js
ctx.expose({
  name: t('my-module.name'),
  points: () => [{ id: 'value', group: 'server', name: 'value', dataType: 'Double', numeric: true, writable: false }],
  read: (ids) => Object.fromEntries(ids.map((id) => [id, values[id]])),
  write: async (id, value) => {
    /* lever une erreur traduite si impossible */
  }
})
```

`faultTypes()` et `setFaults()` (facultatifs) ajoutent l'injection de défauts du simulateur (délai,
absence de réponse, coupure…).

## 7. Construire, installer, essayer

```sh
npm run build
```

1. Dans Sulfur : **Paramètres → Modules → Modules externes → Installer un paquet…**, choisissez
   `dist/<id>-<version>.sulfur-module` et confirmez.
2. Cochez **Charger les modules externes**, puis **Actualiser**. Le module apparaît dans la barre
   latérale, avec le badge *Externe* dans Paramètres → Modules.

**Pendant le développement**, il est plus rapide de copier (ou de lier) le dossier `dist/<id>` dans le
dossier des paquets (bouton **Ouvrir** de la même carte), puis de cliquer sur **Actualiser** après
chaque `npm run build` : la nouvelle version est chargée sans redémarrer Sulfur. Le dossier des
paquets est `<données utilisateur>/module-packages` : `~/.config/Sulfur` (Linux), `%APPDATA%\Sulfur`
(Windows), `~/Library/Application Support/Sulfur` (macOS).

**Dépannage** :

- un module refusé est listé dans Paramètres → Modules avec la raison (manifeste invalide, API
  incompatible, identifiant déjà pris, fichier manquant…) ;
- lancez Sulfur depuis un terminal pour voir `ctx.log` et les erreurs du process principal ;
- une interface qui ne se charge pas est aussi listée dans Paramètres → Modules ; pour la déboguer,
  lancez Sulfur depuis ses sources (`npm run dev`) et ouvrez les outils de développement avec F12.

## 8. Publier et partager

- Augmentez `version` dans le manifeste, reconstruisez, et partagez le fichier
  `<id>-<version>.sulfur-module` (release GitHub, site, message…). L'installer par-dessus une version
  installée la remplace ; la configuration du module est conservée (`migrateConfig` si son format a
  changé).
- Indiquez `author` et une description claire : c'est ce que voit l'utilisateur avant de confirmer.
- Gardez le même `id` d'une version à l'autre.
- Choisissez librement la licence de votre module.

## Compatibilité

Le module est écrit pour l'API du SDK installé (`apiVersion`). L'API suit le versionnage
sémantique : un module écrit pour l'API 1.1 fonctionne avec tout Sulfur qui fournit une API 1.x à
partir de 1.1, pas avec une API 2.x. Mettez `minAppVersion` à la plus ancienne version de Sulfur sur
laquelle vous avez essayé le module.
