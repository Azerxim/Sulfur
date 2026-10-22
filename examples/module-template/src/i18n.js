/**
 * Traductions du module, préfixées par son identifiant. `<id>.name` et `<id>.description` sont le
 * nom et la description affichés. Les textes communs (`ui.start`, `ui.stop`…) viennent du SDK.
 */
import { moduleT, registerMessages } from '@azerxim/sulfur-sdk'

registerMessages(
  {
    en: {
      'my-module': {
        name: 'My module',
        description: 'Counter published as a data point',
        counter: 'Counter',
        interval: 'Interval (ms)',
        step: 'Step (writable point)',
        value: 'Value',
        running: 'Running',
        stopped: 'Stopped',
        points: 'Points published for the simulator and the trends: {points}',
        errors: {
          interval: 'The interval must be between 100 and 60000 ms',
          notNumber: 'The value must be a number',
          readOnly: 'The point “{id}” is read-only'
        }
      }
    },
    fr: {
      'my-module': {
        name: 'Mon module',
        description: 'Compteur publié comme point de données',
        counter: 'Compteur',
        interval: 'Intervalle (ms)',
        step: 'Pas (point inscriptible)',
        value: 'Valeur',
        running: 'En marche',
        stopped: 'Arrêté',
        points: 'Points publiés pour le simulateur et les courbes : {points}',
        errors: {
          interval: 'L’intervalle doit être compris entre 100 et 60000 ms',
          notNumber: 'La valeur doit être un nombre',
          readOnly: 'Le point « {id} » est en lecture seule'
        }
      }
    }
  },
  'my-module'
)

export const t = moduleT('my-module')
