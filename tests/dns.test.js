import { Resolver } from 'dns/promises'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { DnsServer, buildZone, parseUpstreams } from '@modules/dns/main/server'
import { DnsClient } from '@modules/dns/main/client'
import { DEFAULT_SERVER_CONFIG } from '@modules/dns/shared/constants'
import { absoluteName, isIPv6, recordProblem, reverseName } from '@modules/dns/shared/records'
import { errorOf, freePort } from './helpers'

describe('Enregistrements et zone', () => {
  it('rattache les noms relatifs au domaine', () => {
    expect(absoluteName('plc1', 'sulfur.local')).toBe('plc1.sulfur.local')
    expect(absoluteName('@', 'sulfur.local.')).toBe('sulfur.local')
    expect(absoluteName('Other.Example.', 'sulfur.local')).toBe('other.example')
  })

  it('valide les valeurs selon le type', () => {
    expect(recordProblem({ name: 'a', type: 'A', value: '10.0.0.1' }, 'z')).toBeNull()
    expect(recordProblem({ name: 'a', type: 'A', value: '10.0.0.300' }, 'z').key).toBe('dns.errors.invalidIPv4')
    expect(recordProblem({ name: 'a', type: 'MX', value: 'mail' }, 'z').key).toBe('dns.errors.invalidMx')
    expect(recordProblem({ name: 'bad name', type: 'A', value: '10.0.0.1' }, 'z').key).toBe('dns.errors.invalidName')
    expect(isIPv6('fd00::10')).toBe(true)
    expect(isIPv6('::ffff:192.168.1.1')).toBe(true)
    expect(isIPv6('1::2::3')).toBe(false)
    expect(reverseName('192.168.1.10')).toBe('10.1.168.192.in-addr.arpa')
    expect(reverseName('::1')).toBe(`1.${'0.'.repeat(31)}ip6.arpa`)
  })

  it('construit la zone avec SOA et PTR automatiques', () => {
    const zone = buildZone(DEFAULT_SERVER_CONFIG)
    expect(zone.get('plc1.sulfur.local')).toEqual([
      { name: 'plc1.sulfur.local', type: 'A', ttl: 300, data: '192.168.1.10' }
    ])
    expect(zone.get('10.1.168.192.in-addr.arpa')[0].data).toBe('plc1.sulfur.local')
    expect(
      zone
        .get('sulfur.local')
        .map((r) => r.type)
        .sort()
    ).toEqual(['MX', 'SOA', 'TXT'])
    expect(parseUpstreams('1.1.1.1, [::1]:5353')).toEqual([
      { host: '1.1.1.1', port: 53 },
      { host: '::1', port: 5353 }
    ])
  })
})

describe('Serveur et client DNS', () => {
  let server, port
  const client = new DnsClient()
  const ask = (name, type = 'A', extra = {}) =>
    client.query({ server: '127.0.0.1', port, name, type, timeout: 1000, ...extra })

  beforeAll(async () => {
    port = await freePort()
    server = new DnsServer()
    await server.start({ ...DEFAULT_SERVER_CONFIG, port })
  })
  afterEach(() => server.setFaults([]))
  afterAll(() => server.stop())

  it('répond aux noms de la zone, avec CNAME suivi', async () => {
    const a = await ask('plc1.sulfur.local')
    expect(a).toMatchObject({ rcode: 'NOERROR', flags: { aa: true } })
    expect(a.answers).toEqual([{ name: 'plc1.sulfur.local', type: 'A', ttl: 300, value: '192.168.1.10' }])

    const cname = await ask('SCADA.sulfur.local')
    expect(cname.answers.map((r) => `${r.type} ${r.value}`)).toEqual(['CNAME hmi.sulfur.local', 'A 192.168.1.20'])

    const srv = await ask('_opcua-tcp._tcp.sulfur.local', 'SRV')
    expect(srv.answers[0].value).toBe('0 0 4840 plc1.sulfur.local')
    expect((await ask('192.168.1.10', 'PTR')).answers[0].value).toBe('plc1.sulfur.local')
  })

  it('distingue nom inconnu de la zone, absence de type et nom hors zone', async () => {
    const missing = await ask('nothing.sulfur.local')
    expect(missing.rcode).toBe('NXDOMAIN')
    expect(missing.authorities[0].type).toBe('SOA')
    const noData = await ask('plc1.sulfur.local', 'AAAA')
    expect(noData).toMatchObject({ rcode: 'NOERROR', answers: [] })
    expect((await ask('example.org')).rcode).toBe('REFUSED')
    expect(server.status().counters).toMatchObject({ nxdomain: 1, refused: 1 })
  })

  it('répond en TCP et est utilisable par le résolveur du système', async () => {
    expect((await ask('hmi.sulfur.local', 'A', { tcp: true })).transport).toBe('tcp')
    const resolver = new Resolver({ timeout: 1000, tries: 1 })
    resolver.setServers([`127.0.0.1:${port}`])
    expect(await resolver.resolve4('hmi.sulfur.local')).toEqual(['192.168.1.20'])
    expect(await resolver.resolveMx('sulfur.local')).toMatchObject([{ exchange: 'mail.sulfur.local', priority: 10 }])
  })

  it('applique les modifications de la zone serveur démarré', async () => {
    server.update({
      ...DEFAULT_SERVER_CONFIG,
      records: [...DEFAULT_SERVER_CONFIG.records, { id: 'x', name: '*.lab', type: 'A', value: '10.0.0.99', ttl: 60 }]
    })
    expect((await ask('anything.lab.sulfur.local')).answers[0]).toMatchObject({ value: '10.0.0.99', ttl: 60 })
    expect(() =>
      server.update({ ...DEFAULT_SERVER_CONFIG, records: [{ name: 'x', type: 'A', value: 'nope' }] })
    ).toThrow(/Invalid IPv4/)
  })

  it('relaie les noms hors zone vers un serveur amont', async () => {
    const upstreamPort = await freePort()
    const upstream = new DnsServer()
    await upstream.start({
      ...DEFAULT_SERVER_CONFIG,
      port: upstreamPort,
      tcp: false,
      domain: 'example.org',
      records: [{ name: 'www', type: 'A', value: '203.0.113.5' }]
    })
    try {
      server.update({ ...DEFAULT_SERVER_CONFIG, forward: { enabled: true, servers: `127.0.0.1:${upstreamPort}` } })
      const res = await ask('www.example.org')
      expect(res.answers[0].value).toBe('203.0.113.5')
      expect(server.list().at(-1)).toMatchObject({ forwarded: true, rcode: 'NOERROR' })
    } finally {
      await upstream.stop()
      server.update(DEFAULT_SERVER_CONFIG)
    }
  })

  it('injecte les défauts du simulateur', async () => {
    server.setFaults([{ type: 'exception', params: { code: 'SERVFAIL' } }])
    expect((await ask('plc1.sulfur.local')).rcode).toBe('SERVFAIL')
    server.setFaults([{ type: 'noResponse' }])
    expect(await errorOf(ask('plc1.sulfur.local', 'A', { timeout: 200 }))).toMatch(/200 ms/)
  })

  it('refuse un port déjà utilisé', async () => {
    const other = new DnsServer()
    expect(await errorOf(other.start({ ...DEFAULT_SERVER_CONFIG, port }))).toMatch(/already in use/)
  })
})
