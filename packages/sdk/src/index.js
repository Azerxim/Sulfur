/**
 * SDK des modules Sulfur — point d'entrée partagé par le process principal et l'interface :
 * traductions, langues, manifeste, paquets de modules, points de données, configuration, réseaux
 * et générateurs de valeurs. Voir aussi `@azerxim/sulfur-sdk/main` (Node) et `@azerxim/sulfur-sdk/ui` (React).
 */
export * from './i18n.js'
export { DEFAULT_LANGUAGE, LANGUAGES } from './languages.js'
export * from './manifest.js'
export * from './package.js'
export * from './points.js'
export * from './config.js'
export * from './networks.js'
export * from './simulator.js'
import './locales/index.js'
