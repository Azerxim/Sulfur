import { isPlainObject } from '@shared/config'
import { DEFAULT_IDENTITY } from './constants'

/**
 * Équipements (Unit ID) d'un serveur Modbus. Une configuration d'une version antérieure portait un
 * seul équipement à la racine (`unitId`, `points`) : elle est convertie en `units` d'un élément, en
 * gardant les identifiants des points (utilisés par le simulateur et les courbes).
 */
export function normalizeServerConfig(config) {
  if (!isPlainObject(config) || Array.isArray(config.units)) return config
  const { unitId = 1, points = [], ...rest } = config
  return {
    ...rest,
    units: [{ id: 'unit-1', unitId: Number(unitId), name: '', identity: DEFAULT_IDENTITY, points }]
  }
}

/** Configuration enregistrée du module (section `server`) d'une version antérieure. */
export function migrateModbusConfig(config) {
  if (!isPlainObject(config?.server) || Array.isArray(config.server.units)) return config
  return { ...config, server: normalizeServerConfig(config.server) }
}

/** Libellé d'un équipement : « Unit 1 », suivi de son nom s'il en a un. */
export const unitLabel = (unit) => (unit.name ? `Unit ${unit.unitId} · ${unit.name}` : `Unit ${unit.unitId}`)

/** Tous les points du serveur, avec l'équipement qui les porte : [{ unit, point }]. */
export const allPoints = (config) =>
  (config?.units ?? []).flatMap((unit) => unit.points.map((point) => ({ unit, point })))
