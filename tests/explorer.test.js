import os from 'os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { localNetworks, parseTargets } from '@modules/explorer/main/targets'
import { isIPv4, isPrivateIPv4, privateNetworkOf } from '@azerxim/sulfur-sdk'
import { errorOf } from './helpers'

const NETWORKS = '10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16'
const refused = (value) => `Target outside the private networks refused: ${value} (allowed networks: ${NETWORKS})`

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Réseaux privés', () => {
  it('reconnaît les trois réseaux privés et leurs bornes', () => {
    for (const ip of ['10.0.0.0', '10.255.255.255', '172.16.0.0', '172.31.255.255', '192.168.0.0', '192.168.255.255'])
      expect(isPrivateIPv4(ip), ip).toBe(true)
    for (const ip of ['9.255.255.255', '11.0.0.0', '172.15.255.255', '172.32.0.0', '192.167.255.255', '192.169.0.0'])
      expect(isPrivateIPv4(ip), ip).toBe(false)
    for (const ip of ['127.0.0.1', '0.0.0.0', '255.255.255.255', '169.254.1.1', '100.64.0.1', '8.8.8.8'])
      expect(isPrivateIPv4(ip), ip).toBe(false)
    expect(privateNetworkOf('172.20.1.2').cidr).toBe('172.16.0.0/12')
  })

  it('refuse les adresses mal formées', () => {
    for (const text of ['192.168.1', '192.168.1.256', '192.168.01.1', '192.168.1.1.1', ' 10.0.0.1', '', 'abc'])
      expect(isIPv4(text), text).toBe(false)
    expect(isPrivateIPv4('010.0.0.1')).toBe(false)
  })
})

describe('Cibles', () => {
  it('accepte les adresses, réseaux et plages privés', async () => {
    expect(await parseTargets('192.168.1.10')).toEqual(['192.168.1.10'])
    const network = await parseTargets('192.168.1.0/24')
    expect(network).toHaveLength(254)
    expect([network[0], network.at(-1)]).toEqual(['192.168.1.1', '192.168.1.254'])
    expect(await parseTargets('10.0.0.10-12, 172.16.5.1-172.16.5.2')).toEqual([
      '10.0.0.10',
      '10.0.0.11',
      '10.0.0.12',
      '172.16.5.1',
      '172.16.5.2'
    ])
    expect(await parseTargets('172.31.255.254/31')).toEqual(['172.31.255.254', '172.31.255.255'])
    // Doublons retirés, ordre conservé.
    expect(await parseTargets('10.1.1.2 10.1.1.1, 10.1.1.2')).toEqual(['10.1.1.2', '10.1.1.1'])
  })

  it('refuse toute cible hors des réseaux privés, même en partie', async () => {
    expect(await errorOf(parseTargets('8.8.8.8'))).toBe(refused('8.8.8.8'))
    expect(await errorOf(parseTargets('192.168.1.1, 1.1.1.1'))).toBe(refused('1.1.1.1'))
    expect(await errorOf(parseTargets('127.0.0.1'))).toBe(refused('127.0.0.1'))
    expect(await errorOf(parseTargets('172.32.0.0/24'))).toBe(refused('172.32.0.0/24'))
    // Réseau qui déborde du réseau privé, plages qui en sortent.
    expect(await errorOf(parseTargets('192.168.0.0/15'))).toBe(refused('192.168.0.0/15'))
    expect(await errorOf(parseTargets('172.15.255.250-172.16.0.5'))).toBe(refused('172.15.255.250-172.16.0.5'))
    expect(await errorOf(parseTargets('10.255.255.250-11.0.0.3'))).toBe(refused('10.255.255.250-11.0.0.3'))
    // Grand réseau public : refusé comme public, pas comme trop grand.
    expect(await errorOf(parseTargets('8.0.0.0/8'))).toBe(refused('8.0.0.0/8'))
    expect(await errorOf(parseTargets('0.0.0.0/0'))).toBe(refused('0.0.0.0/0'))
  })

  it('refuse un nom d’hôte qui ne désigne pas une adresse privée', async () => {
    expect(await errorOf(parseTargets('localhost'))).toBe(refused('localhost (127.0.0.1)'))
  })

  it('limite le nombre d’adresses et signale les saisies invalides', async () => {
    expect(await errorOf(parseTargets('10.0.0.0/8'))).toBe('Too many addresses: 4096 at most')
    expect(await errorOf(parseTargets('10.0.0.0-10.0.16.0'))).toBe('Too many addresses: 4096 at most')
    expect(await parseTargets('10.0.0.0/20')).toHaveLength(4094)
    expect(await errorOf(parseTargets(''))).toBe('Enter at least one address, network or host name')
    expect(await errorOf(parseTargets('192.168.1.300'))).toBe('Invalid target: 192.168.1.300')
    expect(await errorOf(parseTargets('192.168.1.20-10'))).toBe('Invalid target: 192.168.1.20-10')
    expect(await errorOf(parseTargets('fd00::1'))).toBe('IPv6 addresses are not supported: fd00::1')
  })
})

describe('Réseaux locaux proposés', () => {
  it('ne propose que les réseaux privés, limités au /24', () => {
    vi.spyOn(os, 'networkInterfaces').mockReturnValue({
      lo: [{ family: 'IPv4', address: '127.0.0.1', netmask: '255.0.0.0', internal: true }],
      eth0: [{ family: 'IPv4', address: '192.168.10.42', netmask: '255.255.255.0', internal: false }],
      eth1: [{ family: 'IPv4', address: '10.20.30.40', netmask: '255.0.0.0', internal: false }],
      wan: [{ family: 'IPv4', address: '203.0.113.7', netmask: '255.255.255.0', internal: false }],
      tun0: [{ family: 'IPv4', address: '100.64.1.2', netmask: '255.192.0.0', internal: false }],
      eth2: [{ family: 'IPv6', address: 'fd00::1', netmask: 'ffff:ffff:ffff:ffff::', internal: false }]
    })
    expect(localNetworks()).toEqual([
      { interface: 'eth0', address: '192.168.10.42', cidr: '192.168.10.0/24' },
      { interface: 'eth1', address: '10.20.30.40', cidr: '10.20.30.0/24' }
    ])
  })
})
