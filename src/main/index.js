import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import '@shared/locales'
import { setLanguage } from '@shared/i18n'
import { ModuleHost } from './module-host'
import { registerConfigTransfer } from './config-transfer'
import { mainModules } from './modules'
import { WINDOW_BACKGROUNDS, applyNativeTheme, loadPreferences } from './preferences'
import { systemMainModule } from './system-info'
import { updaterMainModule } from './updater'
import icon from '../../resources/icon.png?asset'

const host = new ModuleHost()

function createWindow() {
  // Thème mémorisé appliqué dès l'ouverture : fond de fenêtre et page (via le preload) sans flash.
  const prefs = loadPreferences()
  const theme = applyNativeTheme(prefs.theme ?? 'system')
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    title: 'Sulfur',
    backgroundColor: WINDOW_BACKGROUNDS[theme],
    autoHideMenuBar: true,
    // Windows prend l'icône de l'exécutable ; sous Linux, la fenêtre a besoin de la sienne.
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      additionalArguments: [`--sulfur-theme=${theme}`, `--sulfur-preferences=${JSON.stringify(prefs)}`]
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('fr.topazdev.sulfur')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  // Langue des messages du process principal dès le démarrage (avant le chargement de l'interface).
  setLanguage(loadPreferences().language)
  await host.load([systemMainModule, updaterMainModule, ...mainModules])
  registerConfigTransfer(
    host,
    mainModules.map((mod) => mod.manifest.id)
  )
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

let quitting = false
app.on('before-quit', async (event) => {
  if (quitting) return
  event.preventDefault()
  quitting = true
  await host.dispose()
  app.quit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
