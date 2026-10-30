# Langues et thème

[Documentation](README.md) · [English](../en/i18n-and-theme.md) · **Français**

La langue et le thème se choisissent dans *Paramètres → Général*. Par défaut : anglais, thème du système
d'exploitation. Les deux sont aussi mémorisés par le process principal : la fenêtre s'ouvre directement
dans le bon thème et les messages du process principal (erreurs, journaux des serveurs) sont dans la
bonne langue.

## Traductions

Les textes sont rangés dans des dictionnaires, un fichier par langue :

| Dossier | Contenu |
| --- | --- |
| `packages/sdk/src/locales/` | Textes communs aux modules : `ui`, `errors` génériques, `simulations`, `certs` |
| `src/shared/locales/` | Textes de l'application (pages, paramètres, erreurs) |
| `src/modules/<id>/shared/locales/` | Textes d'un module, clés préfixées par son identifiant |

Utilisation :

```js
t('ui.monitoring', { count: 3 }) // partout : paramètres entre accolades, ex. '{count} surveillé(s)'
const { t } = useI18n()          // dans un composant React de l'application
import { t } from '../shared/i18n' // dans un module : t = moduleT('<id>')
```

Règles :

- une clé absente d'une langue est affichée en anglais ;
- un module qui ne fournit pas la langue choisie est affiché **entièrement en anglais**, textes communs
  compris, pour ne jamais mélanger les langues sur un même écran ;
- le nom et la description affichés d'un module viennent de ses clés `<id>.name` et `<id>.description` ;
- le test `i18n` vérifie que chaque langue a les mêmes clés et les mêmes paramètres, et que toute clé
  utilisée dans le code existe.

## Ajouter une langue

Exemple pour l'allemand :

1. déclarer `de: { label: 'Deutsch', locale: 'de-DE' }` dans `packages/sdk/src/languages.js` ;
2. créer `de.js` à côté de chaque `en.js` : `packages/sdk/src/locales/`, `src/shared/locales/` et
   `src/modules/*/shared/locales/` ;
3. l'enregistrer dans le `index.js` voisin : `registerMessages({ fr, en, de })` ;
4. lancer `npm test` : le test `i18n` signale les clés manquantes.

Un module pas encore traduit est simplement affiché en anglais.

## Thème

Trois choix : sombre, clair ou celui du système. Le thème est appliqué avant l'exécution de la page (le
preload pose `data-theme` sur l'élément racine) : la fenêtre ne s'affiche jamais dans le mauvais thème.

- Les couleurs (`ink-*` pour les fonds, `sulfur-*` pour l'accent, `on-accent`) sont des variables
  Tailwind v4 déclarées dans `packages/sdk/src/ui/theme.css`.
- Le **thème clair** redéfinit ces variables, ainsi que les gris `slate` de Tailwind, sous
  `:root[data-theme='light']` dans `src/renderer/src/index.css`.
- Les composants n'ont donc pas de classes propres au thème. Le texte posé sur la couleur d'accent
  utilise `text-on-accent`.
