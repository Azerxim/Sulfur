/**
 * SDK des modules Sulfur — interface (React) : composants partagés, configuration enregistrée du
 * module (usePersistentState), état mémorisé localement (useStoredState), instances des modules
 * (InstancesPage, useInstances), onglets apportés par d'autres modules (useExtensions) et dialogue
 * des certificats.
 */
import '../locales/index.js'
export * from './components.jsx'
export { default as CertificatesDialog } from './CertificatesDialog.jsx'
export { usePersistentState } from './module-config.js'
export { InstancesPage, useInstanceStatuses, useInstances } from './instances.jsx'
export { useExtensions } from './extensions.jsx'
