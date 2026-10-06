import { DEFAULT_LANGUAGE, LANGUAGES } from './languages'

/**
 * Traductions partagées par le process principal et l'interface (une instance par process).
 *
 *   registerMessages({ fr: {...}, en: {...} })            — textes de l'application
 *   registerMessages({ fr: {...}, en: {...} }, 'modbus')  — textes d'un module (langues qu'il prend en charge)
 *   t('ui.start')                                         — traduction dans la langue courante
 *   moduleT('modbus')('modbus.log.started', { … })        — traduction pour un module
 *
 * Langue de repli : anglais. Un module qui ne fournit pas la langue courante est affiché
 * entièrement en anglais (y compris les textes communs qu'il utilise), sans mélange de langues.
 */
const dictionaries = {}
/** namespace → langues fournies par le module */
const moduleLanguages = {}
const listeners = new Set()
let current = DEFAULT_LANGUAGE

function merge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      target[key] = merge(target[key] ?? {}, value)
    } else {
      target[key] = value
    }
  }
  return target
}

export function registerMessages(byLanguage, namespace) {
  for (const [lang, messages] of Object.entries(byLanguage)) {
    dictionaries[lang] = merge(dictionaries[lang] ?? {}, messages)
  }
  if (namespace) moduleLanguages[namespace] = new Set(Object.keys(byLanguage))
}

function lookup(lang, key) {
  let node = dictionaries[lang]
  for (const part of key.split('.')) {
    if (node == null) return undefined
    node = node[part]
  }
  return typeof node === 'string' ? node : undefined
}

function translate(lang, key, params, fallback) {
  const text = lookup(lang, key) ?? lookup(DEFAULT_LANGUAGE, key) ?? fallback ?? key
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (match, name) => (params[name] !== undefined ? String(params[name]) : match))
}

/** Traduction dans la langue courante de l'application. */
export const t = (key, params, fallback) => translate(current, key, params, fallback)

/** Langue effective d'un module : la langue courante s'il la fournit, sinon l'anglais. */
export function moduleLanguage(namespace) {
  const supported = moduleLanguages[namespace]
  return !supported || supported.has(current) ? current : DEFAULT_LANGUAGE
}

/** Fonction de traduction propre à un module (voir moduleLanguage). */
export const moduleT = (namespace) => (key, params, fallback) =>
  translate(moduleLanguage(namespace), key, params, fallback)

export const getLanguage = () => current

/** Locale de formatage (dates, nombres) de la langue courante. */
export const getLocale = () => LANGUAGES[current]?.locale ?? LANGUAGES[DEFAULT_LANGUAGE].locale

export function setLanguage(lang) {
  const next = LANGUAGES[lang] ? lang : DEFAULT_LANGUAGE
  if (next === current) return current
  current = next
  for (const fn of listeners) fn(current)
  return current
}

export function onLanguageChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Heure locale hh:mm:ss (24 h) dans la langue courante. */
export const formatTime = (date) => new Date(date).toLocaleTimeString(getLocale(), { hour12: false })
export const formatDate = (date) => new Date(date).toLocaleDateString(getLocale())
