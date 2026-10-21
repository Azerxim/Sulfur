import { app, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import electronUpdater from 'electron-updater'
import { loadPreferences, savePreferences } from './preferences'
import { builtinManifest } from '@shared/module'

/**
 * Mises à jour à partir des releases GitHub (electron-updater, fichiers latest*.yml joints aux
 * releases par la CI). Les releases en brouillon sont ignorées : une version n'est proposée qu'une
 * fois la release publiée.
 *
 * Installation automatique : Windows (NSIS), Linux (AppImage et .deb). Sous macOS, les installeurs ne
 * sont pas signés et Squirrel.Mac refuse de les installer : la nouvelle version est seulement
 * signalée, avec un lien vers la page de la release.
 */
const { autoUpdater } = electronUpdater

export const RELEASES_URL = 'https://github.com/Azerxim/Sulfur/releases'
/** Délai avant la recherche au démarrage, puis intervalle entre deux recherches automatiques. */
const STARTUP_DELAY = 10_000
const CHECK_INTERVAL = 6 * 60 * 60 * 1000

/** La recherche automatique est active sauf si l'utilisateur l'a désactivée dans les paramètres. */
export const autoCheckEnabled = (prefs) => prefs.autoUpdate !== false

/**
 * Ce que la plateforme permet : rechercher (application installée, pas en développement) et installer
 * (Windows, AppImage ou paquet .deb ; jamais sous macOS sans signature).
 */
export function updateSupport({ platform, packaged, appImage, packageType }) {
  const supported = packaged
  const canInstall =
    supported && (platform === 'win32' || (platform === 'linux' && (appImage || packageType === 'deb')))
  return { supported, canInstall }
}

function readPackageType() {
  try {
    return fs.readFileSync(path.join(process.resourcesPath, 'package-type'), 'utf8').trim()
  } catch {
    return null
  }
}

export function createUpdater(emit) {
  const { supported, canInstall } = updateSupport({
    platform: process.platform,
    packaged: app.isPackaged,
    appImage: Boolean(process.env.APPIMAGE),
    packageType: process.platform === 'linux' ? readPackageType() : null
  })

  let state = {
    supported,
    canInstall,
    autoCheck: autoCheckEnabled(loadPreferences()),
    currentVersion: app.getVersion(),
    // idle | checking | available | not-available | downloading | downloaded | error
    status: 'idle',
    version: null,
    releaseUrl: null,
    progress: null,
    error: null,
    checkedAt: null
  }
  let timer = null

  const set = (patch) => {
    state = { ...state, ...patch }
    emit('status', state)
    return state
  }

  if (supported) {
    autoUpdater.autoDownload = false
    // Une mise à jour téléchargée est installée à la fermeture si l'utilisateur ne redémarre pas.
    autoUpdater.autoInstallOnAppQuit = canInstall
    autoUpdater.on('checking-for-update', () => set({ status: 'checking', error: null }))
    autoUpdater.on('update-available', (info) =>
      set({ status: 'available', version: info.version, releaseUrl: `${RELEASES_URL}/tag/v${info.version}` })
    )
    autoUpdater.on('update-not-available', () => set({ status: 'not-available', checkedAt: Date.now() }))
    autoUpdater.on('download-progress', (p) => set({ status: 'downloading', progress: Math.round(p.percent) }))
    autoUpdater.on('update-downloaded', () => set({ status: 'downloaded', progress: 100 }))
    autoUpdater.on('error', (err) => set({ status: 'error', error: err?.message ?? String(err), progress: null }))
  }

  async function check() {
    if (!supported) return state
    if (['checking', 'downloading', 'downloaded'].includes(state.status)) return state
    try {
      await autoUpdater.checkForUpdates()
    } catch {
      // erreur déjà signalée par l'événement 'error'
    }
    return set({ checkedAt: Date.now() })
  }

  function schedule() {
    clearTimeout(timer)
    clearInterval(timer)
    timer = null
    if (!supported || !state.autoCheck) return
    timer = setTimeout(() => {
      check()
      timer = setInterval(check, CHECK_INTERVAL)
    }, STARTUP_DELAY)
  }

  return {
    state: () => state,
    check,
    start: schedule,
    async download() {
      if (state.status !== 'available') return state
      if (!canInstall) {
        await shell.openExternal(state.releaseUrl ?? RELEASES_URL)
        return state
      }
      set({ status: 'downloading', progress: 0, error: null })
      try {
        await autoUpdater.downloadUpdate()
      } catch {
        // erreur déjà signalée par l'événement 'error'
      }
      return state
    },
    install() {
      if (state.status === 'downloaded') autoUpdater.quitAndInstall()
    },
    setAutoCheck(enabled) {
      savePreferences({ autoUpdate: Boolean(enabled) })
      set({ autoCheck: Boolean(enabled) })
      schedule()
      return state
    },
    dispose() {
      clearTimeout(timer)
      clearInterval(timer)
    }
  }
}

/** Module "cœur" des mises à jour (canaux `updater:*`, événement `updater:status`). */
export const updaterMainModule = {
  manifest: builtinManifest({
    id: 'updater',
    name: 'Mises à jour',
    description: 'Mises à jour depuis les releases GitHub'
  }),
  updater: null,
  activate(ctx) {
    const updater = createUpdater(ctx.emit)
    this.updater = updater
    ctx.handle('state', () => updater.state())
    ctx.handle('check', () => updater.check())
    ctx.handle('download', () => updater.download())
    ctx.handle('install', () => updater.install())
    ctx.handle('setAutoCheck', (enabled) => updater.setAutoCheck(enabled))
    ctx.handle('openReleases', () => shell.openExternal(updater.state().releaseUrl ?? RELEASES_URL))
    updater.start()
  },
  deactivate() {
    this.updater?.dispose()
  }
}
