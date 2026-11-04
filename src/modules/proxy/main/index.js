import { app, BrowserWindow, dialog } from 'electron'
import fs from 'fs/promises'
import { join } from 'path'
import { PROXY_MODULE } from '../shared/constants'
import '../shared/locales'
import { t } from '../shared/i18n'
import { ProxyEngine } from './proxy'
import { createPointsApi } from './points'

let engine = null

const window = () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

/**
 * Partie "main" du module Proxy TCP / UDP. Canaux : `proxy:status`, `proxy:start`, `proxy:startAll`,
 * `proxy:stop`, `proxy:stopAll`, `proxy:update`, `proxy:cut`, `proxy:capture` et `proxy:log:*`.
 */
export const proxyMainModule = {
  manifest: PROXY_MODULE,

  activate(ctx) {
    engine = new ProxyEngine({
      onStatus: (status) => ctx.emit('status', status),
      onLog: (batch) => ctx.emit('log', batch)
    })

    ctx.expose(createPointsApi({ engine }))

    ctx.handle('status', () => engine.status())
    ctx.handle('start', (rule) => engine.start(rule))
    ctx.handle('startAll', (rules) => engine.startAll(rules))
    ctx.handle('stop', (id) => engine.stop(id))
    ctx.handle('stopAll', () => engine.stopAll())
    ctx.handle('update', (rule) => engine.update(rule))
    ctx.handle('cut', (id) => engine.cut(id))
    ctx.handle('capture', (capture) => engine.setCapture(capture))

    ctx.handle('log:list', () => engine.log)
    ctx.handle('log:clear', () => engine.clearLog())
    // Journal enregistré dans un fichier texte choisi par l'utilisateur (null si annulé).
    ctx.handle('log:export', async () => {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
      const { canceled, filePath } = await dialog.showSaveDialog(window(), {
        title: t('proxy.log.exportTitle'),
        defaultPath: join(app.getPath('documents'), `sulfur-proxy-${stamp}.log`),
        filters: [{ name: t('proxy.log.exportFilter'), extensions: ['log', 'txt'] }]
      })
      if (canceled || !filePath) return null
      await fs.writeFile(filePath, engine.exportText())
      return { filePath }
    })
  },

  /** Au moins une redirection démarrée. */
  busy() {
    return !!engine?.running
  },

  async deactivate() {
    await engine?.dispose()
  }
}
