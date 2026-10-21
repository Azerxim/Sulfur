import { builtinManifest } from '@modules/builtin'
export const NTP_MODULE = builtinManifest({
  id: 'ntp',
  name: 'NTP',
  description: 'Serveur de temps simulé (heure décalée, dérive, strate) et client NTP'
})

/** Indicateur de seconde intercalaire (libellés : ntp.leap.*). 3 : horloge non synchronisée. */
export const LEAP_INDICATORS = [0, 1, 2, 3]

/** Codes « Kiss-o'-Death » proposés pour le défaut correspondant (RFC 5905, § 7.4). */
export const KISS_CODES = ['DENY', 'RSTR', 'RATE']

/** Horloge simulée : décalage par rapport à l'heure réelle, ou heure fixée au démarrage. */
export const CLOCK_MODES = ['offset', 'fixed']

/** Raccourcis de décalage de l'horloge, en secondes (libellés : ntp.presets.<valeur>). */
export const OFFSET_PRESETS = [-31536000, -86400, -3600, -60, 60, 3600, 86400, 31536000]

/** Strate 16 : serveur non synchronisé. */
export const MAX_STRATUM = 16

/** Clients récents conservés par le serveur. */
export const MAX_CLIENTS = 50

export const DEFAULT_SERVER_CONFIG = {
  host: '0.0.0.0',
  // 123 est le port standard (droits administrateur requis sous Linux).
  port: 1123,
  clock: {
    mode: 'offset',
    /** Décalage (s) par rapport à l'heure réelle, mode « offset ». */
    offset: 0,
    /** Heure de départ (ISO), mode « fixed » : l'horloge part de cette heure au démarrage. */
    fixedTime: '',
    /** Dérive (ppm) : l'horloge avance plus vite (positif) ou moins vite (négatif). */
    drift: 0
  },
  stratum: 1,
  leap: 0,
  refId: 'GPS',
  /** Précision annoncée : puissance de 2 en secondes (−20 ≈ 1 µs). */
  precision: -20
}

export const DEFAULT_CLIENT_CONFIG = {
  host: '127.0.0.1',
  port: 1123,
  version: 4,
  timeout: 2000,
  /** Interrogation périodique (s). */
  pollInterval: 10
}
