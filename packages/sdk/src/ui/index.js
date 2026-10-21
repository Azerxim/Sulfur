/**
 * SDK des modules Sulfur — interface (React) : composants partagés, configuration enregistrée du
 * module (usePersistentState), état mémorisé localement (useStoredState) et dialogue des
 * certificats.
 */
import '../locales/index.js'
export * from './components.jsx'
export { default as CertificatesDialog } from './CertificatesDialog.jsx'
export { usePersistentState } from './module-config.js'
