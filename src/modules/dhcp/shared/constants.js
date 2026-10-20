export const DHCP_MODULE = {
  id: 'dhcp',
  name: 'DHCP',
  description: "Serveur DHCP de test pour un réseau privé isolé, et client d'essai"
}

/** Événements conservés dans le journal affiché ; le fichier journal garde tout. */
export const MAX_LOG = 1000
export const MAX_HISTORY = 50

/** Taille maximale de la plage d'adresses distribuées. */
export const MAX_POOL = 256

/** Durée de bail (secondes) : 1 minute à 7 jours. */
export const MIN_LEASE = 60
export const MAX_LEASE = 7 * 24 * 3600

/** Durée de réservation d'une adresse offerte en attente de REQUEST, et d'une adresse refusée (DECLINE). */
export const OFFER_HOLD = 60_000
export const DECLINE_HOLD = 10 * 60_000

/** Ports DHCP standard (droits administrateur requis sous Linux). */
export const SERVER_PORT = 67
export const CLIENT_PORT = 68

export const DEFAULT_SERVER_CONFIG = {
  /** Interface d'écoute : aucune par défaut, elle doit être choisie explicitement. */
  interface: '',
  poolStart: '',
  poolEnd: '',
  /** Passerelle annoncée (option 3), vide : aucune. */
  router: '',
  /** Serveurs DNS annoncés (option 6), adresses privées séparées par des virgules. */
  dns: '',
  domain: '',
  leaseTime: 3600,
  /** Ne répondre qu'aux adresses MAC listées. */
  macFilter: false,
  macs: '',
  port: SERVER_PORT,
  clientPort: CLIENT_PORT
}

/** Modes du client : offres seulement (DISCOVER), ou bail complet (DISCOVER, OFFER, REQUEST, ACK). */
export const CLIENT_MODES = ['discover', 'lease']

export const DEFAULT_CLIENT_CONFIG = {
  interface: '',
  /** Adresse MAC envoyée ('' : celle de l'interface). */
  mac: '',
  hostname: 'sulfur-test',
  /** Adresse souhaitée (option 50), facultative. */
  requestedIp: '',
  /** Délai d'attente des réponses (ms). */
  timeout: 3000,
  port: SERVER_PORT,
  clientPort: CLIENT_PORT
}
