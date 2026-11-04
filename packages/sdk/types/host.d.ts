import type { ExtensionEntry, RendererModule } from './ui.js'

/** Fonctions réservées à l'application hôte (pas aux modules). */
export function loadModuleConfigs(moduleIds: string[]): Promise<void>
export function flushModuleConfigs(): void
export function replaceModuleConfigs(modules: Record<string, Record<string, unknown>>): void
/** Onglets apportés par les modules `modules` (activés), après vérification. */
export function collectExtensions(modules: RendererModule[]): ExtensionEntry[]
/** Modules activés dont les onglets apportés sont fournis à leur cible (useExtensions). */
export function setModuleExtensions(modules: RendererModule[]): void
