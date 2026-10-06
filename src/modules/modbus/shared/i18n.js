import { moduleT } from '@shared/i18n'
import './locales'

/**
 * Traductions du module : dans la langue de l'application si le module la fournit,
 * sinon entièrement en anglais. À utiliser à la place du `t` global dans tout le module.
 */
export const t = moduleT('modbus')
