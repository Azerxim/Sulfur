# Sulfur

[![CI](https://github.com/Azerxim/Sulfur/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Azerxim/Sulfur/actions/workflows/ci.yml?query=branch%3Amain)
[![Release](https://img.shields.io/github/v/release/Azerxim/Sulfur)](https://github.com/Azerxim/Sulfur/releases/latest)
[![SDK](https://img.shields.io/npm/v/@azerxim/sulfur-sdk?label=SDK)](https://www.npmjs.com/package/@azerxim/sulfur-sdk)

[English](README.md) · **Français**

**Sulfur** est un simulateur de bureau modulaire pour protocoles industriels et informatiques. Chaque
module fournit un **serveur** et un **client** simulés, pour tester équipements, logiciels de supervision
et intégrations sans l'installation réelle, et reproduire des défauts à la demande. Des outils transverses
injectent des défauts, enchaînent des comportements dans des flux à la manière de Node-RED et tracent
n'importe quelle valeur.

- Windows, Linux et macOS ; interface en anglais et en français, thème clair ou sombre.
- Extensible : chacun peut écrire son propre module avec le [SDK des modules](packages/sdk/README.fr.md),
  sans approbation ni signature.
- Réalisé avec Electron, React et TailwindCSS v4. Licence : [Apache-2.0](LICENSE).

## Modules

| Famille | Modules |
| --- | --- |
| Protocoles industriels | [OPC UA](docs/fr/modules/opcua.md) · [Modbus](docs/fr/modules/modbus.md) (TCP, TLS, RTU, ASCII) · [Siemens S7](docs/fr/modules/s7.md) · [PLCSim Advanced](docs/fr/modules/plcsim.md) |
| Protocoles informatiques et réseau | [HTTP / REST](docs/fr/modules/http.md) · [MQTT](docs/fr/modules/mqtt.md) · [SNMP](docs/fr/modules/snmp.md) · [Syslog](docs/fr/modules/syslog.md) · [NTP](docs/fr/modules/ntp.md) · [DNS](docs/fr/modules/dns.md) · [DHCP](docs/fr/modules/dhcp.md) · [LDAP / RADIUS](docs/fr/modules/ldap.md) · [FTP / SFTP](docs/fr/modules/ftp.md) · [TFTP](docs/fr/modules/tftp.md) · [Proxy TCP / UDP](docs/fr/modules/proxy.md) |
| Outils | [Simulateur](docs/fr/modules/simulator.md) (défauts et flux) · [Courbes](docs/fr/modules/trends.md) · [Autorité de certification](docs/fr/modules/ca.md) · [Explorateur réseau](docs/fr/modules/explorer.md) · [Terminal série](docs/fr/modules/serial.md) |

## Installation

Téléchargez l'installeur de votre système depuis la
[dernière release](https://github.com/Azerxim/Sulfur/releases/latest) : `.exe` (Windows), `.AppImage` ou
`.deb` (Linux), `.dmg` (macOS). Les installeurs ne sont pas encore signés : voir
[Démarrage](docs/fr/getting-started.md#installer-une-version-publiée) pour le premier lancement.

## Développement

Prérequis : **Node.js 24** et npm.

```bash
npm install
npm run dev        # lancement en développement (rechargement à chaud)
npm test           # tests automatisés (Vitest)
npm run build      # build de production dans out/
```

Avant de pousser, lancer les mêmes vérifications que la CI :

```bash
npm run lint && npm run format:check && npm test && npm run build
```

Toutes les commandes, les tests, la CI, le packaging et les versions : [Développement](docs/fr/development.md).

## Documentation

La documentation complète est dans [docs/fr/](docs/fr/README.md) :

- [Démarrage](docs/fr/getting-started.md) : installation, premiers pas, ports par défaut, emplacement des données
- [Architecture](docs/fr/architecture.md) : process, hôte des modules, IPC, points de données, SDK, manifestes
- [Configurations enregistrées](docs/fr/configuration.md) : persistance des réglages, import / export
- [Gestion des modules](docs/fr/module-management.md) : activation des modules, installation de paquets externes
- [Langues et thème](docs/fr/i18n-and-theme.md) : traductions, ajout d'une langue, thèmes
- [Créer un module](docs/fr/module-guide.md) : écrire, construire et partager son propre module
- [Distribution](docs/fr/distribution.md) : signature des installeurs et publication sur les stores

Voir la [roadmap](ROADMAP.fr.md) pour la suite.

## Contribution et licence

Les contributions sont les bienvenues : voir [CONTRIBUTING.fr.md](CONTRIBUTING.fr.md). Chaque
contributeur signe une fois le [Contributor License Agreement](CLA.md), à sa première pull request.

Sulfur est distribué sous [licence Apache 2.0](LICENSE) — Copyright © 2026 Maxime MALLET. Les modules de
ce dépôt sont les modules **standard** ; des modules **additionnels**, distribués en paquets séparés, sont
prévus, et chacun peut créer son propre module avec le SDK (voir la
[roadmap](ROADMAP.fr.md#modules-standard-et-additionnels)).
