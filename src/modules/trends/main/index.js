import { app, BrowserWindow, dialog } from 'electron'
import fs from 'fs/promises'
import { join } from 'path'
import { TRENDS_MODULE } from '../shared/constants'
import '../shared/locales'
import { t } from '../shared/i18n'
import { TrendRecorder } from './recorder'

let recorder = null

/** Partie "main" du module courbes. Canaux : `trends:*`. Lit les points publiés par les autres modules. */
export const trendsMainModule = {
  manifest: TRENDS_MODULE,

  activate(ctx) {
    recorder = new TrendRecorder({
      peers: () => ctx.peers(),
      onStatus: (status) => ctx.emit('status', status),
      onSamples: (samples) => ctx.emit('samples', samples)
    })

    ctx.handle('points', () => recorder.points())
    ctx.handle('status', () => recorder.status())
    ctx.handle('data', () => recorder.data())
    ctx.handle('start', (options) => recorder.start(options))
    ctx.handle('stop', () => recorder.stop())
    ctx.handle('clear', () => recorder.clear())
    ctx.handle('setSeries', (series) => recorder.setSeries(series))

    // Export CSV dans un fichier choisi par l'utilisateur (null si annulé).
    ctx.handle('export', async (decimal) => {
      if (!recorder.rows.length) throw new Error(t('trends.errors.noData'))
      const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
      const { canceled, filePath } = await dialog.showSaveDialog(window, {
        title: t('trends.recording.export'),
        defaultPath: join(app.getPath('documents'), `sulfur-trends-${stamp}.csv`),
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      })
      if (canceled || !filePath) return null
      const labels = Object.fromEntries(
        recorder.points().map((p) => [p.key, `${p.moduleName} / ${t(`trends.groups.${p.group}`)} / ${p.name}`])
      )
      await fs.writeFile(filePath, recorder.csv({ labels, decimal }))
      return { filePath }
    })
  },

  async deactivate() {
    recorder?.dispose()
  }
}
