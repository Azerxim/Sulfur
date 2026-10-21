import { builtinManifest } from '@modules/builtin'
export const TFTP_MODULE = builtinManifest({
  id: 'tftp',
  name: 'TFTP',
  description: "Serveur TFTP simulé (firmware, configurations d'équipements) et client"
})

/** Événements conservés dans le journal du serveur ; transferts dans l'historique du client. */
export const MAX_LOG = 500
export const MAX_HISTORY = 100

/** Taille de bloc : 512 octets sans négociation (RFC 1350), 8 à 65464 avec l'option blksize (RFC 2348). */
export const DEFAULT_BLOCK_SIZE = 512
export const MIN_BLOCK_SIZE = 8
export const MAX_BLOCK_SIZE = 65464
export const BLOCK_SIZES = [512, 1024, 1428, 4096, 8192, 65464]

/** Modes de transfert : binaire (octet) ou texte (netascii, fins de ligne CR LF). */
export const MODES = ['octet', 'netascii']

/** Codes d'erreur TFTP (RFC 1350, 2347) proposés pour le défaut « erreur forcée ». */
export const FORCED_ERRORS = [1, 2, 3, 0]

export const DEFAULT_SERVER_CONFIG = {
  host: '0.0.0.0',
  /** Port standard 69 : droits administrateur requis sous Linux. */
  port: 6969,
  /** Dossier servi ('' : dossier « files » des données du module). */
  root: '',
  /** Envoi de fichiers par les clients (WRQ), et remplacement des fichiers existants. */
  allowWrite: true,
  allowOverwrite: false,
  /** Délai d'attente d'un acquittement (secondes) et nombre de retransmissions. */
  timeout: 3,
  retries: 5,
  /** Taille de bloc maximale acceptée lors de la négociation. */
  maxBlockSize: MAX_BLOCK_SIZE
}

export const DEFAULT_CLIENT_CONFIG = {
  host: '127.0.0.1',
  port: 6969,
  remoteFile: 'firmware.bin',
  mode: 'octet',
  /** Taille de bloc demandée (512 : pas de négociation de blksize). */
  blockSize: 1428,
  /** Demande de la taille du fichier (option tsize, RFC 2349). */
  tsize: true,
  timeout: 3,
  retries: 5
}
