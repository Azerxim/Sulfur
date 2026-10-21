/** SDK des modules Sulfur — process principal (Node). */

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
