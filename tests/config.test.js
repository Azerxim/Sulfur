import fs from 'fs/promises'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withDefaults } from '@azerxim/sulfur-sdk'
import { ConfigStore } from '../src/main/config-store'
import { BUNDLE_FORMAT, createBundle, parseBundle } from '../src/main/config-bundle'
import { keepConfigs, storedConfigs } from '../src/main/config-transfer'
import { DEFAULT_SERVER_CONFIG } from '@modules/modbus/shared/constants'
import { tempDir } from './helpers'

vi.mock('electron', () => ({ app: {}, BrowserWindow: {}, dialog: {} }))

describe('withDefaults', () => {
  it('retourne les valeurs par défaut sans configuration enregistrée', () => {
    expect(withDefaults(DEFAULT_SERVER_CONFIG, undefined)).toBe(DEFAULT_SERVER_CONFIG)
    expect(withDefaults('opc.tcp://x', null)).toBe('opc.tcp://x')
  })

  it('complète une configuration ancienne avec les nouveaux réglages', () => {
    const saved = { port: 1502, security: { mode: 'tls' }, points: [] }
    const config = withDefaults(DEFAULT_SERVER_CONFIG, saved)
    expect(config.port).toBe(1502)
    expect(config.unitId).toBe(DEFAULT_SERVER_CONFIG.unitId)
    expect(config.security.mode).toBe('tls')
    expect(config.security.roles).toEqual(DEFAULT_SERVER_CONFIG.security.roles)
    expect(config.points).toEqual([])
  })

  it('ignore une valeur de forme incompatible', () => {
    expect(withDefaults({ a: 1 }, 'texte')).toEqual({ a: 1 })
    expect(withDefaults([1, 2], { length: 1 })).toEqual([1, 2])
    expect(withDefaults({ list: [1] }, { list: 'x' })).toEqual({ list: [1] })
  })

  it('conserve les valeurs saisies de type différent (texte en cours de saisie)', () => {
    expect(withDefaults({ address: 0 }, { address: '12' })).toEqual({ address: '12' })
  })
})

describe('ConfigStore', () => {
  let tmp, file
  beforeEach(async () => {
    tmp = await tempDir('config')
    file = path.join(tmp.dir, 'modules', 'test', 'config.json')
  })
  afterEach(() => tmp.cleanup())

  it('enregistre les sections et les relit au démarrage suivant', () => {
    const store = new ConfigStore(file)
    expect(store.get()).toEqual({})
    store.set('server', { port: 4841 })
    store.set('client', { endpoint: 'opc.tcp://host:4840' })
    expect(new ConfigStore(file).get()).toEqual({ server: { port: 4841 }, client: { endpoint: 'opc.tcp://host:4840' } })
  })

  it('remplace toute la configuration', () => {
    const store = new ConfigStore(file)
    store.set('server', { port: 1 })
    store.replace({ client: { port: 2 } })
    expect(new ConfigStore(file).get()).toEqual({ client: { port: 2 } })
  })

  it("repart d'une configuration vide si le fichier est illisible", async () => {
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, '{ pas du json')
    expect(new ConfigStore(file).get()).toEqual({})
    await fs.writeFile(file, '[1, 2]')
    expect(new ConfigStore(file).get()).toEqual({})
  })

  it('refuse un nom de section invalide', () => {
    expect(() => new ConfigStore(file).set('', 1)).toThrow()
  })
})

describe("Fichier d'échange (import / export)", () => {
  const known = ['opcua', 'modbus']
  const modules = { opcua: { server: { port: 4841 } }, modbus: { client: { host: '10.0.0.5' } } }

  it('relit un fichier exporté', () => {
    const bundle = createBundle(modules, '0.1.0')
    expect(bundle).toMatchObject({ format: BUNDLE_FORMAT, version: 1, appVersion: '0.1.0', modules })
    expect(parseBundle(JSON.stringify(bundle), known)).toEqual({ modules, kept: {}, ignored: [] })
  })

  it('conserve les sections des modules absents et ignore les sections inutilisables', () => {
    const text = JSON.stringify(
      createBundle({
        ...modules,
        mqtt: { broker: { port: 1884 } },
        'test-signal': { generator: { period: 5 } },
        system: { window: {} },
        settings: {},
        '../evil': {},
        list: [1]
      })
    )
    expect(parseBundle(text, known, ['system'])).toEqual({
      modules,
      kept: { mqtt: { broker: { port: 1884 } }, 'test-signal': { generator: { period: 5 } } },
      ignored: ['system', 'settings', '../evil', 'list']
    })
    // Seulement des modules absents : rien à appliquer tout de suite, mais le fichier est accepté.
    expect(parseBundle(JSON.stringify(createBundle({ mqtt: {} })), known).kept).toEqual({ mqtt: {} })
  })

  it('refuse les fichiers invalides', () => {
    expect(() => parseBundle('{ pas du json', known)).toThrow('not valid JSON')
    expect(() => parseBundle(JSON.stringify({ modules }), known)).toThrow('not a Sulfur configuration')
    expect(() => parseBundle(JSON.stringify({ ...createBundle(modules), version: 2 }), known)).toThrow('version 2')
    expect(() => parseBundle(JSON.stringify(createBundle({ settings: {} })), known)).toThrow('no configuration')
    expect(() => parseBundle(JSON.stringify(createBundle({ opcua: [] })), known)).toThrow('no configuration')
  })
})

describe('Configurations conservées des modules non chargés', () => {
  let tmp
  beforeEach(async () => {
    tmp = await tempDir('kept')
  })
  afterEach(() => tmp.cleanup())

  it('les enregistre puis les relit, sans celles des modules chargés', async () => {
    keepConfigs(tmp.dir, { mqtt: { broker: { port: 1884 } }, 'test-signal': { generator: { period: 5 } } })
    new ConfigStore(path.join(tmp.dir, 'opcua', 'config.json')).set('server', { port: 4841 })
    new ConfigStore(path.join(tmp.dir, 'empty', 'config.json')).replace({})
    await fs.mkdir(path.join(tmp.dir, 'settings'))
    await fs.writeFile(path.join(tmp.dir, 'notes.txt'), '')
    expect(await storedConfigs(tmp.dir, ['opcua'])).toEqual({
      mqtt: { broker: { port: 1884 } },
      'test-signal': { generator: { period: 5 } }
    })
    expect(await storedConfigs(path.join(tmp.dir, 'missing'), [])).toEqual({})
  })
})
