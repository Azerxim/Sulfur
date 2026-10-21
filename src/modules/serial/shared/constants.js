import { builtinManifest } from '@shared/module'

export const SERIAL_MODULE = builtinManifest({
  id: 'serial',
  name: 'Terminal série',
  description: 'Terminal série RS-232 / RS-485 (journal hexadécimal, lignes de contrôle) et passerelle série ↔ TCP'
})

export const BAUD_RATES = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]

export const DATA_BITS = [8, 7, 6, 5]

/** Parités (libellés : serial.parities.*). */
export const PARITIES = ['none', 'even', 'odd', 'mark', 'space']

/** 1,5 bit de stop : Windows uniquement (refusé par le pilote sous Linux et macOS). */
export const STOP_BITS = [1, 1.5, 2]

/** Contrôle de flux (libellés : serial.flowControls.*). */
export const FLOW_CONTROLS = ['none', 'rtscts', 'xonxoff']

/** Fins de ligne ajoutées aux envois en texte (libellés : serial.lineEndings.*). */
export const LINE_ENDINGS = { none: '', cr: '\r', lf: '\n', crlf: '\r\n' }

/**
 * Découpage des octets reçus en trames du journal (libellés : serial.framings.*) :
 *  - gap : une trame se termine après un silence de `gap` ms ;
 *  - newline : aussi après chaque fin de ligne (LF).
 */
export const FRAMINGS = ['gap', 'newline']

/** Trames conservées dans le journal du process principal. */
export const MAX_LOG = 5000

/** Taille maximale d'une trame du journal (octets) : au-delà, la trame est coupée. */
export const MAX_FRAME = 1024

/** Taille maximale d'un envoi (octets). */
export const MAX_SEND = 65536

/** Durée d'un BREAK envoyé par le bouton dédié (ms). */
export const BREAK_DURATION = 250

/** Période minimale d'un envoi répété (ms). */
export const MIN_REPEAT = 10

export const DEFAULT_PORT_CONFIG = {
  path: '',
  baudRate: 9600,
  dataBits: 8,
  parity: 'none',
  stopBits: 1,
  flowControl: 'none',
  /** Lignes de sortie positionnées à l'ouverture (modifiables port ouvert). */
  dtr: true,
  rts: true
}

export const DEFAULT_RX_CONFIG = {
  framing: 'gap',
  /** Silence (ms) qui termine une trame reçue. */
  gap: 20
}

export const DEFAULT_SEND_CONFIG = {
  /** 'text' (séquences \r \n \t \\ \xNN reconnues) ou 'hex'. */
  mode: 'text',
  text: '',
  lineEnding: 'crlf',
  /** Envoi répété (ms). */
  interval: 1000,
  /** Derniers envois, du plus récent au plus ancien. */
  history: []
}

export const MAX_SEND_HISTORY = 20

export const DEFAULT_GATEWAY_CONFIG = {
  host: '0.0.0.0',
  port: 4001,
  /** Clients TCP simultanés (au-delà, la connexion est refusée). */
  maxClients: 1
}

/** Affichage du journal (libellés : serial.log.views.*). */
export const LOG_VIEWS = ['both', 'hex', 'text']

export const DEFAULT_DISPLAY_CONFIG = {
  view: 'both',
  timestamps: true
}
