export const FTP_MODULE = {
  id: 'ftp',
  name: 'FTP',
  description: "Serveur FTP / FTPS simulé (sauvegardes, recettes, journaux d'automates) et client"
}

/** Événements conservés dans le journal du serveur et dans le dialogue du client. */
export const MAX_LOG = 500

/** Chiffrement : aucun, FTPS explicite (AUTH TLS, RFC 4217) ou implicite (TLS dès la connexion). */
export const TLS_MODES = ['none', 'explicit', 'implicit']

/** Codes de réponse proposés pour le défaut « réponse forcée » (commandes de transfert). */
export const FORCED_REPLIES = [421, 450, 451, 550, 552]

export const DEFAULT_SERVER_CONFIG = {
  host: '0.0.0.0',
  /** Port standard 21 (990 en FTPS implicite) : droits administrateur requis sous Linux. */
  port: 2121,
  /** Dossier servi ('' : dossier « files » des données du module). */
  root: '',
  tls: 'none',
  /** FTPS explicite : connexion refusée tant que le canal de commande n'est pas chiffré. */
  requireTls: false,
  /** Plage de ports du mode passif (« 50000-50100 » ; vide : port quelconque). */
  passivePorts: '',
  /** Adresse annoncée en mode passif (derrière une traduction d'adresses) ; vide : adresse locale. */
  passiveAddress: '',
  /** Mode actif (PORT, EPRT), vers l'adresse du client uniquement. */
  allowActive: true,
  /** Connexion anonyme (« anonymous » ou « ftp », mot de passe quelconque), en lecture seule. */
  anonymous: false,
  /** Commandes reçues ajoutées au journal (mots de passe masqués). */
  logCommands: false,
  banner: 'Sulfur FTP server ready',
  /** Utilisateurs : empreinte scrypt du mot de passe (`passwordHash`), droit d'écriture. */
  users: [{ id: 'user-1', username: 'sulfur', passwordHash: '', readOnly: false }]
}

export const DEFAULT_CLIENT_CONFIG = {
  host: '127.0.0.1',
  port: 2121,
  username: 'sulfur',
  password: '',
  tls: 'none',
  /** Vérifie le certificat du serveur (autorités de confiance du système). */
  verifyCertificate: false,
  timeout: 10000
}
