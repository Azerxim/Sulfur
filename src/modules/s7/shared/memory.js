import { resolveAddress } from './address'
import { t } from './i18n'

/** Taille maximale d'une zone ou d'un bloc de données (octets). */
export const MAX_AREA_SIZE = 65536

/** Vérifie la configuration du serveur ; retourne { sizes, dbs } normalisés. */
export function validateMemory(config) {
  const sizes = {}
  for (const area of ['I', 'Q', 'M']) {
    const size = Number(config.sizes?.[area])
    if (!Number.isInteger(size) || size < 1 || size > MAX_AREA_SIZE)
      throw new Error(t('s7.errors.invalidAreaSize', { area, max: MAX_AREA_SIZE }))
    sizes[area] = size
  }
  const dbs = new Map()
  for (const db of config.dbs ?? []) {
    const number = Number(db.number)
    const size = Number(db.size)
    if (!Number.isInteger(number) || number < 1 || number > 65535) throw new Error(t('s7.errors.invalidDbNumber'))
    if (dbs.has(number)) throw new Error(t('s7.errors.duplicateDb', { number }))
    if (!Number.isInteger(size) || size < 1 || size > MAX_AREA_SIZE)
      throw new Error(t('s7.errors.invalidDbSize', { number, max: MAX_AREA_SIZE }))
    dbs.set(number, size)
  }
  return { sizes, dbs }
}

/** Vérifie un point (nom, type, adresse dans la mémoire). Retourne son adresse résolue. */
export function validatePoint(def, memory) {
  if (!def.name?.trim()) throw new Error(t('s7.errors.emptyPointName'))
  let address
  try {
    address = resolveAddress(def.address, def.dataType, def.length)
  } catch (err) {
    throw new Error(t('s7.errors.pointAddress', { name: def.name, message: err.message }), { cause: err })
  }
  const size = address.area === 'DB' ? memory.dbs.get(address.db) : memory.sizes[address.area]
  if (size === undefined) throw new Error(t('s7.errors.pointUnknownDb', { name: def.name, db: address.db }))
  if (address.offset + address.size > size)
    throw new Error(t('s7.errors.pointOutOfRange', { name: def.name, address: address.text, size }))
  return address
}
