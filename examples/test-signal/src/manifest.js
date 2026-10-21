/**
 * Manifeste du module (recopié dans module.json par buildModule). Objet simple, sans import du
 * SDK : build.mjs le lit directement dans Node. Dans un module, `defineManifest` du SDK complète
 * `edition` et `apiVersion`.
 */
export const manifest = {
  id: 'test-signal',
  name: 'Test signal',
  description: 'External test module: signal generator with data points',
  version: '0.1.0',
  edition: 'standard',
  apiVersion: '1.0.0',
  minAppVersion: '0.4.0'
}

/** Réglages par défaut du générateur (section `generator` de la configuration du module). */
export const DEFAULTS = { period: 10, amplitude: 100, interval: 500 }
