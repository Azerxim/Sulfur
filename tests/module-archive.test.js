import fs from 'fs/promises'
import path from 'path'
import zlib from 'zlib'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MODULE_API_VERSION, checkManifest } from '@azerxim/sulfur-sdk'
import {
  MODULE_ARCHIVE_EXTENSION,
  createArchive,
  packModule,
  readArchive,
  readModuleArchive
} from '@azerxim/sulfur-sdk/archive'
import { tempDir } from './helpers'

const DESCRIPTOR = {
  id: 'demo',
  name: 'Demo',
  version: '1.2.0',
  author: 'Jane Doe',
  edition: 'additional',
  apiVersion: MODULE_API_VERSION,
  minAppVersion: '0.4.0',
  group: 'tools',
  renderer: 'renderer.mjs',
  main: 'main.mjs'
}

const file = (name, content) => ({ name, data: Buffer.from(content) })
const packageFiles = (descriptor = DESCRIPTOR) => [
  file('module.json', JSON.stringify(descriptor)),
  file('renderer.mjs', 'export default {}\n'.repeat(50)),
  file('main.mjs', 'export default {}'),
  file('assets/icon.svg', '<svg/>')
]
const problemOf = (fn) => {
  try {
    fn()
    return null
  } catch (err) {
    return err.problem ?? err.message
  }
}

let tmp
beforeAll(async () => {
  tmp = await tempDir('archive')
})
afterAll(() => tmp.cleanup())

describe('Archive ZIP', () => {
  it('relit les fichiers écrits, compressés ou stockés', () => {
    const files = readArchive(createArchive(packageFiles()))
    expect([...files.keys()]).toEqual(['module.json', 'renderer.mjs', 'main.mjs', 'assets/icon.svg'])
    expect(files.get('renderer.mjs').toString()).toBe('export default {}\n'.repeat(50))
    expect(files.get('assets/icon.svg').toString()).toBe('<svg/>')
  })

  it('donne la même archive pour les mêmes fichiers', () => {
    expect(createArchive(packageFiles()).equals(createArchive(packageFiles()))).toBe(true)
  })

  it('refuse les chemins qui sortent du paquet', () => {
    for (const name of ['../evil.mjs', '/etc/passwd', 'a/../../b', 'C:/x.mjs', 'a\\b.mjs', 'a//b']) {
      expect(() => createArchive([file(name, 'x')])).toThrow(/Chemin refusé/)
    }
    // Archive forgée à la main : même contrôle à la lecture.
    const archive = createArchive([file('xx/evil.mjs', 'x')])
    for (let i = archive.indexOf('xx/evil'); i >= 0; i = archive.indexOf('xx/evil', i + 1)) archive.write('..', i)
    expect(problemOf(() => readArchive(archive))).toEqual({
      reason: 'archive',
      params: { message: 'unsafe path: ../evil.mjs' }
    })
  })

  it('refuse une archive corrompue, tronquée ou trop grande', () => {
    expect(problemOf(() => readArchive(Buffer.from('not a zip')))).toMatchObject({ reason: 'archive' })
    const archive = createArchive([file('a.txt', 'hello world, hello world')])
    const corrupted = Buffer.from(archive)
    corrupted[40] ^= 0xff
    expect(problemOf(() => readArchive(corrupted)).params.message).toMatch(/corrupted file: a.txt/)
    expect(problemOf(() => readArchive(archive.subarray(0, 20))).reason).toBe('archive')
    const big = createArchive([file('big.bin', Buffer.alloc(4096).toString())])
    expect(problemOf(() => readArchive(big, { entries: 10, size: 1024 })).params.message).toMatch(/MB once extracted/)
    expect(problemOf(() => readArchive(createArchive(packageFiles()), { entries: 2, size: 1e6 })).params.message).toBe(
      'more than 2 files'
    )
  })

  it('ne décompresse pas au-delà de la taille annoncée', () => {
    // Fichier annoncé à 10 octets mais qui en décompresse 1 Mo (bombe de décompression).
    const data = Buffer.alloc(1024 * 1024)
    const archive = createArchive([{ name: 'bomb.bin', data }])
    const deflated = zlib.deflateRawSync(data, { level: 9 }).length
    expect(archive.length).toBeLessThan(deflated + 200)
    archive.writeUInt32LE(10, 22)
    archive.writeUInt32LE(10, archive.length - 22 - 46 - 8 + 24)
    expect(problemOf(() => readArchive(archive)).params.message).toMatch(/corrupted file: bomb.bin/)
  })
})

describe('Paquet dans une archive', () => {
  it('lit le descripteur et les fichiers', () => {
    const { descriptor, files } = readModuleArchive(createArchive(packageFiles()))
    expect(descriptor).toEqual(DESCRIPTOR)
    expect(files.size).toBe(4)
    expect(checkManifest(descriptor, { appVersion: '0.4.0' })).toBeNull()
  })

  it('signale un descripteur absent, invalide ou des fichiers manquants', () => {
    expect(problemOf(() => readModuleArchive(createArchive([file('main.mjs', 'x')])))).toMatchObject({
      reason: 'unreadable',
      params: { file: 'module.json' }
    })
    expect(problemOf(() => readModuleArchive(createArchive([file('module.json', '[1]')])))).toMatchObject({
      reason: 'unreadable'
    })
    expect(problemOf(() => readModuleArchive(createArchive(packageFiles({ ...DESCRIPTOR, group: 'x' }))))).toEqual({
      reason: 'invalid',
      params: { field: 'group' }
    })
    const withoutMain = packageFiles().filter((f) => f.name !== 'main.mjs')
    expect(problemOf(() => readModuleArchive(createArchive(withoutMain)))).toEqual({
      reason: 'missingFile',
      params: { file: 'main.mjs' }
    })
  })

  it('vérifie l’auteur du manifeste', () => {
    expect(checkManifest({ ...DESCRIPTOR, author: '  ' }, { appVersion: '0.4.0' })?.params.field).toBe('author')
    expect(checkManifest({ ...DESCRIPTOR, author: undefined }, { appVersion: '0.4.0' })).toBeNull()
  })

  it('archive le dossier d’un paquet (packModule)', async () => {
    const dir = path.join(tmp.dir, 'build', 'demo')
    for (const { name, data } of packageFiles()) {
      await fs.mkdir(path.dirname(path.join(dir, name)), { recursive: true })
      await fs.writeFile(path.join(dir, name), data)
    }
    const archive = await packModule(dir)
    expect(archive).toBe(path.join(tmp.dir, 'build', `demo-1.2.0${MODULE_ARCHIVE_EXTENSION}`))
    const { descriptor, files } = readModuleArchive(await fs.readFile(archive))
    expect(descriptor).toEqual(DESCRIPTOR)
    expect([...files.keys()]).toEqual(['module.json', 'assets/icon.svg', 'main.mjs', 'renderer.mjs'])
    await expect(packModule(dir, path.join(dir, 'self.sulfur-module'))).rejects.toThrow(/hors du dossier/)
  })
})
