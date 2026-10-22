/**
 * Langues disponibles. Pour ajouter une langue :
 *  1. ajouter une entrée ici (code ISO 639-1, nom affiché, locale de formatage) ;
 *  2. créer le fichier `<code>.js` dans `src/shared/locales/` et dans `src/modules/<module>/shared/locales/`,
 *     puis le déclarer dans le `index.js` voisin.
 * Toute clé absente est affichée dans la langue par défaut (anglais). Un module qui ne fournit pas
 * la langue choisie est entièrement affiché en anglais.
 */
export const LANGUAGES = {
  fr: { label: 'Français', locale: 'fr-FR' },
  en: { label: 'English', locale: 'en-GB' }
}

/** Langue par défaut et de repli : toute langue absente (application ou module) est remplacée par l'anglais. */
export const DEFAULT_LANGUAGE = 'en'
