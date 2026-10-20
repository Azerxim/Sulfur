import dns from 'dns/promises'
import net from 'net'
import os from 'os'
import { MAX_HOSTS } from '../shared/constants'
import { t } from '../shared/i18n'

const ipToInt = (ip) => ip.split('.').reduce((n, part) => n * 256 + Number(part), 0)
const intToIp = (n) => [24, 16, 8, 0].map((shift) => Math.floor(n / 2 ** shift) % 256).join('.')

/**
 * Adresses IPv4 d'une saisie libre (virgules, espaces ou retours à la ligne) :
 *  - adresse seule : 192.168.1.10
 *  - réseau : 192.168.1.0/24 (sans l'adresse de réseau ni de diffusion à partir de /30)
 *  - plage : 192.168.1.10-50 ou 192.168.1.10-192.168.1.50
 *  - nom d'hôte : résolu par le DNS
 * Retourne les adresses uniques dans l'ordre ; au plus MAX_HOSTS.
 */
export async function parseTargets(text) {
  const tokens = String(text ?? '')
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (!tokens.length) throw new Error(t('explorer.errors.noTarget'))
  const out = new Set()
  const add = (n) => {
    out.add(intToIp(n))
    if (out.size > MAX_HOSTS) throw new Error(t('explorer.errors.tooManyHosts', { max: MAX_HOSTS }))
  }

  for (const token of tokens) {
    const cidr = token.match(/^(\d+\.\d+\.\d+\.\d+)\/(\d{1,2})$/)
    const range = token.match(/^(\d+\.\d+\.\d+\.\d+)-(\d+(?:\.\d+\.\d+\.\d+)?)$/)
    if (cidr) {
      const bits = Number(cidr[2])
      if (net.isIPv4(cidr[1]) === false || bits > 32)
        throw new Error(t('explorer.errors.invalidTarget', { value: token }))
      const size = 2 ** (32 - bits)
      if (size > MAX_HOSTS * 2) throw new Error(t('explorer.errors.tooManyHosts', { max: MAX_HOSTS }))
      const base = Math.floor(ipToInt(cidr[1]) / size) * size
      const [first, last] = size >= 4 ? [base + 1, base + size - 2] : [base, base + size - 1]
      for (let n = first; n <= last; n++) add(n)
    } else if (range) {
      if (!net.isIPv4(range[1])) throw new Error(t('explorer.errors.invalidTarget', { value: token }))
      const start = ipToInt(range[1])
      const endIp = range[2].includes('.') ? range[2] : range[1].replace(/\d+$/, range[2])
      if (!net.isIPv4(endIp)) throw new Error(t('explorer.errors.invalidTarget', { value: token }))
      const end = ipToInt(endIp)
      if (end < start) throw new Error(t('explorer.errors.invalidTarget', { value: token }))
      if (end - start >= MAX_HOSTS) throw new Error(t('explorer.errors.tooManyHosts', { max: MAX_HOSTS }))
      for (let n = start; n <= end; n++) add(n)
    } else if (net.isIPv4(token)) {
      add(ipToInt(token))
    } else if (net.isIPv6(token)) {
      throw new Error(t('explorer.errors.ipv6', { value: token }))
    } else if (/^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(token)) {
      let address
      try {
        ;({ address } = await dns.lookup(token, { family: 4 }))
      } catch {
        throw new Error(t('explorer.errors.unknownHost', { value: token }))
      }
      add(ipToInt(address))
    } else {
      throw new Error(t('explorer.errors.invalidTarget', { value: token }))
    }
  }
  return [...out]
}

/** Réseaux IPv4 locaux de la machine (pour proposer une cible) : ['192.168.1.0/24', …]. */
export function localNetworks() {
  const networks = []
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    for (const a of addresses ?? []) {
      if (a.family !== 'IPv4' && a.family !== 4) continue
      if (a.internal) continue
      const bits = a.netmask
        .split('.')
        .reduce((n, part) => n + (Number(part) >>> 0).toString(2).split('1').length - 1, 0)
      // Réseaux trop grands : limités au /24 de l'adresse.
      const prefix = Math.max(bits, 24)
      const size = 2 ** (32 - prefix)
      const base = Math.floor(ipToInt(a.address) / size) * size
      networks.push({ interface: name, address: a.address, cidr: `${intToIp(base)}/${prefix}` })
    }
  }
  return networks
}
