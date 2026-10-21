import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import * as ReactDOM from 'react-dom'
import * as sdk from '@azerxim/sulfur-sdk'
import * as sdkUi from '@azerxim/sulfur-sdk/ui'
import { SHARED_GLOBAL } from '@azerxim/sulfur-sdk'
import { flushModuleConfigs } from '@azerxim/sulfur-sdk/host'
import { addModule } from './modules'

/**
 * Modules externes (paquets installés, voir loadModulePackages côté process principal) : état lu
 * avant le premier rendu. `enabled` : paquets chargés à ce démarrage ; `next` : choix enregistré
 * pour le prochain démarrage (Paramètres) ; `dir` : dossier des paquets ; `ids` : modules externes
 * affichés ; `failed` : paquets dont l'interface n'a pas pu être chargée
 * ([{ id, name, version, reason, params }], comme les modules refusés).
 */
let state = { enabled: false, next: false, dir: null, ids: [], failed: [] }

export const externalModules = () => state

/** Modules partagés côté interface (SHARED_MODULES.renderer) : une seule instance de React et du SDK. */
function provideSharedModules() {
  globalThis[SHARED_GLOBAL] = Object.freeze({
    react: React,
    'react/jsx-runtime': jsxRuntime,
    'react-dom': ReactDOM,
    '@azerxim/sulfur-sdk': sdk,
    '@azerxim/sulfur-sdk/ui': sdkUi
  })
}

function addStylesheet(href) {
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  document.head.append(link)
}

/** Interface d'un module externe : export par défaut { manifest, icon, Component } du paquet `pkg`. */
async function importModule(pkg) {
  const mod = (await import(/* @vite-ignore */ pkg.renderer)).default
  if (mod?.manifest?.id !== pkg.id) throw Object.assign(new Error('mismatch'), { reason: 'mismatch' })
  if (!mod.icon || !mod.Component) throw Object.assign(new Error('invalid'), { reason: 'invalid' })
  return mod
}

/** Charge l'interface des modules externes et les ajoute aux modules de la barre latérale. */
export async function loadExternalModules() {
  let info
  try {
    info = await window.sulfur.invoke('modules:packages')
  } catch {
    return state
  }
  state = { enabled: info.enabled, next: info.next, dir: info.dir, ids: [], failed: [] }
  if (!info.packages.length) return state
  provideSharedModules()
  for (const pkg of info.packages) {
    try {
      const mod = await importModule(pkg)
      if (pkg.style) addStylesheet(pkg.style)
      addModule(pkg.group, mod)
      state.ids.push(pkg.id)
    } catch (err) {
      console.error(`[sulfur] interface du module "${pkg.id}" non chargée`, err)
      const problem =
        err.reason === 'mismatch'
          ? { reason: 'mismatch', params: { file: 'renderer' } }
          : err.reason === 'invalid'
            ? { reason: 'invalid', params: { field: 'renderer' } }
            : { reason: 'rendererFailed', params: { message: err.message } }
      state.failed.push({ id: pkg.id, name: pkg.name, version: pkg.version, ...problem })
    }
  }
  return state
}

/**
 * Actualise les modules externes : le process principal les arrête et relit les paquets (refusé si
 * l'un d'eux a un serveur ou un client en marche), puis l'interface est rechargée pour importer
 * leur nouvelle version. Les réglages en attente sont enregistrés avant.
 */
export async function reloadExternalModules() {
  flushModuleConfigs()
  await window.sulfur.invoke('modules:reload')
  window.location.reload()
}
