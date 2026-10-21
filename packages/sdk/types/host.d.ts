/** Fonctions réservées à l'application hôte (pas aux modules). */
export function loadModuleConfigs(moduleIds: string[]): Promise<void>
export function flushModuleConfigs(): void
export function replaceModuleConfigs(modules: Record<string, Record<string, unknown>>): void
