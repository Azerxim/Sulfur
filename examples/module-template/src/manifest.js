/**
 * Manifeste du module, recopié dans module.json par buildModule. Changer `id` (préfixe des canaux
 * IPC et des points, `[a-z0-9-]+`), `name`, `description` et `author` ; augmenter `version` à chaque
 * publication. `defineManifest` complète `edition` et `apiVersion` (celle du SDK installé).
 */
import { defineManifest } from '@azerxim/sulfur-sdk'

export const manifest = defineManifest({
  id: 'my-module',
  name: 'My module',
  description: 'Counter published as a data point',
  version: '0.1.0',
  author: 'Your name',
  edition: 'additional',
  minAppVersion: '0.4.0'
})

/** Réglages par défaut (section `counter` de la configuration enregistrée du module). */
export const DEFAULTS = { interval: 1000, step: 1 }
