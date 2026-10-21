import { registerMessages } from '@azerxim/sulfur-sdk'
import fr from './fr'
import en from './en'

/** Dictionnaires du module MQTT, une entrée par langue de `languages.js`. */
registerMessages({ fr, en }, 'mqtt')
