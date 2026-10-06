/**
 * Contrat commun à tous les modules de simulation.
 *
 * Un module est composé de deux parties :
 *  - une partie "main" (process Electron/Node) : objet { manifest, activate(ctx), deactivate() }
 *    qui expose des handlers IPC nommés `<moduleId>:<action>` et peut émettre des événements ;
 *  - une partie "renderer" (React) : objet { manifest, icon, Component } qui fournit l'interface.
 *
 * manifest = { id, name, description } — `id` sert de préfixe aux canaux IPC.
 */

/** Format d'un canal IPC : `<moduleId>:<action>` */
export const IPC_CHANNEL_PATTERN = /^[a-z0-9-]+:[a-zA-Z0-9:._-]+$/
