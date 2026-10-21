import fs from 'fs'
import path from 'path'
import { builtinModules } from 'module'
import { describe, expect, it } from 'vitest'
import * as sdk from '@azerxim/sulfur-sdk'
import * as sdkMain from '@azerxim/sulfur-sdk/main'
import * as sdkBuild from '@azerxim/sulfur-sdk/build'

const SDK_DIR = path.resolve('packages/sdk')
const pkg = JSON.parse(fs.readFileSync(path.join(SDK_DIR, 'package.json'), 'utf8'))

/** Fichiers .js / .jsx d'un dossier, récursivement. */
function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sources(full)
    return /\.jsx?$/.test(entry.name) ? [full] : []
  })
}

/** Sources importées par un fichier (import … from, import '…', export … from). */
const imports = (file) =>
  [
    ...fs
      .readFileSync(file, 'utf8')
      .matchAll(/^\s*(?:import\s+(?:[^'"]*?\sfrom\s+)?|export\s+[^'";]*?\sfrom\s+)['"]([^'"]+)['"]/gm)
  ].map((m) => m[1])

describe('Paquet SDK', () => {
  it('porte la version de l’API des modules', () => {
    expect(pkg.name).toBe('@azerxim/sulfur-sdk')
    expect(sdk.MODULE_API_VERSION).toBe(pkg.version)
  })

  it('déclare des points d’entrée et des types qui existent', () => {
    for (const [entry, target] of Object.entries(pkg.exports)) {
      const files = typeof target === 'string' ? [target] : [target.types, target.default]
      for (const file of files) expect([entry, fs.existsSync(path.join(SDK_DIR, file))]).toEqual([entry, true])
    }
  })

  it('ne dépend que de ses dépendances paires et de Node', () => {
    const allowed = new Set([...Object.keys(pkg.peerDependencies), ...builtinModules])
    const outside = []
    for (const file of sources(path.join(SDK_DIR, 'src'))) {
      for (const source of imports(file)) {
        const bare = source.startsWith('node:') ? source.slice(5) : source
        const ok = source.startsWith('.')
          ? path.resolve(path.dirname(file), source).startsWith(path.join(SDK_DIR, 'src'))
          : allowed.has(bare) || allowed.has(bare.split('/')[0])
        if (!ok) outside.push(`${path.relative(SDK_DIR, file)} → ${source}`)
      }
    }
    expect(outside).toEqual([])
  })

  it('garde ses exports publics (suppression = nouvelle version majeure de l’API)', () => {
    expect(Object.keys(sdk).sort()).toEqual([
      'DEFAULT_LANGUAGE',
      'EDITIONS',
      'FAULT_TYPES',
      'IPC_CHANNEL_PATTERN',
      'LANGUAGES',
      'MODULE_API_VERSION',
      'MODULE_GROUPS',
      'MODULE_ID_PATTERN',
      'MODULE_PACKAGE_FILE',
      'PRIVATE_NETWORKS',
      'RESERVED_MODULE_IDS',
      'SHARED_GLOBAL',
      'SHARED_MODULES',
      'checkManifest',
      'checkPackage',
      'compareVersions',
      'defineManifest',
      'formatDate',
      'formatTime',
      'getLanguage',
      'getLocale',
      'intToIp',
      'ipToInt',
      'isIPv4',
      'isPlainObject',
      'isPrivateIPv4',
      'isPrivateSubnet',
      'moduleLanguage',
      'moduleT',
      'netmaskOf',
      'onLanguageChange',
      'packageManifest',
      'parsePointKey',
      'parseVersion',
      'pointKey',
      'prefixLength',
      'privateNetworkOf',
      'registerMessages',
      'setLanguage',
      'simulate',
      'subnetOf',
      't',
      'toNumber',
      'withDefaults'
    ])
    expect(Object.keys(sdkMain).sort()).toEqual([
      'OutsideRoot',
      'describeCertificate',
      'ensureCertificate',
      'hashPassword',
      'isPasswordHash',
      'prepareRoot',
      'resolveInside',
      'verifyPassword',
      'virtualPath'
    ])
    expect(Object.keys(sdkBuild).sort()).toEqual(['buildModule', 'sulfurShared'])
  })

  it('fournit les textes communs aux modules', () => {
    expect(sdk.t('ui.start')).toBe('Start')
    expect(sdk.t('errors.alreadyStarted')).toBe('The server is already running')
  })
})

describe('Modules intégrés', () => {
  it('n’utilisent que le SDK pour le code de l’application', () => {
    const modulesDir = path.resolve('src/modules')
    const forbidden = []
    for (const file of sources(modulesDir)) {
      if (path.dirname(file) === modulesDir) continue // builtin.js : manifeste des modules intégrés
      const own = path.relative(modulesDir, file).split(path.sep)[0]
      for (const source of imports(file)) {
        const escapes =
          source.startsWith('.') && !path.resolve(path.dirname(file), source).startsWith(path.join(modulesDir, own))
        if (/^@(shared|renderer)\//.test(source) || escapes)
          forbidden.push(`${path.relative(modulesDir, file)} → ${source}`)
      }
    }
    expect(forbidden).toEqual([])
  })
})
