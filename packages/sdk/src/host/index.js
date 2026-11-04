/**
 * Fonctions réservées à l'application hôte (pas aux modules) : chargement et remplacement des
 * configurations enregistrées côté interface (elles partagent le cache de `usePersistentState`) et
 * modules activés dont les onglets apportés sont fournis à leur cible (`useExtensions`).
 */
export { flushModuleConfigs, loadModuleConfigs, replaceModuleConfigs } from '../ui/module-config.js'
export { collectExtensions, setModuleExtensions } from '../ui/extensions.jsx'
