import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto'
import { promisify } from 'util'
import { t } from '../shared/i18n'

const scrypt = promisify(scryptCb)
const KEY_LENGTH = 32

/**
 * Hachage des mots de passe des utilisateurs du serveur (scrypt + sel aléatoire).
 * Format stocké : `scrypt$<sel base64>$<empreinte base64>` — le mot de passe en clair n'est jamais conservé.
 */
export async function hashPassword(password) {
  if (typeof password !== 'string' || !password) throw new Error(t('errors.emptyPassword'))
  const salt = randomBytes(16)
  const key = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH)
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password, stored) {
  const [algo, salt, hash] = String(stored ?? '').split('$')
  if (algo !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64')
  const key = await scrypt(String(password ?? '').normalize('NFKC'), Buffer.from(salt, 'base64'), expected.length)
  return timingSafeEqual(key, expected)
}

export const isPasswordHash = (value) => typeof value === 'string' && value.startsWith('scrypt$')
