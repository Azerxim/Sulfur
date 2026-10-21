/**
 * Fonctions réservées à l'application hôte (pas aux modules) : chargement et remplacement des
 * configurations enregistrées côté interface. Elles partagent le cache de `usePersistentState`.
 */
export { flushModuleConfigs, loadModuleConfigs, replaceModuleConfigs } from '../ui/module-config.js'
