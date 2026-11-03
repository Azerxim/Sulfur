/**
 * Extensions de modules : un module ajoute des onglets à la page d'un autre module (un module
 * additionnel complète un module standard au lieu d'avoir sa propre page).
 *
 * - Le module qui complète déclare ses cibles dans son manifeste (`extends: ['s7']`, affiché avant
 *   l'installation) et ses onglets dans sa partie renderer :
 *   `extensions: [{ target: 's7', tab: { id, label, icon, Component } }]` (`label` : texte, ou
 *   fonction qui le retourne, appelée à l'affichage pour suivre la langue).
 * - L'application fournit les modules activés (`setModuleExtensions`, réservé à l'hôte) ; le module
 *   visé lit ses onglets avec `useExtensions(<son id>)` et les affiche après les siens
 *   (`InstancesPage` le fait d'elle-même).
 * - Un onglet reçoit `target` (module visé) et `module` (module qui l'apporte) : il appelle les
 *   canaux IPC de son propre module (`<module>:<action>`), jamais ceux du module visé.
 * - Un module dont la cible est absente ou désactivée se charge quand même : ses onglets ne sont
 *   simplement pas affichés. Une erreur dans un onglet apporté ne casse pas la page qui l'accueille.
 */
import { Component as ReactComponent, useMemo, useSyncExternalStore } from 'react'
import { moduleT, t } from '../i18n.js'

/** Onglets apportés : [{ key, id, label, icon, module, target, Component }]. */
let extensions = []
const listeners = new Set()
const EMPTY = []

/** Composants liés à leur module et à leur cible, conservés d'un calcul à l'autre (état préservé). */
const bound = new WeakMap()

/** Nom traduit d'un module (message d'erreur d'un onglet apporté). */
const moduleName = (manifest) => moduleT(manifest.id)(`${manifest.id}.name`, null, manifest.name)

/** Erreur d'un onglet apporté : affichée à sa place, la page qui l'accueille reste utilisable. */
class ExtensionBoundary extends ReactComponent {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error(`[sulfur] onglet apporté par le module "${this.props.module}"`, error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
        <p className="font-medium">{t('ui.extensions.error', { module: this.props.name })}</p>
        <p className="mt-1 font-mono text-xs break-all text-red-300/80">{String(this.state.error?.message ?? '')}</p>
      </div>
    )
  }
}

function bind(tab, module, target, name) {
  let byTarget = bound.get(tab)
  if (!byTarget) bound.set(tab, (byTarget = new Map()))
  if (!byTarget.has(target)) {
    const Tab = tab.Component
    const ExtensionTab = (props) => (
      <ExtensionBoundary module={module} name={name}>
        <Tab {...props} target={target} module={module} />
      </ExtensionBoundary>
    )
    byTarget.set(target, ExtensionTab)
  }
  return byTarget.get(target)
}

const isComponent = (c) => typeof c === 'function' || (c !== null && typeof c === 'object' && '$$typeof' in c)

/**
 * Onglets apportés par les modules `modules` (parties renderer des modules activés, dans l'ordre de
 * la barre latérale). Un onglet n'est retenu que si sa cible figure dans `extends` du manifeste de
 * son module et que son identifiant est libre dans la page visée ; les autres sont signalés dans la
 * console et ignorés.
 */
export function collectExtensions(modules) {
  const list = []
  const taken = new Set()
  for (const mod of modules ?? []) {
    const manifest = mod?.manifest
    if (!manifest || !Array.isArray(mod.extensions)) continue
    const declared = Array.isArray(manifest.extends) ? manifest.extends : []
    for (const ext of mod.extensions) {
      const tab = ext?.tab
      const warn = (why) => console.warn(`[sulfur] onglet apporté par "${manifest.id}" ignoré : ${why}`)
      if (typeof ext?.target !== 'string' || !declared.includes(ext.target)) {
        warn(`cible "${ext?.target}" absente du champ extends du manifeste`)
        continue
      }
      if (typeof tab?.id !== 'string' || !tab.id || !tab.label || !isComponent(tab.Component)) {
        warn('onglet invalide (id, label et Component requis)')
        continue
      }
      const key = `${ext.target}/${manifest.id}:${tab.id}`
      if (taken.has(key)) {
        warn(`identifiant "${tab.id}" déjà pris dans la page de "${ext.target}"`)
        continue
      }
      taken.add(key)
      list.push({
        key,
        id: tab.id,
        label: tab.label,
        icon: tab.icon,
        module: manifest.id,
        target: ext.target,
        Component: bind(tab, manifest.id, ext.target, moduleName(manifest))
      })
    }
  }
  return list
}

/**
 * Modules activés fournis par l'application (réservé à l'hôte) : leurs onglets apportés sont
 * recalculés à chaque activation, désactivation ou actualisation de modules.
 */
export function setModuleExtensions(modules) {
  extensions = collectExtensions(modules)
  listeners.forEach((listener) => listener())
}

const subscribe = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const snapshot = () => extensions

/**
 * Onglets apportés au module `target` par les autres modules activés, à afficher après ses propres
 * onglets : [{ key, id, label, icon, module, target, Component }] (vide si rien ne le complète).
 * `Component` reçoit déjà `target` et `module`.
 */
export function useExtensions(target) {
  const all = useSyncExternalStore(subscribe, snapshot, snapshot)
  return useMemo(() => {
    const list = all.filter((e) => e.target === target)
    return list.length ? list : EMPTY
  }, [all, target])
}
