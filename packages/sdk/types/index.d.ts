/**
 * SDK des modules Sulfur — contrat des modules et code partagé par le process principal et
 * l'interface. API des modules : MODULE_API_VERSION (versionnage sémantique).
 */

// --- Manifeste ---------------------------------------------------------------------------------

export type Edition = 'standard' | 'additional'

export interface ModuleManifest {
  /** Identifiant, préfixe des canaux IPC (`[a-z0-9-]+`), unique. */
  id: string
  /** Nom de repli (le nom affiché vient de la clé `<id>.name`). */
  name: string
  /** Description de repli (clé `<id>.description`). */
  description?: string
  /** Version du module (semver). */
  version: string
  edition: Edition
  /** Version de l'API des modules pour laquelle le module est écrit (semver). */
  apiVersion: string
  /** Version minimale de Sulfur (semver). */
  minAppVersion: string
}

export const MODULE_API_VERSION: string
export const EDITIONS: Edition[]
export const MODULE_ID_PATTERN: RegExp
export const RESERVED_MODULE_IDS: string[]
export const IPC_CHANNEL_PATTERN: RegExp

export interface ParsedVersion {
  major: number
  minor: number
  patch: number
  prerelease: string[]
}

export function parseVersion(text: string): ParsedVersion | null
export function compareVersions(a: string | ParsedVersion, b: string | ParsedVersion): number

/** Manifeste complété : édition standard et API de ce SDK par défaut. */
export function defineManifest(
  manifest: Omit<ModuleManifest, 'edition' | 'apiVersion'> & Partial<Pick<ModuleManifest, 'edition' | 'apiVersion'>>
): ModuleManifest

export type ManifestProblemReason = 'invalid' | 'reservedId' | 'duplicateId' | 'apiMajor' | 'apiTooNew' | 'appTooOld'

export interface ManifestProblem {
  /** Libellé : `modules.problems.<reason>` (dictionnaire de l'application). */
  reason: ManifestProblemReason
  params: Record<string, string>
}

/** Premier problème d'un manifeste, ou null si le module peut être chargé. */
export function checkManifest(
  manifest: unknown,
  options: { appVersion: string; apiVersion?: string; loadedIds?: string[] }
): ManifestProblem | null

// --- Paquets de modules externes ---------------------------------------------------------------

export type ModuleGroup = 'tools' | 'automation' | 'it'

/** Descripteur `module.json` d'un paquet de module externe. */
export interface ModulePackage extends ModuleManifest {
  /** Groupe de la barre latérale. */
  group: ModuleGroup
  /** Interface : module ES dont l'export par défaut est un `RendererModule` (`@azerxim/sulfur-sdk/ui`). */
  renderer: string
  /** Process principal (facultatif) : module ES dont l'export par défaut est un `MainModule`. */
  main?: string
  /** Feuille de style de l'interface (facultative). */
  style?: string
}

export const MODULE_PACKAGE_FILE: string
export const MODULE_GROUPS: ModuleGroup[]
/** Propriété de `globalThis` où l'application publie les modules partagés. */
export const SHARED_GLOBAL: string
/** Imports fournis par l'application, par côté : ils ne sont pas embarqués dans un paquet. */
export const SHARED_MODULES: { main: string[]; renderer: string[] }

/** Fichiers d'un descripteur vérifiés : premier problème, ou null. */
export function checkPackage(descriptor: unknown): ManifestProblem | null
/** Manifeste contenu dans un descripteur `module.json`. */
export function packageManifest(descriptor: unknown): Partial<ModuleManifest>

// --- Partie "main" d'un module -------------------------------------------------------------------

/** Contexte passé à `activate(ctx)` par l'application. */
export interface ModuleContext {
  /** Dossier de données persistant propre au module (`<userData>/modules/<id>`). */
  dataDir: string
  /** Enregistre le canal IPC `<id>:<action>` ; le résultat (ou l'erreur) est renvoyé à l'interface. */
  handle(action: string, fn: (...args: any[]) => unknown): void
  /** Diffuse l'événement `<id>:<event>` à toutes les fenêtres. */
  emit(event: string, payload?: unknown): void
  /** Configuration enregistrée du module : `{ <section>: valeur }`. */
  config(): Record<string, unknown>
  /** Remplace une section de la configuration enregistrée (état propre au process principal). */
  setConfig(section: string, value: unknown): void
  /** Publie les points de données du module pour les autres modules (simulateur, courbes). */
  expose(api: PointsApi): void
  /** Points publiés par les autres modules actifs. */
  peers(): { id: string; api: PointsApi }[]
  log(...args: unknown[]): void
}

export interface MainModule {
  manifest: ModuleManifest
  activate(ctx: ModuleContext): void | Promise<void>
  deactivate?(): void | Promise<void>
  /** Serveur démarré ou client connecté : désactivation et import de configuration refusés. */
  busy?(): boolean
  /** Convertit une configuration d'une version antérieure (chargement et import). */
  migrateConfig?(config: Record<string, unknown>): Record<string, unknown>
}

// --- Points de données ---------------------------------------------------------------------------

export interface Point {
  /** Identifiant local au module (hors du module : `<moduleId>/<id>`). */
  id: string
  group: 'server' | 'client'
  name: string
  dataType: string
  numeric: boolean
  writable: boolean
}

export type FaultTypeName = 'delay' | 'noResponse' | 'cut' | 'exception' | 'badStatus' | 'kissOfDeath' | 'freeze'

export interface FaultType {
  type: FaultTypeName
  /** Codes proposés pour une réponse forcée. */
  codes?: { value: number | string; label: string }[]
  /** Défaut qui porte sur des points choisis (valeurs figées). */
  points?: true
}

export interface ActiveFault {
  id: string
  type: FaultTypeName
  params?: Record<string, unknown>
  points?: string[]
}

export interface PointsApi {
  /** Nom affiché du module. */
  name: string
  points(): Point[]
  /** Valeurs courantes (undefined si indisponible). */
  read(ids: string[]): Record<string, unknown>
  /** Écrit une valeur ; lève une erreur traduite si impossible. */
  write(id: string, value: unknown): Promise<unknown>
  faultTypes?(): FaultType[]
  setFaults?(faults: ActiveFault[]): void
}

export const FAULT_TYPES: FaultTypeName[]
export function pointKey(moduleId: string, id: string): string
export function parsePointKey(key: string): { moduleId: string; id: string }
/** Valeur numérique pour un graphique ou un CSV (booléen → 0 / 1), null sinon. */
export function toNumber(value: unknown): number | null

// --- Traductions ---------------------------------------------------------------------------------

export type Messages = { [key: string]: string | Messages }
export type Translate = (key: string, params?: Record<string, unknown> | null, fallback?: string) => string

export const LANGUAGES: Record<string, { label: string; locale: string }>
export const DEFAULT_LANGUAGE: string

/** Enregistre des textes par langue ; `namespace` : identifiant du module qui les fournit. */
export function registerMessages(byLanguage: Record<string, Messages>, namespace?: string): void
export const t: Translate
/** Traduction propre à un module (anglais si le module ne fournit pas la langue courante). */
export function moduleT(namespace: string): Translate
export function moduleLanguage(namespace: string): string
export function getLanguage(): string
export function getLocale(): string
export function setLanguage(lang: string): string
export function onLanguageChange(fn: (lang: string) => void): () => void
export function formatTime(date: Date | string | number): string
export function formatDate(date: Date | string | number): string

// --- Configuration, réseaux, générateurs ---------------------------------------------------------

export function isPlainObject(value: unknown): value is Record<string, unknown>
/** Valeur enregistrée complétée récursivement par les valeurs par défaut. */
export function withDefaults<T>(defaults: T, saved: unknown): T

export const PRIVATE_NETWORKS: { cidr: string; first: number; last: number }[]
export function isIPv4(text: string): boolean
export function ipToInt(ip: string): number
export function intToIp(n: number): string
export function privateNetworkOf(ip: string | number): { cidr: string; first: number; last: number } | null
export function isPrivateIPv4(ip: string | number): boolean
export function prefixLength(netmask: string): number | null
export function netmaskOf(prefix: number): string
export interface Subnet {
  network: number
  broadcast: number
  prefix: number
  netmask: string
  cidr: string
}
export function subnetOf(address: string, netmask: string): Subnet | null
export function isPrivateSubnet(subnet: Subnet): boolean

export interface SimulatedVariable {
  simulation: 'none' | 'sine' | 'ramp' | 'random' | 'toggle'
  period?: number
  min?: number
  max?: number
  dataType?: string
}
/** Valeur simulée d'une variable à l'instant `t` (ms), `dt` : temps écoulé depuis le calcul précédent. */
export function simulate(variable: SimulatedVariable, current: unknown, t: number, dt: number): unknown
