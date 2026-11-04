import { builtinManifest } from '@modules/builtin'
import { CODES, FORMATS } from './codec'

export const COAP_MODULE = builtinManifest({
  id: 'coap',
  name: 'CoAP / LwM2M',
  description: 'Serveur et client CoAP (observation, découverte), serveur LwM2M et appareil LwM2M simulé'
})

/** Retransmission des messages confirmables (RFC 7252 § 4.8). */
export const ACK_TIMEOUT = 2000
export const ACK_RANDOM_FACTOR = 1.5
export const MAX_RETRANSMIT = 4

/** Durée pendant laquelle un message reçu est reconnu comme doublon (ms). */
export const DEDUP_LIFETIME = 60_000

/** Événements conservés dans les journaux ; caractères d'un contenu conservés. */
export const MAX_LOG = 500
export const LOG_PAYLOAD = 1000

/** Types des ressources simulées (comme les topics MQTT). */
export const DATA_TYPES = ['Number', 'Integer', 'Boolean', 'String']
export const NUMERIC_TYPES = ['Number', 'Integer', 'Boolean']

/** Générateurs de valeurs (libellés : simulations.* du SDK). */
export const SIMULATIONS = ['none', 'sine', 'ramp', 'random', 'toggle']

/** Formats servis par une ressource simulée : texte ou JSON `{ "value": …, "timestamp": … }`. */
export const RESOURCE_FORMATS = [FORMATS.TEXT, FORMATS.JSON]

/** Codes de réponse forcés par le défaut « exception » du simulateur. */
export const FORCED_CODES = [CODES.NOT_FOUND, CODES.INTERNAL_ERROR, CODES.SERVICE_UNAVAILABLE, CODES.GATEWAY_TIMEOUT]

export const DEFAULT_SERVER_CONFIG = {
  host: '0.0.0.0',
  /** Port standard CoAP (5684 pour CoAP sur DTLS, non pris en charge). */
  port: 5683,
  updateRate: 100,
  resources: [
    {
      id: 'temperature',
      path: 'sensors/temperature',
      title: 'Temperature',
      dataType: 'Number',
      format: FORMATS.TEXT,
      initialValue: 20,
      simulation: 'sine',
      period: 20000,
      min: 15,
      max: 25,
      observable: true,
      writable: false,
      /** Notifications des observateurs au plus toutes les `interval` ms (0 : à chaque changement). */
      interval: 1000
    },
    {
      id: 'humidity',
      path: 'sensors/humidity',
      title: 'Humidity',
      dataType: 'Number',
      format: FORMATS.JSON,
      initialValue: 50,
      simulation: 'random',
      period: 5000,
      min: 40,
      max: 60,
      observable: true,
      writable: false,
      interval: 1000
    },
    {
      id: 'relay',
      path: 'actuators/relay',
      title: 'Relay',
      dataType: 'Boolean',
      format: FORMATS.TEXT,
      initialValue: false,
      simulation: 'none',
      period: 1000,
      min: 0,
      max: 1,
      observable: true,
      writable: true,
      interval: 0
    }
  ]
}

export const DEFAULT_CLIENT_CONFIG = {
  host: '127.0.0.1',
  port: 5683,
  method: 'GET',
  path: '/sensors/temperature',
  query: '',
  confirmable: true,
  /** Format du contenu envoyé (POST / PUT) et format demandé (Accept, '' : aucun). */
  format: FORMATS.TEXT,
  accept: '',
  payload: '',
  /** Abandon d'une requête sans réponse (s). */
  timeout: 10
}

/**
 * Serveur LwM2M : port distinct du serveur CoAP (5683 en standard) pour pouvoir lancer les deux ;
 * le port 5683 convient s'il est libre.
 */
export const DEFAULT_LWM2M_SERVER_CONFIG = {
  host: '0.0.0.0',
  port: 5690
}

/** Formats demandés par le serveur LwM2M pour une lecture (libellés : coap.lwm2m.formats.*). */
export const READ_FORMATS = [FORMATS.TLV, FORMATS.SENML_JSON, FORMATS.TEXT]

/** Appareil LwM2M simulé (client LwM2M). */
export const DEFAULT_DEVICE_CONFIG = {
  endpoint: 'sulfur-device-1',
  serverHost: '127.0.0.1',
  serverPort: 5690,
  /** Durée de l'enregistrement (s) : mis à jour avant son expiration. */
  lifetime: 300,
  manufacturer: 'Sulfur',
  model: 'Virtual sensor',
  serial: 'SN-0001',
  objects: { temperature: true, light: true },
  temperature: { min: 18, max: 26, period: 30000 }
}

/** Mises à jour de l'enregistrement : à cette fraction de sa durée. */
export const UPDATE_RATIO = 0.8
