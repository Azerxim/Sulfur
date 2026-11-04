# Documentation de Sulfur

[English](../en/README.md) · **Français** · [Retour au projet](../../README.fr.md)

## Guides

| Guide | Contenu |
| --- | --- |
| [Démarrage](getting-started.md) | Installation, premier lancement, ports, emplacement des données |
| [Architecture](architecture.md) | Arborescence, process, hôte des modules, IPC, SDK des modules, manifestes |
| [Configurations enregistrées](configuration.md) | Persistance des réglages, import / export d'un banc de test |
| [Gestion des modules](module-management.md) | Activation et désactivation des modules, paquets de modules externes |
| [Langues et thème](i18n-and-theme.md) | Traductions, ajout d'une langue, thèmes clair et sombre |
| [Développement](development.md) | Tests, lint et mise en forme, CI, packaging, mises à jour, versions |
| [Créer un module](module-guide.md) | Écrire, construire et partager son propre module avec le SDK |
| [Distribution](distribution.md) | Signature des installeurs et publication sur les stores |

## Modules

**Protocoles industriels**

| Module | Rôle |
| --- | --- |
| [OPC UA](modules/opcua.md) | Serveur avec variables, structures, méthodes, alarmes et historique ; client complet |
| [Modbus](modules/modbus.md) | TCP, Modbus/TCP Security, RTU sur TCP, RTU / ASCII sur liaison série |
| [Siemens S7](modules/s7.md) | Automate S7comm simulé et client S7 |
| [PLCSim Advanced](modules/plcsim.md) | Pilotage des automates virtuels S7-PLCSIM Advanced (Windows) |

**Protocoles informatiques et réseau**

| Module | Rôle |
| --- | --- |
| [HTTP / REST](modules/http.md) | Serveur REST (variables, routes, webhooks) et client HTTP |
| [MQTT](modules/mqtt.md) | Broker MQTT 3.1 à 5.0 avec topics simulés, et client |
| [SNMP](modules/snmp.md) | Agent v1 / v2c / v3 avec MIB simulée et notifications, manager |
| [Syslog](modules/syslog.md) | Serveur UDP / TCP / TLS et émetteur de messages |
| [NTP](modules/ntp.md) | Serveur de temps à horloge simulée, et client |
| [DNS](modules/dns.md) | Serveur faisant autorité sur une zone de test, et client |
| [DHCP](modules/dhcp.md) | Serveur DHCP de test pour un réseau privé isolé, et client |
| [LDAP / RADIUS](modules/ldap.md) | Annuaire de test (LDAP / LDAPS) et serveur RADIUS, avec leurs clients |
| [FTP / SFTP](modules/ftp.md) | Serveurs FTP / FTPS et SFTP sur un dossier confiné, avec leurs clients |
| [TFTP](modules/tftp.md) | Serveur et client TFTP |
| [CoAP / LwM2M](modules/coap.md) | Serveur et client CoAP, serveur LwM2M et appareil LwM2M simulé |
| [Proxy TCP / UDP](modules/proxy.md) | Relais entre un client et un équipement : journal et défauts sur le trafic |

**Outils**

| Module | Rôle |
| --- | --- |
| [Simulateur](modules/simulator.md) | Injection de défauts et flux à la manière de Node-RED sur tous les modules |
| [Courbes](modules/trends.md) | Graphiques temps réel et export CSV de n'importe quel point |
| [Autorité de certification](modules/ca.md) | PKI de test : autorités, émission, signature de CSR, révocation, PKCS#12 |
| [Explorateur réseau](modules/explorer.md) | Cibles limitées aux réseaux privés |
| [Terminal série](modules/serial.md) | Terminal RS-232 / RS-485 et passerelle série ↔ TCP |

## Ailleurs dans le dépôt

- [Référence du SDK des modules](../../packages/sdk/README.fr.md) (`@azerxim/sulfur-sdk`)
- [Modèle de module](../../examples/module-template/README.fr.md) et
  [exemple de module externe](../../examples/test-signal/README.fr.md)
- [Roadmap](../../ROADMAP.fr.md) · [Contribuer](../../CONTRIBUTING.fr.md) · [Licence](../../LICENSE)
