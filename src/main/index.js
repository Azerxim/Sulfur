import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import '@shared/locales'
import { setLanguage } from '@azerxim/sulfur-sdk'
import { ModuleHost } from './module-host'
import { ExternalModules } from './external-modules'
import { registerModuleScheme, serveModulePackages } from './module-packages'
import { registerConfigTransfer } from './config-transfer'
import { registerModuleSwitch } from './module-switch'
import { mainModules } from './modules'
import { WINDOW_BACKGROUNDS, applyNativeTheme, flushPreferences, loadPreferences } from './preferences'
import { systemMainModule } from './system-info'
import { updaterMainModule } from './updater'
import icon from '../../resources/icon.png?asset'

const host = new ModuleHost()

// Fichiers de l'interface des modules externes (sulfur-module://<id>/…) : schéma déclaré avant le démarrage.
registerModuleScheme()

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

  const prefs = loadPreferences()
  // Langue des messages du process principal dès le démarrage (avant le chargement de l'interface).
  setLanguage(prefs.language)
  // Modules désactivés dans les Paramètres : configuration chargée, module non activé.
  const disabled = [].concat(prefs.disabledModules ?? [])
  const builtinIds = mainModules.map((mod) => mod.manifest.id)
  await host.load([systemMainModule, updaterMainModule, ...mainModules], {
    disabled: disabled.filter((id) => builtinIds.includes(id))
  })
  // Modules externes ensuite : ils peuvent utiliser les points des modules intégrés.
  const external = new ExternalModules(host)
  await external.load(prefs.externalModules === true, disabled)
  // Modules intégrés chargés (les modules refusés n'ont ni configuration ni activation) et modules
  // externes chargés : liste relue à chaque usage (actualisation des modules externes).
  const moduleIds = () => [...builtinIds.filter((id) => host.configs.has(id)), ...external.ids()]
  registerConfigTransfer(host, moduleIds)
  registerModuleSwitch(host, moduleIds, external)
  serveModulePackages(() => external.packages)
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
  await flushPreferences()
  app.quit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
