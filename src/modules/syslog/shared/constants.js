import { builtinManifest } from '@modules/builtin'
export const SYSLOG_MODULE = builtinManifest({
  id: 'syslog',
  name: 'Syslog',
  description: 'Serveur Syslog (UDP / TCP / TLS, RFC 5424 et 3164) et émetteur de messages'
})

/** Transports (libellés : syslog.transports.*). */
export const TRANSPORTS = ['udp', 'tcp', 'tls']

/** Formats de message (libellés : syslog.formats.*). */
export const FORMATS = ['rfc5424', 'rfc3164']

/** Délimitation des messages sur TCP / TLS (RFC 6587) : longueur en tête, ou fin de ligne. */
export const FRAMINGS = ['octet', 'lf']

/** Facilités 0 à 23 (RFC 5424, § 6.2.1). */
export const FACILITIES = [
  'kern',
  'user',
  'mail',
  'daemon',
  'auth',
  'syslog',
  'lpr',
  'news',
  'uucp',
  'cron',
  'authpriv',
  'ftp',
  'ntp',
  'audit',
  'alert',
  'clock',
  'local0',
  'local1',
  'local2',
  'local3',
  'local4',
  'local5',
  'local6',
  'local7'
]

/** Gravités 0 (urgence) à 7 (débogage). */
export const SEVERITIES = ['emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug']

/** Messages reçus conservés par le serveur. */
export const MAX_MESSAGES = 2000

/** Messages envoyés conservés dans l'historique de l'émetteur. */
export const MAX_HISTORY = 200

/** Nombre maximal de messages d'une rafale. */
export const MAX_BURST = 1000

export const DEFAULT_SERVER_CONFIG = {
  host: '0.0.0.0',
  // 514 (UDP / TCP) et 6514 (TLS) sont les ports standard ; < 1024 : droits administrateur sous Linux.
  udp: { enabled: true, port: 1514 },
  tcp: { enabled: true, port: 1514 },
  tls: { enabled: false, port: 6514 }
}

export const DEFAULT_CLIENT_CONFIG = {
  host: '127.0.0.1',
  port: 1514,
  transport: 'udp',
  framing: 'octet',
  /** TLS : refuser un certificat serveur non reconnu (auto-signé). */
  rejectUnauthorized: false,
  format: 'rfc5424',
  facility: 16,
  severity: 6,
  /** Vide : nom de la machine. */
  hostname: '',
  appName: 'sulfur',
  procId: '',
  msgId: '',
  structuredData: '',
  /** `{n}` : numéro du message, `{time}` : heure d'envoi. */
  message: 'Test message {n} from Sulfur',
  /** Messages envoyés à chaque envoi (rafale). */
  count: 1,
  /** Envoi périodique (s). */
  interval: 1
}
