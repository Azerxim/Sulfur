/** SDK des modules Sulfur — process principal (Node). */
import type { Instance, ModuleContext } from './index.js'

export interface CertificateInfo {
  commonName: string
  /** Empreinte SHA-256 en hexadécimal minuscule. */
  thumbprint: string
  notBefore: string
  notAfter: string
}

export function describeCertificate(pem: string): CertificateInfo

/**
 * Certificat auto-signé d'un serveur TLS (`<dir>/certificate.pem`, `<dir>/private_key.pem`), généré
 * au premier démarrage, ou s'il a expiré ou changé de nom.
 */
export function ensureCertificate(
  dir: string,
  commonName: string
): Promise<{ cert: string; key: string; info: CertificateInfo }>

/** Empreinte scrypt d'un mot de passe : `scrypt$<sel>$<empreinte>` (base64). */
export function hashPassword(password: string): Promise<string>
export function verifyPassword(password: string, stored: string): Promise<boolean>
export function isPasswordHash(value: unknown): boolean

/** Sortie du dossier servi (message : chemin demandé). */
export class OutsideRoot extends Error {}
/** Chemin virtuel normalisé « /a/b » d'un chemin demandé par un client. */
export function virtualPath(requested: string, cwd?: string): string
/** Chemin réel d'un chemin virtuel, confiné au dossier servi (lève OutsideRoot sinon). */
export function resolveInside(
  root: string,
  realRoot: string,
  virtual: string,
  options?: { mustExist?: boolean }
): Promise<{ real: string; target: string }>
/** Dossier servi préparé (créé au besoin), null si ce n'est pas un dossier. */
export function prepareRoot(folder: string): Promise<{ root: string; realRoot: string } | null>

// --- Instances (serveurs, clients… en nombre libre) ------------------------------------------------

export interface InstanceRole<T> {
  /** Libellé du rôle, base du nom des nouvelles instances (« Serveur 1 »). */
  label(): string
  /** Crée l'objet d'une instance ; `emit(event, payload)` diffuse `<moduleId>:<role>:<id>:<event>`. */
  create(instance: Instance, tools: { emit(event: string, payload?: unknown): void }): T
  /** Instance en marche : ni suppression ni import de configuration. */
  busy?(object: T): boolean
  /** Arrêt de l'instance (suppression, arrêt du module). */
  dispose?(object: T): unknown
}

export interface Instances<T = any> {
  /** Enregistre `<role>:<action>`, appelé avec l'identifiant de l'instance en premier argument. */
  handle(role: string, action: string, fn: (object: T, ...args: any[]) => unknown): void
  get(id: string, role?: string): T
  all(role?: string): { instance: Instance; object: T }[]
  busy(): boolean
  dispose(): Promise<void>
}

/**
 * Instances d'un module, listées dans la section `instances` de sa configuration (aucune par
 * défaut). Canaux : `instances:list|create|rename|remove`, `<role>:status` ; événement `instances`.
 */
export function defineInstances<T = any>(ctx: ModuleContext, roles: Record<string, InstanceRole<T>>): Instances<T>
