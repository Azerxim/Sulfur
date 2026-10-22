import { defineManifest } from '@azerxim/sulfur-sdk'
import { APP_VERSION } from '@shared/app'

/**
 * Manifeste d'un module livré avec Sulfur : version de l'application, édition standard, API des
 * modules du SDK. Un module développé hors du dépôt utilise `defineManifest` du SDK avec sa propre
 * version et sa version minimale de Sulfur.
 */
export const builtinManifest = (manifest) =>
  defineManifest({ version: APP_VERSION, minAppVersion: APP_VERSION, ...manifest })
