import { builtinManifest } from '@modules/builtin'
export const LDAP_MODULE = builtinManifest({
  id: 'ldap',
  name: 'LDAP / RADIUS',
  description: 'Annuaire LDAP / LDAPS et serveur RADIUS simulés (authentification centralisée) et clients'
})

/** Sécurité du serveur (libellés : ldap.security.*). */
export const SECURITY_MODES = ['plain', 'ldaps']

/** Portées de recherche (libellés : ldap.scopes.*). */
export const SCOPES = ['base', 'one', 'sub']

/** Codes de résultat proposés pour le défaut « réponse forcée ». */
export const FORCED_RESULTS = [
  { value: 51, label: '51 busy' },
  { value: 52, label: '52 unavailable' },
  { value: 53, label: '53 unwillingToPerform' },
  { value: 80, label: '80 other' }
]

/** Événements conservés dans le journal du serveur. */
export const MAX_LOG = 500

/** Annuaire d'exemple (bouton « Annuaire d'exemple », fichier d'exemple des releases, tests). */
export const EXAMPLE_LDIF = `# Annuaire de test : mots de passe en clair ou {SSHA}, {SHA}
dn: dc=sulfur,dc=local
objectClass: top
objectClass: domain
dc: sulfur

dn: ou=people,dc=sulfur,dc=local
objectClass: organizationalUnit
ou: people

dn: ou=groups,dc=sulfur,dc=local
objectClass: organizationalUnit
ou: groups

dn: uid=operator,ou=people,dc=sulfur,dc=local
objectClass: inetOrgPerson
uid: operator
cn: Operator
sn: Operator
mail: operator@sulfur.local
userPassword: operator

dn: uid=engineer,ou=people,dc=sulfur,dc=local
objectClass: inetOrgPerson
uid: engineer
cn: Engineer
sn: Engineer
mail: engineer@sulfur.local
userPassword: engineer

dn: cn=operators,ou=groups,dc=sulfur,dc=local
objectClass: groupOfNames
cn: operators
member: uid=operator,ou=people,dc=sulfur,dc=local
member: uid=engineer,ou=people,dc=sulfur,dc=local

dn: cn=engineers,ou=groups,dc=sulfur,dc=local
objectClass: groupOfNames
cn: engineers
member: uid=engineer,ou=people,dc=sulfur,dc=local
`

/** Exemple (fichier d'exemple des releases, tests) : annuaire de test. */
export const EXAMPLE_SERVER_CONFIG = {
  host: '0.0.0.0',
  /** Ports standards 389 (LDAP) et 636 (LDAPS) : droits administrateur requis sous Linux. */
  /** LDAPS par défaut (TLS dès la connexion) ; en LDAP simple, port 1389. */
  port: 1636,
  security: 'ldaps',
  /** Passage en TLS d'une connexion LDAP (opération étendue StartTLS). */
  startTls: true,
  /** Liaison anonyme et recherche sans authentification. */
  allowAnonymous: true,
  /** Nombre maximal d'entrées renvoyées par une recherche. */
  sizeLimit: 500,
  ldif: EXAMPLE_LDIF
}

/** Configuration d'un nouveau serveur : annuaire vide. */
export const DEFAULT_SERVER_CONFIG = { ...EXAMPLE_SERVER_CONFIG, ldif: '' }

/** Exemple (fichier d'exemple des releases, tests) : compte operator de l'annuaire d'exemple. */
export const EXAMPLE_CLIENT_CONFIG = {
  url: 'ldaps://127.0.0.1:1636',
  startTls: false,
  /** TLS : refuser un certificat serveur non reconnu (auto-signé). */
  rejectUnauthorized: false,
  bindDn: 'uid=operator,ou=people,dc=sulfur,dc=local',
  password: '',
  base: 'dc=sulfur,dc=local',
  scope: 'sub',
  filter: '(objectClass=inetOrgPerson)',
  attributes: '',
  sizeLimit: 100,
  timeout: 5000
}

/** Configuration d'un nouveau client : liaison anonyme, base à saisir, toutes les entrées. */
export const DEFAULT_CLIENT_CONFIG = { ...EXAMPLE_CLIENT_CONFIG, bindDn: '', base: '', filter: '(objectClass=*)' }
