# Roadmap du SDK des modules

[English](ROADMAP.md) · **Français**

Évolutions prévues de l'API des modules (`@azerxim/sulfur-sdk`). La version du paquet est la
version de l'API des modules : les nouveaux exports et les champs facultatifs arrivent dans une
version mineure, retirer ou modifier un export demande une nouvelle version majeure. La partie
application (hôte des modules, Paramètres, modules intégrés) est dans la
[roadmap de Sulfur](https://github.com/Azerxim/Sulfur/blob/main/ROADMAP.fr.md#modules-standard-et-additionnels).

## API des modules 1.2

- [ ] **Extensions de modules** : un module ajoute un onglet à la page d'un autre module, pour
  qu'un module additionnel complète un module standard au lieu d'avoir sa propre page (onglet
  S7CommPlus du module Siemens S7 apporté par Siemens S7 Enhanced, onglet PubSub du module
  OPC UA…).
  - `RendererModule.extensions` (facultatif) : `[{ target, tab: { id, label, icon, Component } }]`,
    `target` étant l'identifiant du module complété ; `id` unique dans la page visée.
  - `useExtensions(target)` (`@azerxim/sulfur-sdk/ui`) : onglets apportés à un module, lus par ce
    module pour les afficher après ses propres onglets ; vide si rien ne le complète.
  - Propriétés d'un onglet apporté : identifiant du module visé et du module qui l'apporte ;
    l'onglet appelle les canaux IPC de son propre module (`<son id>:<action>`), jamais ceux du
    module visé.
  - Manifeste : champ facultatif `extends: [<id visé>]`, affiché avant l'installation ; un module
    dont la cible est absente ou désactivée se charge quand même, ses onglets ne sont simplement
    pas affichés.
  - Déclarations TypeScript et guide des modules mis à jour ; exemple dans le modèle de module.

## API des modules 1.3

- [ ] **Licences et mode d'essai** des modules payants (voir la
  [roadmap de Sulfur](https://github.com/Azerxim/Sulfur/blob/main/ROADMAP.fr.md#modules-standard-et-additionnels)) ;
  un module sans ce champ reste gratuit, rien ne change pour lui.
  - Manifeste : champ facultatif `license: { trialDays, purchaseUrl, publicKey }` (durée de l'essai,
    30 jours par défaut ; page d'achat ; clé publique Ed25519 de l'éditeur), affiché avant
    l'installation.
  - `ctx.license` (process principal) et `useLicense()` (`@azerxim/sulfur-sdk/ui`) : état
    (`trial`, `licensed`, `expired`), jours d'essai restants, titulaire et fin de maintenance de la
    licence, événement à chaque changement ; le module décide de ce qu'il limite selon l'état.
  - Vérification de la signature du fichier de licence dans le SDK, hors ligne ; outil en ligne de
    commande `sulfur-license` (`@azerxim/sulfur-sdk/license`) pour générer la paire de clés de
    l'éditeur et signer les licences.
  - Déclarations TypeScript, guide des modules (section modules payants) et tests.
