import { join } from 'path'
import { BrowserWindow, dialog, shell } from 'electron'
import { t } from '../shared/i18n'
import { OPCUA_MODULE } from '../shared/constants'
import '../shared/locales'
import { PkiStore } from './pki'
import { hashPassword } from '@azerxim/sulfur-sdk/main'
import { SimulationServer } from './server'
import { SimulationClient } from './client'
import { readNodesetFiles } from './nodesets'
import { createPointsApi } from './points'

let server = null
let client = null

/** Partie "main" du module OPC UA. Canaux exposés : `opcua:server:*` et `opcua:client:*`. */
export const opcuaMainModule = {
  manifest: OPCUA_MODULE,

  activate(ctx) {
    const pki = {
      server: new PkiStore(join(ctx.dataDir, 'pki', 'server')),
      client: new PkiStore(join(ctx.dataDir, 'pki', 'client'))
    }
    const store = (which) => {
      if (!pki[which]) throw new Error(t('errors.unknownStore', { name: which }))
      return pki[which]
    }

    server = new SimulationServer(
      pki.server,
      (status) => ctx.emit('server:status', status),
      (values) => ctx.emit('server:values', values)
    )
    client = new SimulationClient(
      pki.client,
      (status) => ctx.emit('client:status', status),
      (change) => ctx.emit('client:data', change),
      (event) => ctx.emit('client:event', event)
    )

    ctx.expose(createPointsApi({ server, client, savedConfig: ctx.config }))

    ctx.handle('server:status', () => server.status())
    ctx.handle('server:start', (config) => server.start(config))
    ctx.handle('server:stop', () => server.stop())
    ctx.handle('server:values', () => server.values())
    ctx.handle('server:upsertVariable', (def) => server.upsertVariable(def))
    ctx.handle('server:removeVariable', (id) => server.removeVariable(id))
    ctx.handle('server:setValue', (id, value) => server.setValue(id, value))
    ctx.handle('server:setUpdateRate', (rate) => server.setUpdateRate(rate))
    ctx.handle('server:upsertMethod', (def) => server.upsertMethod(def))
    ctx.handle('server:removeMethod', (id) => server.removeMethod(id))
    ctx.handle('server:upsertAlarm', (def) => server.upsertAlarm(def))
    ctx.handle('server:removeAlarm', (id) => server.removeAlarm(id))
    ctx.handle('server:raiseEvent', (event) => server.raiseEvent(event))

    // Fichiers NodeSet2 à importer dans l'espace d'adressage du serveur (null si annulé).
    ctx.handle('nodesets:pick', async () => {
      const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      const { canceled, filePaths } = await dialog.showOpenDialog(window, {
        title: t('opcua.nodesets.pickTitle'),
        filters: [{ name: 'NodeSet2 XML', extensions: ['xml'] }],
        properties: ['openFile', 'multiSelections']
      })
      return canceled || !filePaths?.length ? null : readNodesetFiles(filePaths)
    })

    ctx.handle('client:status', () => client.status())
    ctx.handle('client:connect', (url, security) => client.connect(url, security))
    ctx.handle('client:discover', (url) => client.discover(url))
    ctx.handle('client:disconnect', () => client.disconnect())
    ctx.handle('client:browse', (nodeId) => client.browse(nodeId))
    ctx.handle('client:read', (nodeId) => client.read(nodeId))
    ctx.handle('client:write', (nodeId, value) => client.write(nodeId, value))
    ctx.handle('client:subscribe', (nodeId) => client.subscribe(nodeId))
    ctx.handle('client:unsubscribe', (nodeId) => client.unsubscribe(nodeId))
    ctx.handle('client:history', (nodeId, start, end) => client.history(nodeId, start, end))
    ctx.handle('client:methodInfo', (nodeId) => client.methodInfo(nodeId))
    ctx.handle('client:call', (nodeId, inputs) => client.call(nodeId, inputs))
    ctx.handle('client:subscribeEvents', () => client.subscribeEvents())
    ctx.handle('client:unsubscribeEvents', () => client.unsubscribeEvents())
    ctx.handle('client:acknowledge', (conditionId, eventId, comment) =>
      client.acknowledge(conditionId, eventId, comment)
    )

    // Le renderer ne conserve que l'empreinte des mots de passe des utilisateurs du serveur.
    ctx.handle('security:hashPassword', (password) => hashPassword(password))

    // Certificats : which = 'server' | 'client'
    ctx.handle('certs:list', (which) => store(which).list())
    ctx.handle('certs:trust', (which, thumbprint) => store(which).trust(thumbprint))
    ctx.handle('certs:reject', (which, thumbprint) => store(which).reject(thumbprint))
    ctx.handle('certs:remove', (which, thumbprint) => store(which).remove(thumbprint))
    ctx.handle('certs:openFolder', async (which) => {
      const error = await shell.openPath(store(which).rootFolder)
      if (error) throw new Error(error)
    })
  },

  /** Serveur démarré ou client connecté. */
  busy() {
    return !!(server?.status().running || client?.status().connected)
  },

  async deactivate() {
    await client?.disconnect().catch(() => {})
    await server?.stop().catch(() => {})
  }
}
