import { describe, expect, it } from 'vitest'
import { APP_VERSION } from '@shared/app'
import { checkManifest, compareVersions, MODULE_API_VERSION, parseVersion, t } from '@azerxim/sulfur-sdk'
import { builtinManifest } from '@modules/builtin'
import { mainModules } from '../src/main/modules'

const manifest = (patch = {}) => ({
  id: 'demo',
  name: 'Demo',
  version: '1.0.0',
  edition: 'additional',
  apiVersion: '1.0.0',
  minAppVersion: '0.4.0',
  ...patch
})

describe('Versions', () => {
  it('lit et compare les versions semver', () => {
    expect(parseVersion('1.2.3-beta.1+build.5')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: ['beta', '1'] })
    expect(parseVersion('1.2')).toBeNull()
    expect(parseVersion('01.2.3')).toBeNull()
    const ordered = [
      '0.9.9',
      '1.0.0-alpha',
      '1.0.0-alpha.1',
      '1.0.0-alpha.beta',
      '1.0.0-beta.2',
      '1.0.0-beta.11',
      '1.0.0',
      '1.0.1',
      '1.10.0'
    ]
    for (let i = 1; i < ordered.length; i++) expect(compareVersions(ordered[i - 1], ordered[i])).toBeLessThan(0)
    expect(compareVersions('1.0.0+a', '1.0.0+b')).toBe(0)
  })
})

describe('Manifeste des modules', () => {
  const check = (patch, options = { apiVersion: '1.2.0', appVersion: '0.5.0' }) =>
    checkManifest(manifest(patch), options)

  it('accepte un module compatible', () => {
    expect(check({})).toBeNull()
    expect(check({ apiVersion: '1.2.0', minAppVersion: '0.5.0' })).toBeNull()
  })

  it('refuse un manifeste invalide ou un identifiant réservé', () => {
    expect(checkManifest(null)).toEqual({ reason: 'invalid', params: { field: 'id' } })
    expect(check({ id: 'Demo' })).toEqual({ reason: 'invalid', params: { field: 'id' } })
    expect(check({ name: ' ' })).toEqual({ reason: 'invalid', params: { field: 'name' } })
    expect(check({ version: '1' })).toEqual({ reason: 'invalid', params: { field: 'version' } })
    expect(check({ edition: 'gold' })).toEqual({ reason: 'invalid', params: { field: 'edition' } })
    expect(check({ apiVersion: undefined })).toEqual({ reason: 'invalid', params: { field: 'apiVersion' } })
    expect(check({ minAppVersion: 'latest' })).toEqual({ reason: 'invalid', params: { field: 'minAppVersion' } })
    expect(check({ id: 'settings' })).toEqual({ reason: 'reservedId', params: { id: 'settings' } })
    expect(checkManifest(manifest(), { appVersion: '0.5.0', loadedIds: ['demo'] })).toEqual({
      reason: 'duplicateId',
      params: { id: 'demo' }
    })
  })

  it('vérifie l’API des modules et la version de Sulfur', () => {
    expect(check({ apiVersion: '2.0.0' })).toEqual({
      reason: 'apiMajor',
      params: { required: '2.0.0', current: '1.2.0' }
    })
    expect(check({ apiVersion: '0.9.0' }).reason).toBe('apiMajor')
    expect(check({ apiVersion: '1.3.0' })).toEqual({
      reason: 'apiTooNew',
      params: { required: '1.3.0', current: '1.2.0' }
    })
    expect(check({ minAppVersion: '0.6.0' })).toEqual({
      reason: 'appTooOld',
      params: { required: '0.6.0', current: '0.5.0' }
    })
    expect(check({ minAppVersion: '0.5.0' }, { apiVersion: '1.0.0', appVersion: '0.5.0-beta.1' }).reason).toBe(
      'appTooOld'
    )
    expect(t('modules.problems.appTooOld', { required: '0.6.0', current: '0.5.0' })).toBe(
      'requires Sulfur 0.6.0 or later (this is 0.5.0): update Sulfur'
    )
  })

  it('accepte tous les modules livrés avec Sulfur', () => {
    expect(builtinManifest({ id: 'x', name: 'X' })).toEqual({
      id: 'x',
      name: 'X',
      version: APP_VERSION,
      edition: 'standard',
      apiVersion: MODULE_API_VERSION,
      minAppVersion: APP_VERSION
    })
    const loaded = []
    for (const mod of mainModules) {
      expect([mod.manifest.id, checkManifest(mod.manifest, { appVersion: APP_VERSION, loadedIds: loaded })]).toEqual([
        mod.manifest.id,
        null
      ])
      loaded.push(mod.manifest.id)
    }
  })
})
