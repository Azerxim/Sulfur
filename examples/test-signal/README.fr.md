# Module externe de test : Signal de test

[English](README.md)

Module externe minimal mais complet, à charger dans Sulfur pour essayer les modules externes :
générateur de signal (sinus, rampe, carré) dont les valeurs sont publiées comme points de données
pour le simulateur et les courbes.

| Partie             | Ce qui est exercé                                                                       |
| ------------------ | --------------------------------------------------------------------------------------- |
| process principal  | canaux `test-signal:start` / `stop` / `status` / `setpoint` / `ping`, événement `tick`, `busy()` |
| points de données  | `test-signal/sine`, `ramp`, `square`, `running` (lecture) et `setpoint` (écriture)        |
| interface          | composants du SDK, configuration enregistrée (`usePersistentState`), icône `lucide-react` |
| traductions        | anglais et français (`registerMessages`, `moduleT`), textes communs du SDK (`ui.start`)  |
| styles             | utilitaires Tailwind sur le thème de Sulfur (thème clair compris) et CSS propre          |

## Construire

Depuis la racine du dépôt (après `npm install`) :

```sh
npm run example:build
```

Le paquet est écrit dans `examples/test-signal/dist/test-signal/` (`module.json`, `main.mjs`,
`renderer.mjs`, `style.css`).

## Charger dans Sulfur

1. Paramètres → Modules → *Modules externes* : bouton **Ouvrir** (dossier des paquets, créé au
   besoin).
2. Copier le dossier `dist/test-signal` dans ce dossier : `module-packages/test-signal/module.json`.
3. Cocher **Charger les modules externes**, puis cliquer sur **Actualiser** (de même après chaque
   reconstruction du paquet : la nouvelle version est chargée sans redémarrer Sulfur).

Le module apparaît dans le groupe *Outils*, avec le badge *Externe* dans Paramètres → Modules.

Dossier des paquets : `<données utilisateur>/module-packages`, soit `~/.config/sulfur` en
développement (`npm run dev`), `~/.config/Sulfur` (Linux), `%APPDATA%\Sulfur` (Windows) ou
`~/Library/Application Support/Sulfur` (macOS) pour l'application installée.

## Hors du dépôt

L'exemple importe le SDK depuis ses sources (`../../packages/sdk`). Un module développé dans son
propre dépôt installe `@azerxim/sulfur-sdk` et importe `@azerxim/sulfur-sdk/build` (build.mjs) et
`@azerxim/sulfur-sdk/module.css` (style.css) : voir le [README du SDK](../../packages/sdk/README.fr.md#module-externe).
