import { app, BrowserWindow, dialog } from 'electron'
import fs from 'fs/promises'
import { join } from 'path'
import { SERIAL_MODULE } from '../shared/constants'
import '../shared/locales'
import { t } from '../shared/i18n'
import { SerialTerminal } from './terminal'
import { SerialGateway } from './gateway'
import { listSerialPorts } from './serial'
import { createPointsApi } from './points'

let terminal = null
let gateway = null

const window = () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

/**
 * Partie "main" du module Terminal série. Canaux : `serial:ports`, `serial:status`, `serial:open`,
 * `serial:close`, `serial:send`, `serial:repeat:*`, `serial:outputs`, `serial:break`, `serial:rx`,
 * `serial:log:*` et `serial:gateway:*`.
 */
export const serialMainModule = {
  manifest: SERIAL_MODULE,

  activate(ctx) {
    terminal = new SerialTerminal({
      onStatus: (status) => ctx.emit('status', status),
      onLog: (batch) => ctx.emit('log', batch)
    })
    gateway = new SerialGateway(terminal, { onStatus: (status) => ctx.emit('gateway:status', status) })

    ctx.expose(createPointsApi({ terminal, gateway, savedConfig: ctx.config }))

    ctx.handle('ports', () => listSerialPorts())
    ctx.handle('status', () => terminal.status())
    ctx.handle('open', (config, rx) => terminal.open(config, rx))
    ctx.handle('close', () => terminal.close())
    ctx.handle('send', (payload) => terminal.send(payload))
    ctx.handle('repeat:start', (payload, interval) => terminal.startRepeat(payload, interval))
    ctx.handle('repeat:stop', () => terminal.stopRepeat())
    ctx.handle('outputs', (outputs) => terminal.setOutputs(outputs))
    ctx.handle('break', () => terminal.sendBreak())
    ctx.handle('rx', (rx) => terminal.setRx(rx))

    ctx.handle('log:list', () => terminal.log)
    ctx.handle('log:clear', () => terminal.clearLog())
    // Journal enregistré dans un fichier texte choisi par l'utilisateur (null si annulé).
    ctx.handle('log:export', async () => {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
      const { canceled, filePath } = await dialog.showSaveDialog(window(), {
        title: t('serial.log.exportTitle'),
        defaultPath: join(app.getPath('documents'), `sulfur-serial-${stamp}.log`),
        filters: [{ name: t('serial.log.exportFilter'), extensions: ['log', 'txt'] }]
      })
      if (canceled || !filePath) return null
      await fs.writeFile(filePath, terminal.exportText())
      return { filePath }
    })

    ctx.handle('gateway:status', () => gateway.status())
    ctx.handle('gateway:start', (config) => gateway.start(config))
    ctx.handle('gateway:stop', () => gateway.stop())
  },

  /** Port ouvert (la passerelle ne fonctionne qu'avec lui). */
  busy() {
    return !!terminal?.isOpen
  },

  async deactivate() {
    await gateway?.stop().catch(() => {})
    await terminal?.dispose()
  }
}
