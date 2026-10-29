# Démarrage

[Documentation](README.md) · [English](../en/getting-started.md) · **Français**

## Installer une version publiée

Les installeurs sont joints aux [releases GitHub](https://github.com/Azerxim/Sulfur/releases/latest) :

| Système | Fichier |
| --- | --- |
| Windows | `Sulfur-Setup-<version>.exe` (installeur NSIS, choix du dossier, raccourci sur le bureau) |
| Linux | `Sulfur-<version>-x86_64.AppImage` ou `Sulfur_<version>_amd64.deb` |
| macOS | `Sulfur-<version>-x64.dmg` (Intel) ou `Sulfur-<version>-arm64.dmg` (Apple silicon) |

Les installeurs ne sont pas encore signés :

- Windows affiche l'avertissement SmartScreen : *Informations complémentaires → Exécuter quand même* ;
- macOS bloque le premier lancement : clic droit sur l'application → *Ouvrir*, ou
  `xattr -cr /Applications/Sulfur.app`.

Sulfur recherche ensuite lui-même les nouvelles versions (voir [Mises à jour](development.md#mises-à-jour)).

## Lancer depuis les sources

Prérequis : **Node.js 24** et npm.

```bash
git clone https://github.com/Azerxim/Sulfur.git
cd Sulfur
npm install
npm run dev
```

`npm run dev` lance l'application avec rechargement à chaud de l'interface. Voir
[Développement](development.md) pour les autres commandes.

## Premiers pas

La barre latérale liste les modules, suivis de trois pages :

- **Accueil** : présentation de Sulfur, étapes de prise en main et modules regroupés par famille ;
- **Informations** : nom d'hôte, système, versions et adresses de chaque interface réseau (utile pour
  diriger un client distant vers Sulfur) ;
- **Paramètres** : trois onglets.
  - *Général* : langue, thème, page affichée au démarrage, import / export des configurations ;
  - *Modules* : modules activés, paquets de modules externes (voir [Gestion des modules](module-management.md)) ;
  - *Mises à jour* : recherche automatique des nouvelles versions.

Une session type :

1. ouvrir un module de protocole (par exemple **Modbus**), configurer le serveur et le démarrer ;
2. s'y connecter depuis l'onglet client du même module, ou depuis un client externe, sur `localhost`
   et le port affiché ;
3. utiliser le **Simulateur** pour injecter des défauts ou exécuter des flux, et **Courbes** pour tracer
   les valeurs.

Les réglages sont enregistrés au fil des modifications et restaurés au lancement suivant, mais **les
serveurs ne sont jamais démarrés automatiquement**.

## Ports par défaut

Les ports par défaut sont supérieurs à 1024 pour ne pas exiger de droits administrateur sous Linux.
Chaque port se modifie dans son module.

| Module | Port par défaut | Port standard |
| --- | --- | --- |
| OPC UA | 4840 | 4840 |
| Modbus | 5020 (TCP), 8020 (TLS) | 502, 802 |
| Siemens S7 | 1102 | 102 |
| PLCSim Advanced (PC distant) | 50000 | 50000 |
| HTTP / REST | 8080 | 80, 443 |
| MQTT | 1883, 8883 (TLS) | 1883, 8883 |
| SNMP | 1161 (agent), 1162 (notifications) | 161, 162 |
| Syslog | 1514 (UDP / TCP), 6514 (TLS) | 514, 6514 |
| NTP | 1123 (UDP) | 123 |
| DNS | 1053 (UDP / TCP) | 53 |
| DHCP | 67 / 68 (UDP) | 67 / 68 |
| LDAP | 1636 (LDAPS), 1389 (LDAP) | 636, 389 |
| RADIUS | 1812 (authentification), 1813 (comptabilité) | 1812, 1813 |
| FTP / SFTP | 2121 (FTP), 2222 (SFTP) | 21, 22 |
| TFTP | 6969 (UDP) | 69 |
| Passerelle série ↔ TCP | 4001 | — |

Sous Linux, les ports inférieurs à 1024 demandent des droits administrateur ou la capacité
`CAP_NET_BIND_SERVICE`. Sous Windows, le port 102 est souvent pris par les services Siemens (TIA Portal,
PLCSIM).

## Emplacement des données

Sulfur conserve ses données dans le dossier de données utilisateur :

| Système | Dossier |
| --- | --- |
| Windows | `%APPDATA%\sulfur\` |
| Linux | `~/.config/sulfur/` |
| macOS | `~/Library/Application Support/sulfur/` |

| Chemin | Contenu |
| --- | --- |
| `preferences.json` | Langue, thème, modules désactivés, chargement des modules externes, mises à jour automatiques |
| `modules/<id>/config.json` | Réglages enregistrés d'un module (voir [Configurations enregistrées](configuration.md)) |
| `modules/<id>/pki/` | Magasins de certificats des modules qui utilisent TLS (OPC UA, Modbus, LDAP…) |
| `modules/ca/authorities/` | Autorités du module Autorité de certification |
| `module-packages/<id>/` | Modules externes installés |

Supprimer le dossier d'un module le réinitialise ; ses certificats sont régénérés au démarrage suivant.
