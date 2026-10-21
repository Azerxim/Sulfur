import dns from 'dns/promises'
import net from 'net'
import os from 'os'
import { MAX_HOSTS } from '../shared/constants'
import { PRIVATE_NETWORKS, intToIp, ipToInt, isIPv4, isPrivateIPv4 } from '@shared/networks'
import { t } from '../shared/i18n'

const notPrivate = (value) =>
  new Error(t('explorer.errors.notPrivate', { value, networks: PRIVATE_NETWORKS.map((n) => n.cidr).join(', ') }))

/**
 * Adresses IPv4 d'une saisie libre (virgules, espaces ou retours à la ligne) :
 *  - adresse seule : 192.168.1.10
 *  - réseau : 192.168.1.0/24 (sans l'adresse de réseau ni de diffusion à partir de /30)
 *  - plage : 192.168.1.10-50 ou 192.168.1.10-192.168.1.50
 *  - nom d'hôte : résolu par le DNS
 * Retourne les adresses uniques dans l'ordre ; au plus MAX_HOSTS.
 *
 * Seules les adresses des réseaux privés (RFC 1918) sont acceptées : une saisie qui en sort, même
 * en partie (ou un nom qui se résout hors de ces réseaux), est refusée en entier. `allow` ne sert
 * qu'aux tests (analyse de 127.0.0.1) : l'interface n'a aucun moyen de le changer.
 */
export async function parseTargets(text, { allow = isPrivateIPv4 } = {}) {
  const tokens = String(text ?? '')
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (!tokens.length) throw new Error(t('explorer.errors.noTarget'))
  const out = new Set()
  const add = (n, token) => {
    const ip = intToIp(n)
    if (!allow(ip)) throw notPrivate(token)
    out.add(ip)
    if (out.size > MAX_HOSTS) throw new Error(t('explorer.errors.tooManyHosts', { max: MAX_HOSTS }))
  }
  // Bornes d'un réseau ou d'une plage contrôlées avant le nombre d'adresses : « 8.0.0.0/8 » est
  // refusé comme réseau public, pas comme réseau trop grand.
  const checkBounds = (first, last, token) => {
    if (!allow(intToIp(first)) || !allow(intToIp(last))) throw notPrivate(token)
  }

  for (const token of tokens) {
    const cidr = token.match(/^(\d+\.\d+\.\d+\.\d+)\/(\d{1,2})$/)
    const range = token.match(/^(\d+\.\d+\.\d+\.\d+)-(\d+(?:\.\d+\.\d+\.\d+)?)$/)
    if (cidr) {
      const bits = Number(cidr[2])
      if (!isIPv4(cidr[1]) || bits > 32) throw new Error(t('explorer.errors.invalidTarget', { value: token }))
      const size = 2 ** (32 - bits)
      const base = Math.floor(ipToInt(cidr[1]) / size) * size
      checkBounds(base, base + size - 1, token)
      if (size > MAX_HOSTS * 2) throw new Error(t('explorer.errors.tooManyHosts', { max: MAX_HOSTS }))
      const [first, last] = size >= 4 ? [base + 1, base + size - 2] : [base, base + size - 1]
      for (let n = first; n <= last; n++) add(n, token)
    } else if (range) {
      if (!isIPv4(range[1])) throw new Error(t('explorer.errors.invalidTarget', { value: token }))
      const start = ipToInt(range[1])
      const endIp = range[2].includes('.') ? range[2] : range[1].replace(/\d+$/, range[2])
      if (!isIPv4(endIp)) throw new Error(t('explorer.errors.invalidTarget', { value: token }))
      const end = ipToInt(endIp)
      if (end < start) throw new Error(t('explorer.errors.invalidTarget', { value: token }))
      checkBounds(start, end, token)
      if (end - start >= MAX_HOSTS) throw new Error(t('explorer.errors.tooManyHosts', { max: MAX_HOSTS }))
      for (let n = start; n <= end; n++) add(n, token)
    } else if (isIPv4(token)) {
      add(ipToInt(token), token)
    } else if (net.isIPv6(token)) {
      throw new Error(t('explorer.errors.ipv6', { value: token }))
    } else if (/^[\d.]+$/.test(token)) {
      // Adresse mal formée (192.168.1.300) : pas un nom d'hôte à résoudre.
      throw new Error(t('explorer.errors.invalidTarget', { value: token }))
    } else if (/^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(token)) {
      let address
      try {
        ;({ address } = await dns.lookup(token, { family: 4 }))
      } catch {
        throw new Error(t('explorer.errors.unknownHost', { value: token }))
      }
      if (!allow(address)) throw notPrivate(`${token} (${address})`)
      add(ipToInt(address), token)
    } else {
      throw new Error(t('explorer.errors.invalidTarget', { value: token }))
    }
  }
  return [...out]
}

/**
 * Réseaux IPv4 privés de la machine (pour proposer une cible) : [{ interface, address, cidr }].
 * Les interfaces dont l'adresse n'est pas privée sont ignorées.
 */
export function localNetworks() {
  const networks = []
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    for (const a of addresses ?? []) {
      if (a.family !== 'IPv4' && a.family !== 4) continue
      if (a.internal || !isPrivateIPv4(a.address)) continue
      const bits = a.netmask
        .split('.')
        .reduce((n, part) => n + (Number(part) >>> 0).toString(2).split('1').length - 1, 0)
      // Réseaux trop grands : limités au /24 de l'adresse (toujours inclus dans le réseau privé).
      const prefix = Math.max(bits, 24)
      const size = 2 ** (32 - prefix)
      const base = Math.floor(ipToInt(a.address) / size) * size
      networks.push({ interface: name, address: a.address, cidr: `${intToIp(base)}/${prefix}` })
    }
  }
  return networks
}
