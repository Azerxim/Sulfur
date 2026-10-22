import { moduleT } from '@azerxim/sulfur-sdk'
import './locales'

/**
 * Traductions du module : dans la langue de l'application si le module la fournit,
 * sinon entièrement en anglais. À utiliser à la place du `t` global dans tout le module.
 */
export const t = moduleT('dhcp')
