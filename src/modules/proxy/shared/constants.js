import { builtinManifest } from '@modules/builtin'
export const PROXY_MODULE = builtinManifest({
  id: 'proxy',
  name: 'Proxy TCP / UDP',
  description: 'Relais TCP / UDP entre un client et un équipement réels : journal hexadécimal et défauts sur le trafic'
})

/** Protocoles relayés (libellés : proxy.protocols.*). */
export const PROTOCOLS = ['tcp', 'udp']

/**
 * Sens du trafic concernés par les défauts d'une redirection (libellés : proxy.directions.*) :
 * `up` du client vers l'équipement, `down` de l'équipement vers le client.
 */
export const DIRECTIONS = ['both', 'up', 'down']

/** Bornes des défauts : latence et gigue (ms), perte et altération (%). */
export const MAX_LATENCY = 60_000
export const MAX_PERCENT = 100

/** Défauts d'une redirection, appliqués au trafic relayé (modifiables redirection démarrée). */
export const DEFAULT_FAULTS = {
  /** Retard ajouté à chaque envoi (ms), plus une gigue aléatoire entre 0 et `jitter` ms. */
  latency: 0,
  jitter: 0,
  /** Datagrammes UDP perdus (%), sans effet en TCP (le flux serait incohérent). */
  loss: 0,
  /** Envois altérés (%) : un bit d'un octet pris au hasard est inversé. */
  corrupt: 0,
  direction: 'both',
  /** Trafic bloqué : connexions TCP refusées, données et datagrammes ignorés. */
  block: false
}

/** Redirection : port local → hôte:port distant. */
export const newRule = (n = 1) => ({
  id: crypto.randomUUID(),
  name: `Redirection ${n}`,
  protocol: 'tcp',
  listenHost: '0.0.0.0',
  listenPort: 5020 + n - 1,
  targetHost: '127.0.0.1',
  targetPort: 502,
  faults: { ...DEFAULT_FAULTS }
})

export const DEFAULT_RULES = [{ ...newRule(1), id: 'rule-1', name: 'Modbus TCP' }]

/** Entrées conservées dans le journal du process principal. */
export const MAX_LOG = 5000

/** Octets d'un envoi conservés dans le journal (au-delà, l'entrée garde sa taille réelle). */
export const MAX_LOGGED = 1024

/** Session UDP fermée après ce silence du client et de l'équipement (ms). */
export const UDP_IDLE = 60_000

/** Affichage du journal (libellés : proxy.log.views.*). */
export const LOG_VIEWS = ['both', 'hex', 'text']

export const DEFAULT_DISPLAY_CONFIG = {
  view: 'both',
  timestamps: true,
  /** Données relayées enregistrées dans le journal (sinon : événements seulement). */
  capture: true,
  /** Redirection affichée ('' : toutes). */
  rule: ''
}
