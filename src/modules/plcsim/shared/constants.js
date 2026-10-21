import { builtinManifest } from '@modules/builtin'
export const PLCSIM_MODULE = builtinManifest({
  id: 'plcsim',
  name: 'PLCSim Advanced',
  description: 'Automates virtuels S7-1500 de S7-PLCSIM Advanced (Windows)'
})

/** Dossier d'installation de l'API Simulation Runtime (un sous-dossier par version : 3.0 … 8.0). */
export const DEFAULT_API_ROOT = 'C:\\Program Files (x86)\\Common Files\\Siemens\\PLCSIMADV\\API'

export const API_DLL = {
  x64: 'Siemens.Simatic.Simulation.Runtime.Api.x64.dll',
  x86: 'Siemens.Simatic.Simulation.Runtime.Api.x86.dll'
}

/** États de fonctionnement d'une instance (libellés : plcsim.states.*). */
export const OPERATING_STATES = ['Off', 'Booting', 'Stop', 'Startup', 'Run', 'Freeze', 'ShuttingDown', 'Hold']

/** Zones accessibles par adresse (les DB ne le sont que par le nom de leurs variables). */
export const ADDRESS_AREAS = ['I', 'Q', 'M']

/** Types lisibles à une adresse I / Q / M (codec S7, big-endian). */
export const ADDRESS_TYPES = [
  'Bool',
  'Byte',
  'Char',
  'SInt',
  'USInt',
  'Word',
  'Int',
  'UInt',
  'DWord',
  'DInt',
  'UDInt',
  'Real',
  'LReal'
]

/** Types primitifs de l'API (lecture / écriture par nom) considérés comme non numériques. */
export const TEXT_TYPES = ['String', 'WString', 'Char', 'WChar']

/** Délais des opérations sur les instances (ms) : la mise sous tension peut prendre une minute. */
export const OPERATION_TIMEOUTS = {
  powerOn: 60_000,
  powerOff: 30_000,
  run: 30_000,
  stop: 30_000,
  memoryReset: 60_000
}

/** Port du Runtime Manager ouvert aux connexions distantes (panneau de contrôle de PLCSIM Advanced). */
export const DEFAULT_REMOTE_PORT = 50000

/** Mode de connexion : Runtime Manager de ce PC, ou celui d'un autre PC (connexion distante). */
export const CONNECTION_MODES = ['local', 'remote']

export const DEFAULT_SETTINGS = {
  /** Dossier de l'API ou chemin de la DLL ; vide = version la plus récente installée. */
  apiPath: '',
  mode: 'local',
  /** PC distant (adresse IP ou nom) et port de son Runtime Manager. */
  remoteHost: '',
  remotePort: DEFAULT_REMOTE_PORT,
  /** Connexion à l'API au démarrage de Sulfur. */
  autoConnect: false
}

/** Intervalle de lecture des surveillances par défaut (ms). */
export const DEFAULT_POLL_INTERVAL = 500

/** Nouvelle instance proposée. */
export const DEFAULT_NEW_INSTANCE = {
  name: 'PLC_1',
  cpuType: 'CPU1516'
}
