import { registerMessages } from '@azerxim/sulfur-sdk'
import fr from './fr'
import en from './en'

/** Dictionnaires du module HTTP / REST, une entrée par langue de `languages.js`. */
registerMessages({ fr, en }, 'http')
