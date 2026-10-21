import dgram from 'dgram'
import fs from 'fs/promises'
import path from 'path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { isPrivateSubnet, prefixLength, subnetOf } from '@azerxim/sulfur-sdk'
import { DhcpServer } from '@modules/dhcp/main/server'
import { DhcpClient } from '@modules/dhcp/main/client'
import { LeaseTable } from '@modules/dhcp/main/leases'
import { parseMacList, prepareClientConfig, prepareServerConfig } from '@modules/dhcp/main/config'
import { BROADCAST_FLAG, OP, OPTION, TYPE, decode, encode, normalizeMac } from '@modules/dhcp/main/protocol'
import { DEFAULT_SERVER_CONFIG, OFFER_HOLD } from '@modules/dhcp/shared/constants'
import { errorOf, sleep, tempDir } from './helpers'

const MAC_A = '02:00:00:00:00:0a'
const MAC_B = '02:00:00:00:00:0b'

/** Interfaces fictives : un réseau privé, un réseau public, un réseau qui déborde de 10.0.0.0/8. */
const INTERFACES = [
  { name: 'eth0', address: '192.168.50.1', netmask: '255.255.255.0', mac: '02:aa:bb:cc:dd:01' },
  { name: 'lab', address: '10.20.0.1', netmask: '255.255.0.0', mac: '02:aa:bb:cc:dd:02' },
  { name: 'wan', address: '203.0.113.7', netmask: '255.255.255.0', mac: '02:aa:bb:cc:dd:03' },
  { name: 'wide', address: '10.0.0.1', netmask: '254.0.0.0', mac: '02:aa:bb:cc:dd:04' },
  { name: 'nomac', address: '172.16.1.1', netmask: '255.255.255.0', mac: null }
]
const env = { interfaces: () => INTERFACES }
const serverConfig = (extra = {}) =>
  prepareServerConfig(
    { ...DEFAULT_SERVER_CONFIG, interface: 'eth0', poolStart: '192.168.50.100', poolEnd: '192.168.50.199', ...extra },
    env
  )

/** Port UDP libre. */
async function freeUdpPort() {
  const socket = dgram.createSocket('udp4')
  await new Promise((resolve) => socket.bind(0, '127.0.0.1', resolve))
  const { port } = socket.address()
  await new Promise((resolve) => socket.close(resolve))
  return port
}

/** Requête d'un client, décodée comme si elle venait du réseau. */
const request = (type, { mac = MAC_A, options = [], ...fields } = {}) =>
  decode(encode({ op: OP.REQUEST, type, xid: 0x1234, flags: BROADCAST_FLAG, chaddr: mac, options, ...fields }))

describe('Réseaux et sous-réseaux', () => {
  it('calcule le préfixe et le sous-réseau', () => {
    expect(prefixLength('255.255.255.0')).toBe(24)
    expect(prefixLength('255.255.255.255')).toBe(32)
    expect(prefixLength('0.0.0.0')).toBe(0)
    expect(prefixLength('255.0.255.0')).toBeNull()
    expect(subnetOf('192.168.50.77', '255.255.255.192')).toMatchObject({ prefix: 26, cidr: '192.168.50.64/26' })
  })

  it('n’accepte que les sous-réseaux entièrement privés', () => {
    expect(isPrivateSubnet(subnetOf('192.168.50.1', '255.255.255.0'))).toBe(true)
    expect(isPrivateSubnet(subnetOf('172.31.0.1', '255.255.0.0'))).toBe(true)
    expect(isPrivateSubnet(subnetOf('172.16.0.1', '255.240.0.0'))).toBe(true)
    expect(isPrivateSubnet(subnetOf('172.16.0.1', '255.224.0.0'))).toBe(false)
    expect(isPrivateSubnet(subnetOf('10.0.0.1', '254.0.0.0'))).toBe(false)
    expect(isPrivateSubnet(subnetOf('192.168.1.1', '255.254.0.0'))).toBe(false)
    expect(isPrivateSubnet(subnetOf('203.0.113.7', '255.255.255.0'))).toBe(false)
    expect(isPrivateSubnet(subnetOf('127.0.0.1', '255.0.0.0'))).toBe(false)
  })
})

describe('Protocole DHCP', () => {
  it('normalise les adresses MAC', () => {
    expect(normalizeMac('02:AA:bb:cc:dd:EE')).toBe('02:aa:bb:cc:dd:ee')
    expect(normalizeMac('02-aa-bb-cc-dd-ee')).toBe('02:aa:bb:cc:dd:ee')
    expect(normalizeMac('02aabbccddee')).toBe('02:aa:bb:cc:dd:ee')
    for (const bad of ['02:aa:bb:cc:dd', '02:aa-bb:cc:dd:ee', 'zz:aa:bb:cc:dd:ee', ''])
      expect(normalizeMac(bad)).toBeNull()
    expect(parseMacList('02-AA-BB-CC-DD-EE, 02:aa:bb:cc:dd:ee\n02:00:00:00:00:01')).toEqual([
      '02:aa:bb:cc:dd:ee',
      '02:00:00:00:00:01'
    ])
    expect(() => parseMacList('02:aa, x')).toThrow('Invalid MAC address: 02:aa')
  })

  it('encode et décode un paquet avec ses options', () => {
    const packet = encode({
      op: OP.REPLY,
      type: TYPE.OFFER,
      xid: 0xdeadbeef,
      flags: BROADCAST_FLAG,
      yiaddr: '192.168.50.100',
      chaddr: MAC_A,
      options: [
        [OPTION.SERVER_ID, '192.168.50.1'],
        [OPTION.LEASE_TIME, 3600],
        [OPTION.SUBNET_MASK, '255.255.255.0'],
        [OPTION.ROUTER, '192.168.50.254'],
        [OPTION.DNS, ['192.168.50.1', '10.0.0.53']],
        [OPTION.DOMAIN, 'lab.local'],
        [OPTION.HOSTNAME, 'x'.repeat(300)]
      ]
    })
    expect(packet.length).toBeGreaterThanOrEqual(300)
    expect(decode(packet)).toMatchObject({
      op: OP.REPLY,
      type: TYPE.OFFER,
      xid: 0xdeadbeef,
      flags: BROADCAST_FLAG,
      yiaddr: '192.168.50.100',
      chaddr: MAC_A,
      serverId: '192.168.50.1',
      leaseTime: 3600,
      subnetMask: '255.255.255.0',
      routers: ['192.168.50.254'],
      dns: ['192.168.50.1', '10.0.0.53'],
      domain: 'lab.local',
      // Option de plus de 255 octets découpée puis réassemblée (RFC 3396).
      hostname: 'x'.repeat(300)
    })
  })

  it('rejette ce qui n’est pas un paquet DHCP', () => {
    expect(() => decode(Buffer.alloc(100))).toThrow('packet too short')
    expect(() => decode(Buffer.alloc(300))).toThrow('not a DHCP packet')
  })
})

describe('Configuration du serveur', () => {
  it('exige une interface choisie explicitement, dans un réseau privé', () => {
    expect(() => serverConfig({ interface: '' })).toThrow('Choose an interface')
    expect(() => serverConfig({ interface: 'eth9' })).toThrow('Interface eth9 not found')
    expect(() => serverConfig({ interface: 'wan', poolStart: '203.0.113.10', poolEnd: '203.0.113.20' })).toThrow(
      'Interface wan (203.0.113.0/24) is not in a private network (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)'
    )
    expect(() => serverConfig({ interface: 'wide', poolStart: '10.0.0.10', poolEnd: '10.0.0.20' })).toThrow(
      /Interface wide \(10\.0\.0\.0\/7\) is not in a private network/
    )
    expect(serverConfig()).toMatchObject({ interface: 'eth0', address: '192.168.50.1', port: 67, clientPort: 68 })
  })

  it('valide la plage par rapport au sous-réseau de l’interface', () => {
    expect(() => serverConfig({ poolStart: '192.168.51.10' })).toThrow(
      '192.168.51.10 is not a host address of the network 192.168.50.0/24'
    )
    expect(() => serverConfig({ poolStart: '192.168.50.0' })).toThrow(/not a host address/)
    expect(() => serverConfig({ poolEnd: '192.168.50.255' })).toThrow(/not a host address/)
    expect(() => serverConfig({ poolStart: '192.168.50.150', poolEnd: '192.168.50.120' })).toThrow(
      'The last address of the pool comes before the first'
    )
    expect(() => serverConfig({ poolStart: '192.168.50.1' })).toThrow(
      'The pool includes the address of the server (192.168.50.1)'
    )
    expect(() => serverConfig({ poolStart: '' })).toThrow('Invalid IPv4 address: —')
    expect(() => serverConfig({ interface: 'lab', poolStart: '10.20.0.10', poolEnd: '10.20.1.20' })).toThrow(
      'Pool too large: 256 addresses at most'
    )
    expect(serverConfig({ interface: 'lab', poolStart: '10.20.1.0', poolEnd: '10.20.1.255' }).poolEnd).toBe(
      '10.20.1.255'
    )
  })

  it('valide la passerelle, les DNS privés, le domaine, le bail et la liste MAC', () => {
    expect(() => serverConfig({ router: '192.168.60.1' })).toThrow(/gateway 192\.168\.60\.1 is not a host address/)
    expect(() => serverConfig({ router: '192.168.50.150' })).toThrow('The gateway is inside the pool')
    expect(serverConfig({ router: '192.168.50.254' }).router).toBe('192.168.50.254')
    expect(() => serverConfig({ dns: '192.168.50.1, 8.8.8.8' })).toThrow(
      'DNS server outside the private networks refused: 8.8.8.8 (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)'
    )
    expect(serverConfig({ dns: '192.168.50.1 10.0.0.53' }).dns).toEqual(['192.168.50.1', '10.0.0.53'])
    expect(() => serverConfig({ domain: 'bad domain' })).toThrow('Invalid domain name: bad domain')
    expect(() => serverConfig({ leaseTime: 10 })).toThrow('Invalid lease time (60 to 604800 seconds)')
    expect(() => serverConfig({ macFilter: true, macs: '' })).toThrow('The list of allowed MAC addresses is empty')
    expect(serverConfig({ macFilter: true, macs: MAC_A.toUpperCase() }).macs).toEqual([MAC_A])
  })

  it('valide la configuration du client', () => {
    expect(prepareClientConfig({ interface: 'eth0' }, env).mac).toBe('02:aa:bb:cc:dd:01')
    expect(prepareClientConfig({ interface: 'eth0', mac: '02-00-00-00-00-0A' }, env).mac).toBe(MAC_A)
    expect(() => prepareClientConfig({ interface: 'wan' }, env)).toThrow(/is not in a private network/)
    expect(() => prepareClientConfig({ interface: 'nomac' }, env)).toThrow('The interface has no MAC address')
    expect(() => prepareClientConfig({ interface: 'eth0', requestedIp: '1.2.3.4' }, env)).toThrow(
      /Requested address outside the private networks refused: 1\.2\.3\.4/
    )
  })
})

describe('Baux', () => {
  const now = 1_000_000

  it('offre, attribue, libère et met de côté les adresses', () => {
    const table = new LeaseTable({ start: '10.0.0.10', end: '10.0.0.12', leaseTime: 3600 })
    expect(table.offer(MAC_A, {}, now)).toBe('10.0.0.10')
    // Même client : même offre ; adresse demandée libre : accordée.
    expect(table.offer(MAC_A, {}, now)).toBe('10.0.0.10')
    expect(table.offer(MAC_B, { requested: '10.0.0.12' }, now)).toBe('10.0.0.12')
    expect(table.bind(MAC_B, '10.0.0.10', {}, now)).toBe(false)
    expect(table.bind(MAC_A, '10.0.0.10', {}, now)).toBe(true)
    expect(table.bind(MAC_A, '10.0.0.99', {}, now)).toBe(false)
    expect(table.offer('02:00:00:00:00:0c', {}, now)).toBe('10.0.0.11')
    expect(table.offer('02:00:00:00:00:0d', {}, now)).toBeNull()
    // Offre non confirmée : libérée après OFFER_HOLD.
    expect(table.offer('02:00:00:00:00:0d', {}, now + OFFER_HOLD + 1)).toBe('10.0.0.11')
    expect(table.release(MAC_B, '10.0.0.10', now)).toBe(false)
    expect(table.release(MAC_A, '10.0.0.10', now)).toBe(true)
    expect(table.decline(MAC_B, '10.0.0.10', now)).toBe(true)
    expect(table.isFree('10.0.0.10', now)).toBe(false)
    expect(table.list(now).map((l) => [l.ip, l.state])).toEqual([
      ['10.0.0.10', 'declined'],
      ['10.0.0.11', 'offered'],
      ['10.0.0.12', 'offered']
    ])
  })
})

describe('Serveur et client DHCP', () => {
  /** Interface de bouclage, autorisée ici seulement : l'interface utilisateur ne peut pas lever la restriction. */
  const loopback = {
    interfaces: () => [{ name: 'lo', address: '127.0.0.1', netmask: '255.0.0.0', mac: null }],
    allowSubnet: () => true
  }
  let tmp, server, port, clientPort, logFile
  const config = (extra = {}) => ({
    ...DEFAULT_SERVER_CONFIG,
    interface: 'lo',
    poolStart: '127.0.0.100',
    poolEnd: '127.0.0.102',
    router: '127.0.0.254',
    domain: 'lab.local',
    leaseTime: 600,
    port,
    clientPort,
    ...extra
  })
  const newClient = (extra = {}) =>
    new DhcpClient({ env: loopback, allowAddress: () => true, broadcastAddress: '127.0.0.1', ...extra })
  const clientConfig = (extra = {}) => ({ interface: 'lo', mac: MAC_A, timeout: 400, port, clientPort, ...extra })

  beforeAll(async () => {
    tmp = await tempDir('dhcp')
    logFile = path.join(tmp.dir, 'logs', 'server.log')
    server = new DhcpServer(logFile, { env: loopback, broadcastAddress: '127.0.0.1' })
  })

  beforeEach(async () => {
    port = await freeUdpPort()
    clientPort = await freeUdpPort()
  })

  afterEach(() => server.stop())
  afterAll(() => tmp.cleanup())

  it('ne démarre pas sans confirmation de l’avertissement, ni hors réseau privé', async () => {
    expect(await errorOf(server.start(config()))).toBe('Confirm the warning to start the server')
    expect(await errorOf(server.start(config(), 'yes'))).toBe('Confirm the warning to start the server')
    expect(server.running).toBe(false)
    const strict = new DhcpServer(logFile, { env: { interfaces: loopback.interfaces } })
    expect(await errorOf(strict.start(config(), true))).toMatch(
      /Interface lo \(127\.0\.0\.0\/8\) is not in a private network/
    )
    expect(strict.running).toBe(false)
  })

  it('attribue un bail (DISCOVER, OFFER, REQUEST, ACK) et le libère', async () => {
    await server.start(config(), true)
    const client = newClient()
    const offers = await client.run(clientConfig(), 'discover')
    expect(offers).toMatchObject({ ok: true, offers: [{ type: 'OFFER', ip: '127.0.0.100', server: '127.0.0.1' }] })

    const entry = await client.run(clientConfig({ hostname: 'plc1' }), 'lease')
    expect(entry.ok).toBe(true)
    expect(entry.lease).toMatchObject({
      type: 'ACK',
      ip: '127.0.0.100',
      server: '127.0.0.1',
      subnetMask: '255.0.0.0',
      routers: ['127.0.0.254'],
      domain: 'lab.local',
      leaseTime: 600
    })
    expect(server.status().leases).toMatchObject([{ ip: '127.0.0.100', mac: MAC_A, hostname: 'plc1', state: 'bound' }])

    expect((await client.release(clientConfig())).ok).toBe(true)
    await sleep(100)
    expect(server.status().leases).toEqual([])
    expect(server.status().counters).toMatchObject({ discovers: 2, offers: 2, acks: 1, releases: 1 })

    // Toutes les offres et attributions sont dans le fichier journal.
    await server.stop()
    const lines = (await fs.readFile(logFile, 'utf8')).trim().split('\n')
    expect(lines.filter((l) => l.includes('\tOFFER\t')).length).toBe(2)
    expect(
      lines.some((l) => l.includes('\tACK\t') && l.includes('ACK 127.0.0.100 assigned to 02:00:00:00:00:0a'))
    ).toBe(true)
    expect(lines.some((l) => l.includes('\tRELEASE\t'))).toBe(true)
  })

  it('ne répond qu’aux adresses MAC listées', async () => {
    await server.start(config({ macFilter: true, macs: MAC_B }), true)
    const ignored = await newClient().run(clientConfig({ mac: MAC_A }), 'discover')
    expect(ignored).toMatchObject({ ok: false, error: 'No offer received (timeout)' })
    expect(server.logs().at(-1).message).toBe(`DISCOVER from ${MAC_A} ignored: MAC address not listed`)
    expect((await newClient().run(clientConfig({ mac: MAC_B }), 'lease')).ok).toBe(true)
    expect(server.status().counters.ignored).toBe(1)
  })

  it('ignore côté client les offres hors des réseaux privés', async () => {
    await server.start(config(), true)
    const strict = newClient({ allowAddress: undefined })
    const entry = await strict.run(clientConfig(), 'lease')
    expect(entry).toMatchObject({
      ok: false,
      offers: [],
      error: 'Only offers outside the private networks were received: ignored'
    })
    expect(entry.ignored).toHaveLength(1)
  })

  it('traite les cas particuliers des requêtes', async () => {
    await server.start(config(), true)
    // Requête relayée : ignorée (seul le réseau local est servi).
    expect(server.handle(request(TYPE.DISCOVER, { giaddr: '127.0.0.9' }))).toBeNull()
    expect(server.logs().at(-1).message).toBe('DISCOVER relayed by 127.0.0.9 ignored: only the local network is served')

    // Offre retirée si le client choisit un autre serveur.
    const offer = decode(server.handle(request(TYPE.DISCOVER)).packet)
    expect(offer.yiaddr).toBe('127.0.0.100')
    const other = request(TYPE.REQUEST, {
      options: [
        [OPTION.REQUESTED_IP, offer.yiaddr],
        [OPTION.SERVER_ID, '127.0.0.50']
      ]
    })
    expect(server.handle(other)).toBeNull()
    expect(server.status().leases).toEqual([])

    // Adresse hors du réseau servi, ou tenue par un autre client : NAK diffusé.
    const foreign = server.handle(request(TYPE.REQUEST, { options: [[OPTION.REQUESTED_IP, '192.168.1.20']] }))
    expect(decode(foreign.packet).type).toBe(TYPE.NAK)
    expect(foreign.address).toBe('127.0.0.1')
    server.handle(request(TYPE.REQUEST, { mac: MAC_B, options: [[OPTION.REQUESTED_IP, '127.0.0.101']] }))
    const taken = server.handle(request(TYPE.REQUEST, { options: [[OPTION.REQUESTED_IP, '127.0.0.101']] }))
    expect(decode(taken.packet).type).toBe(TYPE.NAK)
    expect(server.logs().at(-1).message).toBe(`NAK to ${MAC_A} for 127.0.0.101: address held by another client`)

    // Renouvellement d'un client qui a une adresse : ACK envoyé directement à cette adresse.
    const renew = server.handle(request(TYPE.REQUEST, { mac: MAC_B, ciaddr: '127.0.0.101' }))
    expect(decode(renew.packet)).toMatchObject({ type: TYPE.ACK, yiaddr: '127.0.0.101', leaseTime: 600 })
    expect(renew.address).toBe('127.0.0.101')

    // Plage épuisée : pas d'offre.
    server.handle(request(TYPE.DISCOVER, { mac: '02:00:00:00:00:0c' }))
    server.handle(request(TYPE.DISCOVER, { mac: '02:00:00:00:00:0d' }))
    expect(server.handle(request(TYPE.DISCOVER, { mac: '02:00:00:00:00:0e' }))).toBeNull()
    expect(server.logs().at(-1).message).toBe('No free address for 02:00:00:00:00:0e: pool exhausted')
  })
})
