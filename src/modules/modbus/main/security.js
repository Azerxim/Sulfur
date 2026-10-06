import net from 'net'
import { t } from '../shared/i18n'

/** '::ffff:192.168.1.10' → '192.168.1.10' */
export const normalizeIp = (ip = '') => (ip.startsWith('::ffff:') ? ip.slice(7) : ip)

/**
 * Construit la liste des adresses autorisées (net.BlockList utilisée comme liste blanche).
 * Entrées acceptées : adresse IPv4/IPv6 ou sous-réseau CIDR. Liste vide → null (tout est autorisé).
 */
export function buildAllowList(entries = []) {
  const clean = entries.map((e) => String(e).trim()).filter(Boolean)
  if (!clean.length) return null
  const list = new net.BlockList()
  for (const entry of clean) {
    const [address, prefix] = entry.split('/')
    const type = net.isIPv4(address) ? 'ipv4' : net.isIPv6(address) ? 'ipv6' : null
    if (!type) throw new Error(t('modbus.errors.invalidAllowedIp', { entry }))
    if (prefix === undefined) {
      list.addAddress(address, type)
    } else {
      const bits = Number(prefix)
      const max = type === 'ipv4' ? 32 : 128
      if (!Number.isInteger(bits) || bits < 0 || bits > max) throw new Error(t('modbus.errors.invalidMask', { entry }))
      list.addSubnet(address, bits, type)
    }
  }
  return list
}

export function isAllowed(list, ip) {
  if (!list) return true
  const address = normalizeIp(ip)
  const type = net.isIPv6(address) ? 'ipv6' : 'ipv4'
  try {
    return list.check(address, type)
  } catch {
    return false
  }
}

/** Limiteur de débit à seau de jetons : `perSecond` requêtes par seconde, rafale égale à `perSecond`. */
export class RateLimiter {
  constructor(perSecond) {
    this.rate = perSecond / 1000
    this.capacity = perSecond
    this.tokens = perSecond
    this.last = Date.now()
  }

  take() {
    const now = Date.now()
    this.tokens = Math.min(this.capacity, this.tokens + (now - this.last) * this.rate)
    this.last = now
    if (this.tokens < 1) return false
    this.tokens -= 1
    return true
  }
}

/**
 * Détermine les droits d'un client TLS à partir du rôle de son certificat.
 * Rôle inconnu ou absent → rôle par défaut s'il est défini, sinon null (connexion refusée).
 */
export function resolveRole(security, certRole) {
  const roles = security.roles ?? []
  return (
    roles.find((r) => r.name === certRole) ??
    (security.defaultRole ? roles.find((r) => r.name === security.defaultRole) : null) ??
    null
  )
}
