export const MQTT_MODULE = {
  id: 'mqtt',
  name: 'MQTT',
  description: 'Broker MQTT simulé (topics simulés, authentification, TLS) et client MQTT'
}

/** Types des valeurs des topics simulés (libellés : mqtt.dataTypes.*). */
export const DATA_TYPES = ['Number', 'Integer', 'Boolean', 'String']

/** Types numériques : simulables et publiés comme points numériques. */
export const NUMERIC_TYPES = ['Number', 'Integer', 'Boolean']

/** Générateurs de valeurs (libellés : simulations.*). */
export const SIMULATIONS = ['none', 'sine', 'ramp', 'random', 'toggle']

/** Contenu publié : valeur seule, ou objet JSON `{ "value": …, "timestamp": … }`. */
export const PAYLOAD_FORMATS = ['plain', 'json']

export const QOS_LEVELS = [0, 1, 2]

/** Versions du protocole côté client : 3.1, 3.1.1, 5.0 (libellés : mqtt.versions.*). */
export const PROTOCOL_VERSIONS = [4, 5, 3]

/** Suffixe d'écriture : publier sur `<topic>/set` modifie la valeur d'un topic simulé modifiable. */
export const SET_SUFFIX = '/set'

/** Messages conservés dans les journaux du broker et du client. */
export const MAX_LOG = 500

/** Topics distincts conservés dans l'explorateur du broker. */
export const MAX_TOPICS = 1000

/** Taille conservée d'un contenu dans les journaux (caractères). */
export const LOG_PAYLOAD = 2000

export const DEFAULT_SERVER_AUTH = {
  /** Connexions sans nom d'utilisateur acceptées. */
  anonymous: true,
  /** Utilisateurs : mots de passe hachés (`passwordHash`). */
  users: []
}

export const DEFAULT_SERVER_CONFIG = {
  host: '0.0.0.0',
  port: 1883,
  /** MQTT sur TLS (port standard 8883), certificat auto-signé généré au premier démarrage. */
  tls: false,
  updateRate: 100,
  auth: DEFAULT_SERVER_AUTH,
  topics: [
    {
      id: 'temperature',
      topic: 'sulfur/line1/temperature',
      dataType: 'Number',
      initialValue: 20,
      simulation: 'sine',
      period: 20000,
      min: 15,
      max: 25,
      /** Publication toutes les `interval` ms ; 0 : à chaque changement de valeur. */
      interval: 1000,
      qos: 0,
      retain: true,
      format: 'plain',
      writable: false
    },
    {
      id: 'running',
      topic: 'sulfur/line1/running',
      dataType: 'Boolean',
      initialValue: true,
      simulation: 'none',
      period: 1000,
      min: 0,
      max: 1,
      interval: 0,
      qos: 1,
      retain: true,
      format: 'json',
      writable: true
    }
  ]
}

export const DEFAULT_CLIENT_CONFIG = {
  host: '127.0.0.1',
  port: 1883,
  tls: false,
  /** TLS : refuser un certificat serveur non reconnu (auto-signé). */
  rejectUnauthorized: false,
  protocolVersion: 4,
  /** Vide : identifiant aléatoire. */
  clientId: '',
  username: '',
  password: '',
  clean: true,
  keepalive: 60,
  autoReconnect: false,
  will: { enabled: false, topic: 'sulfur/client/status', payload: 'offline', qos: 1, retain: true },
  subscriptions: [{ id: 'all', topic: 'sulfur/#', qos: 0, field: '' }],
  publish: { topic: 'sulfur/line1/running/set', payload: 'false', qos: 0, retain: false }
}
