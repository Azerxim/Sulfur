import { registerMessages } from '@azerxim/sulfur-sdk'
import fr from './fr'
import en from './en'

/** Dictionnaires du module NTP, une entrée par langue de `languages.js`. */
registerMessages({ fr, en }, 'ntp')
