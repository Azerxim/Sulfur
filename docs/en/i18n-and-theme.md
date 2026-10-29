# Languages and theme

[Documentation](README.md) · **English** · [Français](../fr/i18n-and-theme.md)

Language and theme are chosen in *Settings → General*. Defaults: English, theme of the operating
system. Both are also remembered by the main process, so that the window opens directly in the right
theme and the messages of the main process (errors, server logs) are in the right language.

## Translations

Strings are stored in dictionaries, one file per language:

| Folder | Content |
| --- | --- |
| `packages/sdk/src/locales/` | Strings common to the modules: `ui`, generic `errors`, `simulations`, `certs` |
| `src/shared/locales/` | Strings of the application (pages, settings, errors) |
| `src/modules/<id>/shared/locales/` | Strings of a module, with keys prefixed by its identifier |

Usage:

```js
t('ui.monitoring', { count: 3 }) // anywhere: parameters between braces, e.g. '{count} monitored'
const { t } = useI18n()          // in an application React component
import { t } from '../shared/i18n' // inside a module: t = moduleT('<id>')
```

Rules:

- a key missing from a language is displayed in English;
- a module that does not provide the selected language is displayed **entirely in English**, common
  strings included, so that languages are never mixed on one screen;
- the displayed name and description of a module come from its `<id>.name` and `<id>.description`
  keys;
- the `i18n` test checks that every language has the same keys and the same parameters, and that every
  key used in the code exists.

## Adding a language

Example for German:

1. declare `de: { label: 'Deutsch', locale: 'de-DE' }` in `packages/sdk/src/languages.js`;
2. create `de.js` next to each `en.js`: `packages/sdk/src/locales/`, `src/shared/locales/` and
   `src/modules/*/shared/locales/`;
3. register it in the neighbouring `index.js`: `registerMessages({ fr, en, de })`;
4. run `npm test`: the `i18n` test reports the missing keys.

A module that is not translated yet is simply shown in English.

## Theme

Three choices: dark, light or system. The theme is applied before the page runs (the preload sets
`data-theme` on the root element), so the window never flashes in the wrong theme.

- The color tokens (`ink-*` backgrounds, `sulfur-*` accent, `on-accent`) are Tailwind v4 variables
  declared in `packages/sdk/src/ui/theme.css`.
- The **light theme** redefines these variables, and Tailwind's `slate` grays, under
  `:root[data-theme='light']` in `src/renderer/src/index.css`.
- Components therefore have no theme-specific classes. Text placed on the accent color uses
  `text-on-accent`.
