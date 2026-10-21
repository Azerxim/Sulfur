// Dossiers servis par les serveurs de fichiers (TFTP, FTP) : process principal uniquement.
import fs from 'fs/promises'
import path from 'path'

/** Erreur de chemin : sortie du dossier servi (message : chemin demandé). */
export class OutsideRoot extends Error {}

/** Chemin virtuel normalisé « /a/b » d'un chemin demandé par un client (« \ » accepté). */
export function virtualPath(requested, cwd = '/') {
  const text = String(requested ?? '').replaceAll('\\', '/')
  const absolute = text.startsWith('/') ? text : `${cwd.replace(/\/$/, '')}/${text}`
  return path.posix.normalize(absolute).replace(/\/+$/, '') || '/'
}

/**
 * Chemin réel d'un chemin virtuel, confiné au dossier servi `root` (dont `realRoot` est le chemin
 * réel) : le chemin réel, ou celui du dossier parent s'il n'existe pas encore, doit rester dans le
 * dossier servi, y compris à travers les liens symboliques. Lève OutsideRoot sinon.
 */
export async function resolveInside(root, realRoot, virtual, { mustExist = false } = {}) {
  const target = path.join(root, ...virtual.split('/').filter(Boolean))
  let real
  try {
    real = await fs.realpath(target)
  } catch (err) {
    if (mustExist || err.code !== 'ENOENT') throw err
    real = path.join(await fs.realpath(path.dirname(target)), path.basename(target))
  }
  if (real !== realRoot && !real.startsWith(realRoot + path.sep)) throw new OutsideRoot(virtual)
  return { real, target }
}

/** Prépare le dossier servi (créé au besoin) : { root, realRoot } ; null s'il ne s'agit pas d'un dossier. */
export async function prepareRoot(folder) {
  const root = path.resolve(folder)
  await fs.mkdir(root, { recursive: true })
  const stats = await fs.stat(root).catch(() => null)
  if (!stats?.isDirectory()) return null
  return { root, realRoot: await fs.realpath(root) }
}
