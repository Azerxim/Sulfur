import os from 'os'
import { PRIVATE_NETWORKS, intToIp, ipToInt, isIPv4, isPrivateIPv4, isPrivateSubnet, subnetOf } from '@shared/networks'
import { DEFAULT_CLIENT_CONFIG, DEFAULT_SERVER_CONFIG, MAX_LEASE, MAX_POOL, MIN_LEASE } from '../shared/constants'
import { normalizeMac } from './protocol'
import { t } from '../shared/i18n'

const networksText = () => PRIVATE_NETWORKS.map((n) => n.cidr).join(', ')

/**
 * Interfaces IPv4 de la machine : [{ name, address, netmask, cidr, mac, private }]. `private` :
 * sous-réseau entièrement compris dans un réseau privé (seules ces interfaces sont utilisables).
 */
export function listInterfaces() {
  const list = []
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    for (const a of addresses ?? []) {
      if ((a.family !== 'IPv4' && a.family !== 4) || a.internal) continue
      const subnet = subnetOf(a.address, a.netmask)
      if (!subnet) continue
      list.push({
        name,
        address: a.address,
        netmask: subnet.netmask,
        cidr: subnet.cidr,
        mac: a.mac && a.mac !== '00:00:00:00:00:00' ? a.mac : null,
        private: isPrivateSubnet(subnet)
      })
    }
  }
  return list
}

function checkPort(value) {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(t('dhcp.errors.invalidPort'))
  return port
}

/**
 * Interface choisie (obligatoire, aucune valeur par défaut) avec son sous-réseau. Elle doit avoir
 * une adresse IPv4 dont le sous-réseau est entièrement privé. `allowSubnet` ne sert qu'aux tests.
 */
export function resolveInterface(name, { interfaces = listInterfaces, allowSubnet = isPrivateSubnet } = {}) {
  const wanted = String(name ?? '').trim()
  if (!wanted) throw new Error(t('dhcp.errors.noInterface'))
  const iface = interfaces().find((i) => i.name === wanted)
  if (!iface) throw new Error(t('dhcp.errors.interfaceNotFound', { name: wanted }))
  const subnet = subnetOf(iface.address, iface.netmask)
  if (!subnet || !allowSubnet(subnet))
    throw new Error(
      t('dhcp.errors.interfaceNotPrivate', {
        name: wanted,
        cidr: subnet?.cidr ?? iface.address,
        networks: networksText()
      })
    )
  return { ...iface, subnet }
}

/** Liste d'adresses MAC (virgules, espaces, retours à la ligne) normalisées et sans doublon. */
export function parseMacList(text) {
  const out = new Set()
  for (const token of String(text ?? '')
    .split(/[\s,;]+/)
    .filter(Boolean)) {
    const mac = normalizeMac(token)
    if (!mac) throw new Error(t('dhcp.errors.invalidMac', { value: token }))
    out.add(mac)
  }
  return [...out]
}

/**
 * Configuration du serveur vérifiée et normalisée, par rapport au sous-réseau de l'interface :
 * plage comprise dans le sous-réseau (sans les adresses de réseau, de diffusion ni celle du
 * serveur), au plus MAX_POOL adresses ; passerelle dans le sous-réseau ; serveurs DNS privés.
 */
export function prepareServerConfig(options, env) {
  const config = { ...DEFAULT_SERVER_CONFIG, ...options }
  const iface = resolveInterface(config.interface, env)
  const { subnet } = iface
  const inSubnet = (n) => n > subnet.network && n < subnet.broadcast

  const start = String(config.poolStart ?? '').trim()
  const end = String(config.poolEnd ?? '').trim()
  for (const value of [start, end]) {
    if (!isIPv4(value)) throw new Error(t('dhcp.errors.invalidIp', { value: value || '—' }))
    if (!inSubnet(ipToInt(value))) throw new Error(t('dhcp.errors.poolOutsideSubnet', { value, cidr: subnet.cidr }))
  }
  const first = ipToInt(start)
  const last = ipToInt(end)
  if (last < first) throw new Error(t('dhcp.errors.poolOrder'))
  if (last - first + 1 > MAX_POOL) throw new Error(t('dhcp.errors.poolTooLarge', { max: MAX_POOL }))
  const server = ipToInt(iface.address)
  if (server >= first && server <= last)
    throw new Error(t('dhcp.errors.poolIncludesServer', { address: iface.address }))

  const router = String(config.router ?? '').trim()
  if (router) {
    if (!isIPv4(router) || !inSubnet(ipToInt(router)))
      throw new Error(t('dhcp.errors.invalidRouter', { value: router, cidr: subnet.cidr }))
    if (ipToInt(router) >= first && ipToInt(router) <= last) throw new Error(t('dhcp.errors.routerInPool'))
  }

  const dns = String(config.dns ?? '')
    .split(/[\s,;]+/)
    .filter(Boolean)
  for (const value of dns) {
    if (!isIPv4(value)) throw new Error(t('dhcp.errors.invalidIp', { value }))
    if (!isPrivateIPv4(value)) throw new Error(t('dhcp.errors.dnsNotPrivate', { value, networks: networksText() }))
  }

  const domain = String(config.domain ?? '').trim()
  if (domain && (domain.length > 253 || !/^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(domain)))
    throw new Error(t('dhcp.errors.invalidDomain', { value: domain }))

  const leaseTime = Number(config.leaseTime)
  if (!Number.isInteger(leaseTime) || leaseTime < MIN_LEASE || leaseTime > MAX_LEASE)
    throw new Error(t('dhcp.errors.invalidLease', { min: MIN_LEASE, max: MAX_LEASE }))

  const macFilter = !!config.macFilter
  const macs = parseMacList(config.macs)
  if (macFilter && !macs.length) throw new Error(t('dhcp.errors.emptyMacList'))

  return {
    ...config,
    interface: iface.name,
    address: iface.address,
    subnet,
    poolStart: intToIp(first),
    poolEnd: intToIp(last),
    router,
    dns,
    domain,
    leaseTime,
    macFilter,
    macs,
    port: checkPort(config.port),
    clientPort: checkPort(config.clientPort)
  }
}

/** Configuration du client vérifiée : interface privée, adresse MAC, délai d'attente. */
export function prepareClientConfig(options, env) {
  const config = { ...DEFAULT_CLIENT_CONFIG, ...options }
  const iface = resolveInterface(config.interface, env)
  const mac = String(config.mac ?? '').trim() ? normalizeMac(config.mac) : iface.mac
  if (!mac)
    throw new Error(
      t(String(config.mac ?? '').trim() ? 'dhcp.errors.invalidMac' : 'dhcp.errors.noMac', { value: config.mac })
    )
  const requestedIp = String(config.requestedIp ?? '').trim()
  if (requestedIp && !isIPv4(requestedIp)) throw new Error(t('dhcp.errors.invalidIp', { value: requestedIp }))
  if (requestedIp && !isPrivateIPv4(requestedIp))
    throw new Error(t('dhcp.errors.requestedNotPrivate', { value: requestedIp, networks: networksText() }))
  const timeout = Number(config.timeout)
  if (!(timeout >= 200 && timeout <= 60_000)) throw new Error(t('dhcp.errors.invalidTimeout'))
  const hostname = String(config.hostname ?? '').trim()
  return {
    ...config,
    interface: iface.name,
    address: iface.address,
    subnet: iface.subnet,
    mac,
    hostname,
    requestedIp,
    timeout,
    port: checkPort(config.port),
    clientPort: checkPort(config.clientPort)
  }
}
