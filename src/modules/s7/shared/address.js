import { AREAS, DATA_TYPES, DEFAULT_STRING_LENGTH, MAX_STRING_LENGTH } from './constants'
import { t } from './i18n'

/**
 * Adresses S7, en notation internationale ou allemande, avec ou sans « % » :
 *   DB1.DBX0.0  DB1.DBB2  DB1.DBW4  DB1.DBD8     (blocs de données)
 *   I0.1  IB0  IW2  ID4  (E…)  Q0.0  QB1 (A…)  M10.3  MB0  MW10  MD20
 * Résultat : { area: 'DB' | 'I' | 'Q' | 'M', db, offset, bit, size }, `bit` null hors adresse de bit,
 * `size` = lettre de taille ('X', 'B', 'W', 'D').
 */
const DB_PATTERN = /^%?DB(\d+)\.DB([XBWD])(\d+)(?:\.(\d+))?$/i
const AREA_PATTERN = /^%?([IEQAM])([XBWD]?)(\d+)(?:\.(\d+))?$/i

const LETTER_TO_AREA = Object.fromEntries(
  Object.entries(AREAS).flatMap(([key, a]) => (a.letters ?? []).map((letter) => [letter, key]))
)

export function parseAddress(text) {
  const raw = String(text ?? '')
    .trim()
    .replace(/\s+/g, '')
  let m = DB_PATTERN.exec(raw)
  if (m) {
    const [, db, size, offset, bit] = m
    return checked(raw, { area: 'DB', db: Number(db), size: size.toUpperCase(), offset: Number(offset), bit })
  }
  m = AREA_PATTERN.exec(raw)
  if (m) {
    const [, letter, size, offset, bit] = m
    return checked(raw, {
      area: LETTER_TO_AREA[letter.toUpperCase()],
      db: 0,
      size: (size || (bit !== undefined ? 'X' : 'B')).toUpperCase(),
      offset: Number(offset),
      bit
    })
  }
  throw new Error(t('s7.errors.invalidAddress', { address: raw || '—' }))
}

function checked(raw, { bit, ...address }) {
  const isBit = address.size === 'X'
  if (isBit !== (bit !== undefined)) throw new Error(t('s7.errors.invalidAddress', { address: raw }))
  const b = isBit ? Number(bit) : null
  if (isBit && b > 7) throw new Error(t('s7.errors.invalidBit', { address: raw }))
  if (address.area === 'DB' && (address.db < 1 || address.db > 65535))
    throw new Error(t('s7.errors.invalidDb', { address: raw }))
  if (address.offset > 0xffff) throw new Error(t('s7.errors.invalidAddress', { address: raw }))
  return { ...address, bit: b }
}

/** Longueur effective d'une chaîne (1 à 254). */
export const stringLength = (length) =>
  Math.min(MAX_STRING_LENGTH, Math.max(1, Math.round(Number(length)) || DEFAULT_STRING_LENGTH))

/** Nombre d'octets occupés par une valeur (1 pour un booléen). */
export function typeSize(dataType, length) {
  if (!(dataType in DATA_TYPES)) throw new Error(t('s7.errors.unknownType', { type: dataType }))
  if (dataType === 'String') return 2 + stringLength(length)
  return DATA_TYPES[dataType] || 1
}

/** Lettre de taille correspondant à un type (adresses affichées). */
function sizeLetter(dataType) {
  if (dataType === 'Bool') return 'X'
  if (dataType === 'String') return 'B'
  return { 2: 'W', 4: 'D' }[DATA_TYPES[dataType]] ?? 'B'
}

/** Type proposé par défaut pour une adresse saisie. */
export const defaultType = (size) => ({ X: 'Bool', B: 'Byte', W: 'Int', D: 'Real' })[size] ?? 'Byte'

/** Adresse canonique : `DB1.DBD4`, `MW10`, `I0.1`… */
export function formatAddress({ area, db, offset, bit }, dataType) {
  const letter = sizeLetter(dataType)
  const suffix = letter === 'X' ? `${offset}.${bit ?? 0}` : `${offset}`
  if (area === 'DB') return `DB${db}.DB${letter}${suffix}`
  return `${area}${letter === 'X' ? '' : letter}${suffix}`
}

/**
 * Adresse d'une valeur typée, vérifiée : un booléen exige un numéro de bit, les autres types une
 * adresse d'octet. Retourne { area, db, offset, bit, size (octets), dataType, length, text }.
 */
export function resolveAddress(text, dataType, length) {
  const address = parseAddress(text)
  const bit = dataType === 'Bool'
  if (bit && address.bit === null)
    throw new Error(t('s7.errors.boolNeedsBit', { address: formatAddress(address, 'Byte') }))
  if (!bit && address.bit !== null) throw new Error(t('s7.errors.typeNeedsByte', { type: dataType }))
  const size = typeSize(dataType, length)
  return {
    ...address,
    dataType,
    length: dataType === 'String' ? stringLength(length) : undefined,
    size,
    text: formatAddress(address, dataType)
  }
}
