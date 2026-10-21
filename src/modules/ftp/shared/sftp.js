/** Constantes de la partie SFTP du module. */
export { MAX_LOG } from './constants'

export const DEFAULT_SERVER_CONFIG = {
  host: '0.0.0.0',
  /** Port standard 22 : droits administrateur requis sous Linux, souvent déjà pris par sshd. */
  port: 2222,
  /** Dossier servi ('' : dossier « files » des données du module). */
  root: '',
  /**
   * Utilisateurs : mot de passe (empreinte scrypt `passwordHash`) et/ou clés publiques autorisées
   * (format OpenSSH, une par ligne), droit d'écriture.
   */
  users: [{ id: 'user-1', username: 'sulfur', passwordHash: '', authorizedKeys: '', readOnly: false }]
}

export const DEFAULT_CLIENT_CONFIG = {
  host: '127.0.0.1',
  port: 2222,
  username: 'sulfur',
  /** Authentification : 'password' ou 'key' (clé privée OpenSSH / PEM). */
  auth: 'password',
  password: '',
  privateKey: '',
  passphrase: '',
  /** Empreinte attendue de la clé d'hôte (SHA256:…) ; vide : acceptée et affichée. */
  hostFingerprint: '',
  timeout: 5000
}
