import { migrateToInstances } from '@azerxim/sulfur-sdk'
import { defineInstances, hashPassword } from '@azerxim/sulfur-sdk/main'
import { join } from 'path'
import { BrowserWindow, dialog, shell } from 'electron'
import { t } from '../shared/i18n'
import { OPCUA_MODULE } from '../shared/constants'
import '../shared/locales'
import { PkiStore } from './pki'
import { SimulationServer } from './server'
import { SimulationClient } from './client'
import { readNodesetFiles } from './nodesets'
import { createPointsApi } from './points'

/** Instances uniques d'une version antérieure, converties en instances (« Serveur 1 »…). */
const migrateConfig = (config) =>
  migrateToInstances(config, {
    server: { sections: ['server', 'nodesets'], name: `${t('ui.server')} 1` },
    client: { sections: ['clientEndpoint', 'clientSecurity'], name: `${t('ui.client')} 1` }
  })

let instances = null

/**
 * Partie "main" du module OPC UA : serveurs et clients en nombre libre (aucun par défaut, voir
 * `defineInstances` du SDK). Canaux : `opcua:instances:*`, `opcua:server:*` et `opcua:client:*` (identifiant de l'instance en
 * premier argument) ; `opcua:certs:*`, `opcua:nodesets:pick` et
 * `opcua:security:hashPassword` sont communs aux instances.
 */
export const opcuaMainModule = {
  manifest: OPCUA_MODULE,

  migrateConfig,

  activate(ctx) {
    const pki = {
      server: new PkiStore(join(ctx.dataDir, 'pki', 'server')),
      client: new PkiStore(join(ctx.dataDir, 'pki', 'client'))
    }
    const store = (which) => {
      if (!pki[which]) throw new Error(t('errors.unknownStore', { name: which }))
      return pki[which]
    }

    instances = defineInstances(ctx, {
      server: {
        label: () => t('ui.server'),
        create: (_instance, { emit }) =>
          new SimulationServer(
            pki.server,
            (status) => emit('status', status),
            (values) => emit('values', values)
          ),
        busy: (server) => server.status().running,
        dispose: (server) => server.stop()
      },
      client: {
        label: () => t('ui.client'),
        create: (_instance, { emit }) =>
          new SimulationClient(
            pki.client,
            (status) => emit('status', status),
            (change) => emit('data', change),
            (event) => emit('event', event)
          ),
        busy: (client) => client.status().connected,
        dispose: (client) => client.disconnect()
      }
    })

    ctx.expose(createPointsApi({ instances, savedConfig: ctx.config }))
    instances.handle('server', 'start', (server, config) => server.start(config))
    instances.handle('server', 'stop', (server) => server.stop())
    instances.handle('server', 'values', (server) => server.values())
    instances.handle('server', 'upsertVariable', (server, def) => server.upsertVariable(def))
    instances.handle('server', 'removeVariable', (server, id) => server.removeVariable(id))
    instances.handle('server', 'setValue', (server, id, value) => server.setValue(id, value))
    instances.handle('server', 'setUpdateRate', (server, rate) => server.setUpdateRate(rate))
    instances.handle('server', 'upsertMethod', (server, def) => server.upsertMethod(def))
    instances.handle('server', 'removeMethod', (server, id) => server.removeMethod(id))
    instances.handle('server', 'upsertAlarm', (server, def) => server.upsertAlarm(def))
    instances.handle('server', 'removeAlarm', (server, id) => server.removeAlarm(id))
    instances.handle('server', 'raiseEvent', (server, event) => server.raiseEvent(event))

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
    instances.handle('client', 'connect', (client, url, security) => client.connect(url, security))
    instances.handle('client', 'discover', (client, url) => client.discover(url))
    instances.handle('client', 'disconnect', (client) => client.disconnect())
    instances.handle('client', 'browse', (client, nodeId) => client.browse(nodeId))
    instances.handle('client', 'read', (client, nodeId) => client.read(nodeId))
    instances.handle('client', 'write', (client, nodeId, value) => client.write(nodeId, value))
    instances.handle('client', 'subscribe', (client, nodeId) => client.subscribe(nodeId))
    instances.handle('client', 'unsubscribe', (client, nodeId) => client.unsubscribe(nodeId))
    instances.handle('client', 'history', (client, nodeId, start, end) => client.history(nodeId, start, end))
    instances.handle('client', 'methodInfo', (client, nodeId) => client.methodInfo(nodeId))
    instances.handle('client', 'call', (client, nodeId, inputs) => client.call(nodeId, inputs))
    instances.handle('client', 'subscribeEvents', (client) => client.subscribeEvents())
    instances.handle('client', 'unsubscribeEvents', (client) => client.unsubscribeEvents())
    instances.handle('client', 'acknowledge', (client, conditionId, eventId, comment) =>
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

  /** Au moins un serveur démarré ou un client connecté. */
  busy() {
    return !!instances?.busy()
  },

  async deactivate() {
    await instances?.dispose()
    instances = null
  }
}
