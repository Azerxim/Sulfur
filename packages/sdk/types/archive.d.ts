/** SDK des modules Sulfur — archive `.sulfur-module` d'un paquet de module (Node). */
import type { ModulePackage } from './index.js'

export const MODULE_ARCHIVE_EXTENSION: string

/** Limites de lecture d'une archive : nombre de fichiers et taille décompressée totale (octets). */
export const ARCHIVE_LIMITS: { entries: number; size: number }

/** Problème d'archive (libellé : `modules.problems.<reason>`). */
export class ArchiveError extends Error {
  problem: { reason: 'archive' | 'unreadable' | 'invalid' | 'missingFile'; params: Record<string, string> }
}

/** Archive ZIP des fichiers, dans cet ordre. */
export function createArchive(files: { name: string; data: Buffer }[]): Buffer

/** Fichiers d'une archive ZIP (dossiers ignorés) ; lève une ArchiveError. */
export function readArchive(buffer: Buffer, limits?: { entries: number; size: number }): Map<string, Buffer>

/** Paquet contenu dans une archive, descripteur vérifié (checkPackage) ; lève une ArchiveError. */
export function readModuleArchive(
  buffer: Buffer,
  limits?: { entries: number; size: number }
): { descriptor: ModulePackage; files: Map<string, Buffer> }

/** Archive le dossier d'un paquet ; retourne le chemin de l'archive. */
export function packModule(dir: string, file?: string): Promise<string>
