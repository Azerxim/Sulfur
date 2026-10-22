import { registerMessages } from '../i18n.js'
import fr from './fr.js'
import en from './en.js'

/**
 * Textes communs aux modules (boutons, erreurs génériques, générateurs de valeurs, certificats), une
 * entrée par langue de `languages.js`. Enregistrés par chaque point d'entrée du SDK.
 */
registerMessages({ fr, en })
