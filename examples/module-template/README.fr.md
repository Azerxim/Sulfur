# Modèle de module Sulfur

[English](README.md) · **Français**

Point de départ pour votre propre module Sulfur : un compteur dans le process principal, publié comme
point de données pour le simulateur et les courbes, avec son interface, ses réglages enregistrés et
ses traductions (anglais, français). Copiez ce dossier, puis suivez le
[guide de développement de module](../../docs/module-guide.fr.md).

```sh
npm install
npm run build               # dist/my-module/ et dist/my-module-0.1.0.sulfur-module
```

Installez l'archive dans Sulfur : Paramètres → Modules → *Modules externes* → **Installer un
paquet…**, puis cochez **Charger les modules externes** et cliquez sur **Actualiser**.

Avant de partager votre module, remplacez `my-module` par votre propre identifiant
(`src/manifest.js`, `src/i18n.js`) et renseignez `name`, `description` et `author`.
