/**
 * Réseaux privés IPv4 (RFC 1918) : les seules adresses sur lesquelles l'explorateur réseau et le
 * module DHCP acceptent de travailler. Code sans dépendance Node : utilisé par le process principal
 * (contrôle) et par l'interface (indication avant le lancement).
 */
export const PRIVATE_NETWORKS = [
  { cidr: '10.0.0.0/8', first: 10 * 2 ** 24, last: 11 * 2 ** 24 - 1 },
  { cidr: '172.16.0.0/12', first: (172 * 256 + 16) * 2 ** 16, last: (172 * 256 + 32) * 2 ** 16 - 1 },
  { cidr: '192.168.0.0/16', first: (192 * 256 + 168) * 2 ** 16, last: (192 * 256 + 169) * 2 ** 16 - 1 }
]

const OCTET = /^(0|[1-9]\d{0,2})$/

/** Adresse IPv4 en notation décimale pointée stricte (pas de zéro initial, octets ≤ 255). */
export function isIPv4(text) {
  const parts = String(text).split('.')
  return parts.length === 4 && parts.every((p) => OCTET.test(p) && Number(p) <= 255)
}

export const ipToInt = (ip) => ip.split('.').reduce((n, part) => n * 256 + Number(part), 0)
export const intToIp = (n) => [24, 16, 8, 0].map((shift) => Math.floor(n / 2 ** shift) % 256).join('.')

/** Réseau privé contenant l'adresse (entier ou texte), null si elle n'est pas privée. */
export function privateNetworkOf(ip) {
  const n = typeof ip === 'number' ? ip : isIPv4(ip) ? ipToInt(ip) : NaN
  return PRIVATE_NETWORKS.find((network) => n >= network.first && n <= network.last) ?? null
}

export const isPrivateIPv4 = (ip) => privateNetworkOf(ip) !== null

/** Longueur du préfixe d'un masque (255.255.255.0 → 24), null si le masque n'est pas contigu. */
export function prefixLength(netmask) {
  if (!isIPv4(netmask)) return null
  const bits = ipToInt(netmask).toString(2).padStart(32, '0')
  if (!/^1*0*$/.test(bits)) return null
  const zero = bits.indexOf('0')
  return zero === -1 ? 32 : zero
}

/** Masque d'un préfixe (24 → 255.255.255.0). */
export const netmaskOf = (prefix) => intToIp(prefix === 0 ? 0 : 2 ** 32 - 2 ** (32 - prefix))

/**
 * Sous-réseau d'une adresse : { network, broadcast, prefix, netmask, cidr }, adresses de réseau et
 * de diffusion en entiers. null si l'adresse ou le masque sont invalides.
 */
export function subnetOf(address, netmask) {
  const prefix = prefixLength(netmask)
  if (!isIPv4(address) || prefix === null) return null
  const size = 2 ** (32 - prefix)
  const network = Math.floor(ipToInt(address) / size) * size
  return {
    network,
    broadcast: network + size - 1,
    prefix,
    netmask: netmaskOf(prefix),
    cidr: `${intToIp(network)}/${prefix}`
  }
}

/** Sous-réseau entièrement compris dans un même réseau privé. */
export function isPrivateSubnet(subnet) {
  const network = privateNetworkOf(subnet.network)
  return network !== null && subnet.broadcast <= network.last
}
