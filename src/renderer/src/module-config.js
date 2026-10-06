import { useEffect, useRef, useState } from 'react'
import { withDefaults } from '@shared/config'

/**
 * Configurations enregistrées des modules, côté interface.
 * Chargées une fois avant le premier rendu (`loadModuleConfigs`), puis lues de façon synchrone par
 * `usePersistentState` pour initialiser les panneaux sans attente ni clignotement.
 */
const configs = {}
/** Abonnés aux remplacements de configuration (import, réinitialisation). */
const listeners = new Set()

/** Délai avant d'enregistrer une modification (saisie au clavier). */
const SAVE_DELAY = 300
const pending = new Map()

export async function loadModuleConfigs(moduleIds) {
  await Promise.all(
    moduleIds.map(async (id) => {
      try {
        configs[id] = (await window.sulfur.invoke(`${id}:config:load`)) ?? {}
      } catch {
        configs[id] = {}
      }
    })
  )
}

function save(moduleId, section, value) {
  configs[moduleId] = { ...configs[moduleId], [section]: value }
  window.sulfur.invoke(`${moduleId}:config:save`, section, value).catch((err) => console.error(err))
}

/** Enregistre immédiatement les modifications en attente (fermeture de la fenêtre). */
export function flushModuleConfigs() {
  for (const [key, { timer, send }] of pending) {
    clearTimeout(timer)
    pending.delete(key)
    send()
  }
}

window.addEventListener('beforeunload', flushModuleConfigs)

/** Remplace les configurations de modules (déjà enregistrées par le process principal) et met à jour l'interface. */
function replaceModuleConfigs(modules) {
  for (const [id, config] of Object.entries(modules)) {
    for (const key of pending.keys()) {
      if (key.startsWith(`${id}:`)) {
        clearTimeout(pending.get(key).timer)
        pending.delete(key)
      }
    }
    configs[id] = config
  }
  for (const fn of listeners) fn(modules)
}

/** Exporte la configuration de tous les modules dans un fichier choisi par l'utilisateur. */
export function exportConfigurations() {
  flushModuleConfigs()
  return window.sulfur.invoke('config:export')
}

/** Importe un fichier de configuration (null si annulé) et l'applique aux modules concernés. */
export async function importConfigurations() {
  flushModuleConfigs()
  const result = await window.sulfur.invoke('config:import')
  if (result) replaceModuleConfigs(result.modules)
  return result
}

/** Rétablit la configuration par défaut d'un module. */
export async function resetModuleConfig(moduleId) {
  await window.sulfur.invoke(`${moduleId}:config:reset`)
  replaceModuleConfigs({ [moduleId]: {} })
}

/**
 * État React enregistré dans la configuration du module (section `section`) et restauré au démarrage.
 *  - `defaults` : valeur par défaut, complétée par la valeur enregistrée (voir `withDefaults`) ;
 *  - `persist(value)` : valeur réellement enregistrée (ex. sans les secrets).
 */
export function usePersistentState(moduleId, section, defaults, { persist = (v) => v } = {}) {
  const [value, setValue] = useState(() => withDefaults(defaults, configs[moduleId]?.[section]))
  const persistRef = useRef(persist)
  persistRef.current = persist
  const first = useRef(true)
  const defaultsRef = useRef(defaults)
  defaultsRef.current = defaults

  // Configuration remplacée (import) : la nouvelle valeur est reprise telle quelle.
  useEffect(() => {
    const onReplace = (modules) => {
      if (moduleId in modules) setValue(withDefaults(defaultsRef.current, modules[moduleId]?.[section]))
    }
    listeners.add(onReplace)
    return () => listeners.delete(onReplace)
  }, [moduleId, section])

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const key = `${moduleId}:${section}`
    clearTimeout(pending.get(key)?.timer)
    const send = () => {
      pending.delete(key)
      save(moduleId, section, persistRef.current(value))
    }
    pending.set(key, { timer: setTimeout(send, SAVE_DELAY), send })
  }, [moduleId, section, value])

  return [value, setValue]
}
