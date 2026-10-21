import { moduleT, registerMessages } from '@azerxim/sulfur-sdk'

registerMessages(
  {
    en: {
      'test-signal': {
        name: 'Test signal',
        description: 'External test module: signal generator with data points',
        generator: 'Generator',
        period: 'Period (s)',
        amplitude: 'Amplitude',
        interval: 'Refresh (ms)',
        running: 'Running',
        stopped: 'Stopped',
        values: 'Values',
        setpoint: 'Setpoint (writable point)',
        points: 'Points published for the simulator and the trends: {points}',
        host: 'Main process',
        ping: 'Ping',
        pong: 'Answer from the main process of the module (pid {pid}, Node {node}) in {ms} ms',
        errors: {
          notNumber: 'The value must be a number',
          readOnly: 'The point “{id}” is read-only',
          interval: 'The refresh must be between 50 and 10000 ms'
        }
      }
    },
    fr: {
      'test-signal': {
        name: 'Signal de test',
        description: 'Module externe de test : générateur de signal avec points de données',
        generator: 'Générateur',
        period: 'Période (s)',
        amplitude: 'Amplitude',
        interval: 'Rafraîchissement (ms)',
        running: 'En marche',
        stopped: 'Arrêté',
        values: 'Valeurs',
        setpoint: 'Consigne (point inscriptible)',
        points: 'Points publiés pour le simulateur et les courbes : {points}',
        host: 'Process principal',
        ping: 'Ping',
        pong: 'Réponse du process principal du module (pid {pid}, Node {node}) en {ms} ms',
        errors: {
          notNumber: 'La valeur doit être un nombre',
          readOnly: 'Le point « {id} » est en lecture seule',
          interval: 'Le rafraîchissement doit être compris entre 50 et 10000 ms'
        }
      }
    }
  },
  'test-signal'
)

export const t = moduleT('test-signal')
