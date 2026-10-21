import { builtinManifest } from '@shared/module'

export const S7_MODULE = builtinManifest({
  id: 's7',
  name: 'Siemens S7',
  description: 'Automate S7 simulé (S7comm) et client S7 (S7-300/400/1200/1500)'
})

/**
 * Zones mémoire accessibles par S7comm. `code` = identifiant de zone dans les requêtes ;
 * `letters` = préfixes acceptés dans les adresses (notation internationale puis allemande).
 */
export const AREAS = {
  DB: { code: 0x84, label: 'DB' },
  I: { code: 0x81, label: 'I', letters: ['I', 'E'] },
  Q: { code: 0x82, label: 'Q', letters: ['Q', 'A'] },
  M: { code: 0x83, label: 'M', letters: ['M'] }
}

/** Zone par code S7. */
export const AREA_BY_CODE = Object.fromEntries(Object.entries(AREAS).map(([key, a]) => [a.code, key]))

/**
 * Types de données S7 et taille en octets (0 : un bit). Les valeurs sont toujours big-endian.
 * `String` : chaîne S7 (longueur max + longueur courante + caractères), sur 2 + `length` octets.
 */
export const DATA_TYPES = {
  Bool: 0,
  Byte: 1,
  Char: 1,
  SInt: 1,
  USInt: 1,
  Word: 2,
  Int: 2,
  UInt: 2,
  DWord: 4,
  DInt: 4,
  UDInt: 4,
  Real: 4,
  LReal: 8,
  String: 2
}

/** Longueur maximale d'une chaîne S7. */
export const MAX_STRING_LENGTH = 254
export const DEFAULT_STRING_LENGTH = 32

/** Types de connexion (premier octet du TSAP distant). */
export const CONNECTION_TYPES = { PG: 1, OP: 2, S7Basic: 3 }

/** État de la CPU (SZL 0x0424) : RUN 0x08, STOP 0x04. */
export const CPU_STATES = ['run', 'stop']

/** Générateurs de valeurs (libellés : simulations.*). */
export const SIMULATIONS = ['none', 'sine', 'ramp', 'random', 'toggle']

/**
 * Codes de retour des éléments de lecture / écriture (libellés : s7.returnCodes.<code>), proposés
 * aussi pour le défaut « exception forcée ».
 */
export const RETURN_CODES = {
  SUCCESS: 0xff,
  HARDWARE_FAULT: 0x01,
  ACCESS_DENIED: 0x03,
  OUT_OF_RANGE: 0x05,
  TYPE_NOT_SUPPORTED: 0x06,
  TYPE_INCONSISTENT: 0x07,
  NOT_AVAILABLE: 0x0a
}

/** Tailles de PDU proposées : S7-300 (240), S7-400 / 1200 (480), S7-1500 (960). */
export const PDU_SIZES = [240, 480, 960]

/** Identité de la CPU simulée, renvoyée dans les listes d'état système (SZL 0x0011 et 0x001C). */
export const DEFAULT_IDENTITY = {
  orderCode: '6ES7 516-3AN02-0AB0',
  moduleName: 'CPU 1516-3 PN/DP',
  moduleType: 'CPU 1516-3 PN/DP',
  plantId: 'Sulfur',
  serialNumber: 'S C-SULFUR0001',
  copyright: 'Original Siemens Equipment',
  version: 'V3.1.0'
}

export const DEFAULT_SERVER_CONFIG = {
  host: '0.0.0.0',
  // 102 est le port standard (droits administrateur requis sous Linux, souvent pris sous Windows
  // par les services Siemens).
  port: 1102,
  pduSize: 960,
  updateRate: 100,
  /** Refuse toute écriture des clients (protection en écriture de la CPU). */
  readOnly: false,
  /** Taille des zones d'entrées, de sorties et de mémentos (octets). */
  sizes: { I: 1024, Q: 1024, M: 4096 },
  dbs: [
    { number: 1, size: 256, name: 'Process' },
    { number: 2, size: 128, name: 'Settings' }
  ],
  identity: DEFAULT_IDENTITY,
  points: [
    {
      id: 's7-pt-1',
      name: 'Temperature',
      address: 'DB1.DBD0',
      dataType: 'Real',
      initialValue: 20,
      simulation: 'sine',
      period: 10000,
      min: 15,
      max: 25
    },
    {
      id: 's7-pt-2',
      name: 'Counter',
      address: 'DB1.DBW4',
      dataType: 'Int',
      initialValue: 0,
      simulation: 'ramp',
      period: 10000,
      min: 0,
      max: 1000
    },
    {
      id: 's7-pt-3',
      name: 'Setpoint',
      address: 'DB2.DBD0',
      dataType: 'Real',
      initialValue: 50,
      simulation: 'none',
      period: 1000,
      min: 0,
      max: 100
    },
    {
      id: 's7-pt-4',
      name: 'Running',
      address: 'Q0.0',
      dataType: 'Bool',
      initialValue: true,
      simulation: 'toggle',
      period: 5000,
      min: 0,
      max: 1
    },
    {
      id: 's7-pt-5',
      name: 'Pressure',
      address: 'MD10',
      dataType: 'Real',
      initialValue: 1,
      simulation: 'random',
      period: 1000,
      min: 0.9,
      max: 1.1
    }
  ]
}

export const DEFAULT_CLIENT_CONFIG = {
  host: '127.0.0.1',
  port: 1102,
  /** Adressage : par rack / emplacement ('rackSlot') ou par TSAP explicites ('tsap'). */
  addressing: 'rackSlot',
  // S7-1500 : rack 0, emplacement 1 (S7-300 : emplacement 2).
  rack: 0,
  slot: 1,
  connectionType: 'PG',
  localTsap: '0100',
  remoteTsap: '0101',
  pduSize: 960,
  timeout: 3000,
  pollInterval: 500
}

/** Requête préparée du client. */
export const DEFAULT_CLIENT_REQUEST = {
  address: 'DB1.DBD0',
  dataType: 'Real',
  length: DEFAULT_STRING_LENGTH,
  /** Lecture brute (octets) : zone, DB, début, nombre d'octets. */
  rawArea: 'DB',
  rawDb: 1,
  rawStart: 0,
  rawCount: 32
}
