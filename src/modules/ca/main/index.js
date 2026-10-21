import { app, BrowserWindow, dialog, shell } from 'electron'
import fs from 'fs/promises'
import os from 'os'
import { basename, extname, join } from 'path'
import * as x509 from '@peculiar/x509'
import { CA_MODULE } from '../shared/constants'
import '../shared/locales'
import { CertificateAuthorities } from './store'
import { t } from '../shared/i18n'

let store = null

const window = () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

/** Filtres des boîtes de dialogue d'export, par extension. */
const FILTERS = {
  '.pem': { name: 'PEM', extensions: ['pem', 'crt'] },
  '.der': { name: 'DER', extensions: ['der', 'cer'] },
  '.crl': { name: 'CRL', extensions: ['crl'] },
  '.p12': { name: 'PKCS#12', extensions: ['p12', 'pfx'] }
}

/** Fichier lu pour un import : texte PEM (un fichier DER est converti en PEM). */
async function readPemFile(file, kind) {
  const data = await fs.readFile(file)
  const text = data.toString('latin1')
  if (text.includes('-----BEGIN')) return data.toString('utf8')
  const label = { certificate: 'CERTIFICATE', csr: 'CERTIFICATE REQUEST' }[kind]
  if (!label) throw new Error(t('ca.errors.pemExpected'))
  return x509.PemConverter.encode(data, label)
}

/** Noms de la machine, pour remplir les noms alternatifs d'un certificat serveur. */
function hostNames() {
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .map((a) => a.address.split('%')[0])
  return { hostname: os.hostname(), ips: [...new Set(ips)] }
}

/**
 * Partie "main" du module Autorité de certification. Canaux : `ca:list`, `ca:authority:*`,
 * `ca:issue`, `ca:sign`, `ca:revoke`, `ca:remove`, `ca:crl`, `ca:details`, `ca:export`,
 * `ca:pickFile`, `ca:openFolder`, `ca:hostNames`. Les autorités et leurs clés sont enregistrées dans
 * `<dataDir>/authorities` (hors de la configuration exportée).
 */
export const caMainModule = {
  manifest: CA_MODULE,

  activate(ctx) {
    store = new CertificateAuthorities(join(ctx.dataDir, 'authorities'))
    const list = () => store.list()

    ctx.handle('list', list)
    ctx.handle('authority:create', async (params) => ({ id: await store.createAuthority(params), list: await list() }))
    ctx.handle('authority:import', async (params) => ({ id: await store.importAuthority(params), list: await list() }))
    ctx.handle('authority:remove', async (id) => {
      await store.removeAuthority(id)
      return list()
    })
    ctx.handle('issue', async (id, params) => ({ serial: await store.issue(id, params), list: await list() }))
    ctx.handle('sign', async (id, params) => ({ serial: await store.signRequest(id, params), list: await list() }))
    ctx.handle('revoke', async (id, serial, reason) => {
      await store.revoke(id, serial, reason)
      return list()
    })
    ctx.handle('remove', async (id, serial) => {
      await store.removeIssued(id, serial)
      return list()
    })
    ctx.handle('crl', async (id) => {
      await store.writeCrl(id)
      return list()
    })
    ctx.handle('details', (id, serial) => store.details(id, serial))
    ctx.handle('hostNames', hostNames)

    // Export dans un fichier choisi par l'utilisateur (null si annulé).
    ctx.handle('export', async (id, serial, format, options) => {
      const { name, data } = await store.exportFile(id, serial, format, options)
      const ext = extname(name)
      const { canceled, filePath } = await dialog.showSaveDialog(window(), {
        title: t('ca.export.title'),
        defaultPath: join(app.getPath('documents'), name),
        filters: [FILTERS[ext] ?? { name: ext.slice(1).toUpperCase(), extensions: [ext.slice(1)] }]
      })
      if (canceled || !filePath) return null
      await fs.writeFile(filePath, data, format === 'key-pem' || format === 'p12' ? { mode: 0o600 } : undefined)
      return { filePath }
    })

    // Lecture d'un fichier à importer (certificat, clé ou CSR) : { name, content } ou null.
    ctx.handle('pickFile', async (kind) => {
      const { canceled, filePaths } = await dialog.showOpenDialog(window(), {
        title: t(`ca.import.pick.${kind}`),
        filters: [{ name: 'PEM / DER', extensions: ['pem', 'crt', 'cer', 'der', 'key', 'csr', 'req'] }],
        properties: ['openFile']
      })
      if (canceled || !filePaths?.length) return null
      return { name: basename(filePaths[0]), content: await readPemFile(filePaths[0], kind) }
    })

    ctx.handle('openFolder', async (id) => {
      const folder = id ? store.dir(id) : store.root
      await fs.mkdir(folder, { recursive: true })
      const error = await shell.openPath(folder)
      if (error) throw new Error(error)
    })
  }
}
