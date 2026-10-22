/**
 * SDK des modules Sulfur — archive d'un paquet de module (Node) : le dossier du paquet (module.json
 * et fichiers construits, voir `package.js`) en un seul fichier `<id>-<version>.sulfur-module`, à
 * partager et à installer depuis les Paramètres. C'est une archive ZIP ordinaire (fichiers stockés
 * ou compressés en Deflate), sans signature : chacun peut produire la sienne avec `packModule`.
 *
 * La lecture (readModuleArchive) est faite pour un fichier qui vient de n'importe où : chemins
 * relatifs sans « .. », nombre de fichiers et taille décompressée limités, contrôle CRC, descripteur
 * vérifié (checkPackage) et fichiers qu'il désigne présents.
 */
import fs from 'fs/promises'
import path from 'path'
import zlib from 'zlib'
import { MODULE_PACKAGE_FILE, checkPackage } from './package.js'

export const MODULE_ARCHIVE_EXTENSION = '.sulfur-module'

/** Limites de lecture d'une archive : nombre de fichiers et taille décompressée totale. */
export const ARCHIVE_LIMITS = { entries: 2000, size: 200 * 1024 * 1024 }

const LOCAL = 0x04034b50
const CENTRAL = 0x02014b50
const END = 0x06054b50
const UTF8 = 0x0800
// Date DOS fixe (1er janvier 1980) : deux constructions du même paquet donnent la même archive.
const DOS_DATE = 0x0021

/** Problème d'archive : `problem` = { reason, params } (libellés : modules.problems.<reason>). */
export class ArchiveError extends Error {
  constructor(reason, params = {}) {
    super(`${reason} ${JSON.stringify(params)}`)
    this.problem = { reason, params }
  }
}

/** Chemin d'un fichier d'archive accepté : relatif, séparateurs « / », sans « . » ni « .. ». */
const isArchivePath = (name) =>
  !name.startsWith('/') &&
  !name.includes('\\') &&
  !name.includes('\0') &&
  !/^[a-zA-Z]:/.test(name) &&
  name.split('/').every((part) => part && part !== '.' && part !== '..')

/** Archive ZIP des fichiers [{ name, data }] (data : Buffer), dans cet ordre. */
export function createArchive(files) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const { name, data } of files) {
    if (!isArchivePath(name)) throw new Error(`Chemin refusé dans l'archive : ${name}`)
    const nameBytes = Buffer.from(name, 'utf8')
    const deflated = zlib.deflateRawSync(data, { level: 9 })
    const stored = deflated.length >= data.length
    const body = stored ? data : deflated
    const crc = zlib.crc32(data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(LOCAL, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(UTF8, 6)
    local.writeUInt16LE(stored ? 0 : 8, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(DOS_DATE, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, nameBytes, body)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(CENTRAL, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(UTF8, 8)
    central.writeUInt16LE(stored ? 0 : 8, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(DOS_DATE, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, nameBytes)
    offset += local.length + nameBytes.length + body.length
  }
  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(END, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}

/**
 * Fichiers d'une archive ZIP : Map nom → Buffer (dossiers ignorés). Lève une ArchiveError
 * (reason 'archive') si l'archive est invalide, chiffrée, au format ZIP64 ou dépasse `limits`.
 */
export function readArchive(buffer, limits = ARCHIVE_LIMITS) {
  const fail = (message) => {
    throw new ArchiveError('archive', { message })
  }
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) fail('not a ZIP file')
  let end = -1
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 0xffff); i--) {
    if (buffer.readUInt32LE(i) === END) {
      end = i
      break
    }
  }
  if (end < 0) fail('not a ZIP file')
  const count = buffer.readUInt16LE(end + 10)
  const size = buffer.readUInt32LE(end + 12)
  let pos = buffer.readUInt32LE(end + 16)
  if (count === 0xffff || pos === 0xffffffff) fail('ZIP64 archives are not supported')
  if (pos + size > end) fail('corrupted central directory')
  if (count > limits.entries) fail(`more than ${limits.entries} files`)

  const files = new Map()
  let total = 0
  for (let n = 0; n < count; n++) {
    if (pos + 46 > end || buffer.readUInt32LE(pos) !== CENTRAL) fail('corrupted central directory')
    const flags = buffer.readUInt16LE(pos + 8)
    const method = buffer.readUInt16LE(pos + 10)
    const crc = buffer.readUInt32LE(pos + 16)
    const compressed = buffer.readUInt32LE(pos + 20)
    const length = buffer.readUInt32LE(pos + 24)
    const nameLength = buffer.readUInt16LE(pos + 28)
    const skip = buffer.readUInt16LE(pos + 30) + buffer.readUInt16LE(pos + 32)
    const offset = buffer.readUInt32LE(pos + 42)
    const name = buffer.toString('utf8', pos + 46, pos + 46 + nameLength)
    pos += 46 + nameLength + skip

    if (name.endsWith('/')) continue
    if (!isArchivePath(name)) fail(`unsafe path: ${name}`)
    if (files.has(name)) fail(`duplicate file: ${name}`)
    if (flags & 1) fail('encrypted archives are not supported')
    if (method !== 0 && method !== 8) fail(`unsupported compression method for ${name}`)
    total += length
    if (total > limits.size) fail(`more than ${Math.round(limits.size / 1024 / 1024)} MB once extracted`)

    if (offset + 30 > buffer.length || buffer.readUInt32LE(offset) !== LOCAL) fail(`corrupted file: ${name}`)
    const start = offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28)
    if (start + compressed > buffer.length) fail(`truncated file: ${name}`)
    const body = buffer.subarray(start, start + compressed)
    let data
    try {
      data = method === 0 ? Buffer.from(body) : zlib.inflateRawSync(body, { maxOutputLength: Math.max(length, 1) })
    } catch {
      fail(`corrupted file: ${name}`)
    }
    if (data.length !== length || zlib.crc32(data) !== crc) fail(`corrupted file: ${name}`)
    files.set(name, data)
  }
  return files
}

/**
 * Paquet contenu dans une archive : { descriptor, files } (files : Map nom → Buffer). Lève une
 * ArchiveError : 'archive', 'unreadable' (module.json absent ou invalide), 'invalid' (descripteur,
 * voir checkPackage) ou 'missingFile' (fichier désigné par module.json absent). Le manifeste se
 * vérifie ensuite avec checkManifest.
 */
export function readModuleArchive(buffer, limits) {
  const files = readArchive(buffer, limits)
  let descriptor
  try {
    const json = files.get(MODULE_PACKAGE_FILE)
    if (!json) throw new Error('file not found')
    descriptor = JSON.parse(json.toString('utf8'))
    if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) throw new Error('not an object')
  } catch (err) {
    throw new ArchiveError('unreadable', { file: MODULE_PACKAGE_FILE, message: err.message })
  }
  const invalid = checkPackage(descriptor)
  if (invalid) throw new ArchiveError(invalid.reason, invalid.params)
  for (const file of [descriptor.renderer, descriptor.main, descriptor.style].filter(Boolean)) {
    if (!files.has(file)) throw new ArchiveError('missingFile', { file })
  }
  return { descriptor, files }
}

/** Fichiers d'un dossier, chemins relatifs « / » triés (liens symboliques ignorés). */
async function listFiles(dir, prefix = '') {
  const entries = await fs.readdir(path.join(dir, prefix), { withFileTypes: true })
  const files = []
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) files.push(...(await listFiles(dir, name)))
    else if (entry.isFile()) files.push(name)
  }
  return files
}

/**
 * Archive le paquet du dossier `dir` (produit par buildModule) dans `file`, par défaut
 * `<id>-<version>.sulfur-module` à côté du dossier. module.json est vérifié et placé en premier.
 * Retourne le chemin de l'archive.
 */
export async function packModule(dir, file) {
  const root = path.resolve(dir)
  const descriptor = JSON.parse(await fs.readFile(path.join(root, MODULE_PACKAGE_FILE), 'utf8'))
  const invalid = checkPackage(descriptor)
  if (invalid) throw new Error(`Paquet invalide : champ « ${invalid.params.field} »`)
  const names = (await listFiles(root)).filter((name) => name !== MODULE_PACKAGE_FILE)
  const files = [MODULE_PACKAGE_FILE, ...names].map(async (name) => ({
    name,
    data: await fs.readFile(path.join(root, ...name.split('/')))
  }))
  const out = path.resolve(
    file ?? path.join(path.dirname(root), `${descriptor.id}-${descriptor.version}${MODULE_ARCHIVE_EXTENSION}`)
  )
  if (out.startsWith(root + path.sep)) throw new Error("L'archive doit être écrite hors du dossier du paquet")
  await fs.writeFile(out, createArchive(await Promise.all(files)))
  return out
}
