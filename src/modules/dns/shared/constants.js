import { builtinManifest } from '@modules/builtin'
export const DNS_MODULE = builtinManifest({
  id: 'dns',
  name: 'DNS',
  description: 'Serveur DNS simulé (zone locale, relais) et client de résolution'
})

/** Types d'enregistrement gérés par la zone locale. */
export const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'PTR', 'NS']

/** Types proposés par le client (ANY : tous les enregistrements du nom). */
export const QUERY_TYPES = [...RECORD_TYPES, 'SOA', 'ANY']

/** Codes de réponse proposés pour le défaut « réponse forcée ». */
export const FORCED_RCODES = ['SERVFAIL', 'NXDOMAIN', 'REFUSED']

/** Requêtes conservées dans le journal du serveur. */
export const MAX_QUERIES = 500

export const DEFAULT_SERVER_CONFIG = {
  host: '0.0.0.0',
  /** Port standard 53 : droits administrateur requis sous Linux. */
  port: 1053,
  /** Écoute aussi en TCP (réponses volumineuses, transferts). */
  tcp: true,
  /** Domaine de la zone : un nom sans point final y est rattaché (plc1 → plc1.sulfur.local). */
  domain: 'sulfur.local',
  ttl: 300,
  /** Enregistrements PTR déduits des enregistrements A et AAAA (résolution inverse). */
  autoPtr: true,
  /** Relais des noms hors zone vers des serveurs amont (sinon : NXDOMAIN). */
  forward: { enabled: false, servers: '1.1.1.1, 8.8.8.8' },
  records: [
    { id: 'r-1', name: 'plc1', type: 'A', value: '192.168.1.10', ttl: '' },
    { id: 'r-2', name: 'hmi', type: 'A', value: '192.168.1.20', ttl: '' },
    { id: 'r-3', name: 'scada', type: 'CNAME', value: 'hmi', ttl: '' },
    { id: 'r-4', name: '@', type: 'MX', value: '10 mail', ttl: '' },
    { id: 'r-5', name: 'mail', type: 'A', value: '192.168.1.25', ttl: '' },
    { id: 'r-6', name: '_opcua-tcp._tcp', type: 'SRV', value: '0 0 4840 plc1', ttl: '' },
    { id: 'r-7', name: '@', type: 'TXT', value: 'Sulfur test zone', ttl: '' }
  ]
}

export const DEFAULT_CLIENT_CONFIG = {
  server: '127.0.0.1',
  port: 1053,
  name: 'plc1.sulfur.local',
  type: 'A',
  /** Interrogation en TCP plutôt qu'en UDP. */
  tcp: false,
  recursion: true,
  timeout: 2000
}
