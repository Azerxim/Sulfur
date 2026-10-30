# Gestion des modules

[Documentation](README.md) · [English](../en/module-management.md) · **Français**

Les modules se gèrent dans *Paramètres → Modules*. Sulfur a deux sortes de modules :

- les modules **intégrés** (édition `standard`), livrés avec l'application et documentés dans
  [modules/](README.md#modules) ;
- les modules **externes**, écrits par n'importe qui avec le [SDK des modules](../../packages/sdk/README.fr.md)
  et installés depuis un fichier de paquet. Pour en écrire un, suivez [Créer un module](module-guide.md).

## Activer et désactiver des modules

*Paramètres → Modules → Modules activés* liste chaque module avec sa version et une case à cocher.

Un module désactivé :

- est masqué de la barre latérale, de la page d'accueil et des choix de page de démarrage ;
- est arrêté aussitôt : ses canaux IPC et ses points de données (simulateur, courbes) sont retirés ;
- n'est plus chargé au démarrage suivant ;
- garde sa configuration enregistrée, qui reste exportée et importée.

Désactiver un module dont le serveur tourne ou dont le client est connecté est refusé : arrêtez-le
d'abord. Un module réactivé est chargé immédiatement. La liste est conservée dans
`<userData>/preferences.json` (`disabledModules`).

## Modules refusés

Avant de charger un module, le process principal vérifie son [manifeste](architecture.md#manifeste).
Un module est refusé si son manifeste est invalide, si son identifiant est réservé (`modules`, `config`,
`home`, `info`, `settings`) ou déjà pris, si son API des modules est incompatible, si sa `minAppVersion`
est plus récente que Sulfur ou si son activation échoue. Un module refusé n'existe pas pour
l'application (ni canaux, ni configuration, ni page) ; il est listé avec la raison dans
*Paramètres → Modules*.

## Paquets de modules externes

Un module externe se partage sous forme de **paquet** : un fichier unique `<id>-<version>.sulfur-module`,
archive ZIP de `module.json` et des fichiers construits, produite par `packModule` du SDK.

### Installation

1. *Paramètres → Modules → Modules externes → Installer un paquet…*
2. Sulfur lit et vérifie le paquet (descripteur, fichiers, compatibilité, identifiant non utilisé par un
   module intégré), puis affiche le module, sa version, son auteur et la version déjà installée. Rien
   n'est écrit avant votre confirmation.
3. Le paquet est extrait dans `<userData>/module-packages/<id>`, à la place de la version précédente.
4. Cochez **Charger les modules externes** (désactivé par défaut), puis **Actualiser**.

La même liste supprime un paquet installé. Quand les modules externes sont chargés, Sulfur les actualise
juste après une installation ou une suppression. Les deux sont refusées tant qu'un serveur d'un module
externe tourne ou qu'un de ses clients est connecté.

### Sécurité

Les paquets ne sont **pas signés** : chacun peut créer et installer son propre module, sans aucune
approbation. Comme un module s'exécute avec les droits de Sulfur (fichiers, réseau), tenez compte de ceci :

- le chargement des modules externes est **désactivé par défaut** ;
- la confirmation d'installation rappelle que l'origine du paquet ne peut pas être vérifiée : n'installez
  que des paquets d'une source de confiance ;
- la lecture d'une archive est limitée : chemins relatifs uniquement, 2 000 fichiers, 200 Mo une fois
  extraite, CRC vérifié.
