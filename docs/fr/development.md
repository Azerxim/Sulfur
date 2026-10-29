# Développement

[Documentation](README.md) · [English](../en/development.md) · **Français**

## Commandes

Prérequis : **Node.js 24** et npm.

| Commande | Rôle |
| --- | --- |
| `npm install` | Installer les dépendances |
| `npm run dev` | Lancer en développement, avec rechargement à chaud de l'interface |
| `npm run build` | Build de production dans `out/` |
| `npm run preview` | Lancer le build de production |
| `npm test` | Exécuter les tests une fois (Vitest) |
| `npm run test:watch` | Relancer les tests à chaque modification |
| `npm run lint` | Analyse statique (ESLint) |
| `npm run format` | Mettre en forme tous les fichiers (Prettier) |
| `npm run format:check` | Vérifier la mise en forme sans rien modifier (CI) |
| `npm run example:build` | Construire l'exemple de module externe dans `examples/test-signal/dist/` |
| `npm run dist:win` / `dist:linux` / `dist:mac` | Construire les installeurs dans `dist/` |

Avant de pousser, lancer les mêmes vérifications que la CI :

```bash
npm run lint && npm run format:check && npm test && npm run build
```

## Tests

Le dossier `tests/` contient un fichier par module ou par thème. La plupart sont des **tests
d'intégration exécutés contre de vrais serveurs et clients** : sockets, TLS, certificats, trames série.
Chaque test utilise un port libre (`freePort()`) et un dossier temporaire (`tempDir()`) de
`tests/helpers.js` ; les fichiers de test s'exécutent l'un après l'autre.

Ils couvrent notamment :

- chaque module de protocole : OPC UA, Modbus (TCP, TLS, RTU, ASCII), HTTP, NTP, S7, PLCSim Advanced
  (protocole du pont), MQTT, SNMP, Syslog, DNS, DHCP, LDAP, RADIUS, FTP, SFTP, TFTP, terminal série ;
- les outils : injection de défauts, flux de nœuds, enregistrement des courbes, autorité de
  certification, explorateur réseau ;
- l'application : configurations enregistrées et import / export, hôte et manifestes des modules,
  exports du SDK, paquets de modules externes (archives `.sulfur-module`, installation, mise à jour,
  suppression), modèle de module (construit, empaqueté et exécuté), mises à jour et notes de version ;
- les traductions : mêmes clés et paramètres dans chaque langue, toute clé utilisée dans le code existe.

Le test de PLCSim Advanced sur l'API Siemens réelle est ignoré sauf demande explicite, sous Windows avec
PLCSIM Advanced installé :

```bash
SULFUR_PLCSIM_LIVE=1 npm test
```

## Lint et mise en forme

- **ESLint** (`eslint.config.mjs`) : règles JavaScript recommandées, variables globales Node ou
  navigateur selon le process, règles des hooks React (`rules-of-hooks`, `exhaustive-deps`) pour
  l'interface.
- **Prettier** (`.prettierrc.json`) : sans point-virgule, guillemets simples, 120 colonnes. Les règles de
  mise en forme sont laissées à Prettier (`eslint-config-prettier`). Les fichiers Markdown ne sont pas
  reformatés.
- VS Code : les extensions recommandées (ESLint, Prettier) sont listées dans `.vscode/extensions.json`.

## Intégration continue

| Workflow | Déclencheur | Étapes |
| --- | --- | --- |
| `ci.yml` | Push sur `main`, pull requests, tags `v*` | `npm ci`, lint, vérification de la mise en forme, tests et build sous Ubuntu avec Node 24 |
| `ci.yml` (packaging) | Tags `v*` uniquement | Installeurs Windows, Linux et macOS, joints à une release GitHub en brouillon |
| `sdk.yml` | Tags `sdk-v*` | Lint et tests, puis publication du SDK sur npm et GitHub Packages |
| `cla.yml` | Pull requests | Signature du [Contributor License Agreement](../../CLA.md) |

## Packaging

```bash
npm run dist:win     # installeur NSIS → dist/Sulfur-Setup-<version>.exe (sous Windows)
npm run dist:linux   # AppImage et .deb → dist/Sulfur-<version>-x86_64.AppImage, dist/Sulfur_<version>_amd64.deb
npm run dist:mac     # DMG → dist/Sulfur-<version>-x64.dmg et dist/Sulfur-<version>-arm64.dmg (sous macOS)
```

- La configuration est dans `electron-builder.yml`.
- Icônes : `resources/icon.png` (1024 px ; Linux, icône de fenêtre, convertie en `.icns` pour macOS) et
  `resources/icon.ico` (Windows). `resources/` est embarqué avec l'application ; `build/` contient les
  ressources propres au packaging, comme `build/icons/` (icône Linux dans chaque taille standard).
- L'installeur Windows laisse choisir le dossier d'installation et crée un raccourci sur le bureau.
- Les modules natifs ne sont pas recompilés pour Electron : `serialport` fournit des binaires N-API
  précompilés, et les modules natifs facultatifs de `ssh2` ont un repli en JavaScript.
- Les installeurs ne sont **pas signés**. Leur signature et la publication sur le Microsoft Store, le Mac
  App Store, Flathub et le Snap Store sont décrites dans [Distribution](distribution.md).

## Publier une version

```bash
npm version patch          # incrémente package.json et crée le tag vX.Y.Z
git push --follow-tags
```

La CI construit les trois installeurs et les joint, avec les fichiers `latest*.yml` utilisés par les
mises à jour, à une release GitHub **en brouillon**. Relisez la release, puis publiez-la.

## Mises à jour

`src/main/updater.js` (electron-updater) consulte les releases GitHub au démarrage, puis toutes les 6
heures. La recherche peut être désactivée dans *Paramètres → Mises à jour*. Les releases en brouillon
sont ignorées : une mise à jour n'est proposée qu'une fois sa release publiée.

| Système | Comportement |
| --- | --- |
| Windows, AppImage, .deb | La mise à jour est téléchargée et installée |
| macOS | La nouvelle version est seulement signalée, avec un lien vers sa release (application non signée) |

## Publier le SDK

Le SDK des modules (`packages/sdk`) a sa propre version et son propre workflow :

1. incrémenter la version dans `packages/sdk/package.json` ;
2. pousser un tag `sdk-v<version>` de même version (par exemple `sdk-v1.1.0`) ;
3. le workflow `SDK` exécute le lint et les tests, publie sur GitHub Packages et met la version en
   attente sur npm (`npm stage publish` avec provenance ; secret `NPM_TOKEN`, jeton limité à la mise en
   attente) ;
4. un mainteneur approuve la version npm avec la 2FA :

```bash
npm stage list @azerxim/sulfur-sdk
npm stage approve <id>
```

## Contribuer

Voir [CONTRIBUTING.fr.md](../../CONTRIBUTING.fr.md) : licence et CLA, vérifications à lancer, textes en
anglais et en français, tests à ajouter.
