import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, shell: {} }))
vi.mock('electron-updater', () => ({ default: { autoUpdater: {} } }))

const { autoCheckEnabled, updateSupport } = await import('../src/main/updater')

describe('mises à jour', () => {
  it('recherche automatique active par défaut, désactivable', () => {
    expect(autoCheckEnabled({})).toBe(true)
    expect(autoCheckEnabled({ autoUpdate: true })).toBe(true)
    expect(autoCheckEnabled({ autoUpdate: false })).toBe(false)
  })

  it('aucune mise à jour en développement', () => {
    expect(updateSupport({ platform: 'win32', packaged: false })).toEqual({ supported: false, canInstall: false })
  })

  it('installation sous Windows, AppImage et .deb', () => {
    expect(updateSupport({ platform: 'win32', packaged: true }).canInstall).toBe(true)
    expect(updateSupport({ platform: 'linux', packaged: true, appImage: true }).canInstall).toBe(true)
    expect(updateSupport({ platform: 'linux', packaged: true, packageType: 'deb' }).canInstall).toBe(true)
    expect(updateSupport({ platform: 'linux', packaged: true, packageType: 'rpm' }).canInstall).toBe(false)
  })

  it('macOS non signé : nouvelle version signalée, pas installée', () => {
    expect(updateSupport({ platform: 'darwin', packaged: true })).toEqual({ supported: true, canInstall: false })
  })
})
