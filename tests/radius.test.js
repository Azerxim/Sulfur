import dgram from 'dgram'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CODE,
  buildRequest,
  buildResponse,
  checkMessageAuthenticator,
  checkResponse,
  decodePacket,
  encodeAttribute,
  encodePacket,
  hidePassword,
  revealPassword
} from '@modules/ldap/main/radius/protocol'
import { RadiusServer, addressMatches } from '@modules/ldap/main/radius/server'
import { RadiusClient } from '@modules/ldap/main/radius/client'
import { buildDirectory } from '@modules/ldap/main/server'
import { createPointsApi } from '@modules/ldap/main/points'
import { DEFAULT_LDIF } from '@modules/ldap/shared/constants'
import {
  DEFAULT_RADIUS_CLIENT_CONFIG,
  DEFAULT_RADIUS_SERVER_CONFIG,
  formatAttribute,
  parseAttributes
} from '@modules/ldap/shared/radius'
import { errorOf, freePort, sleep } from './helpers'

/** Port UDP libre (le port TCP libre l'est presque toujours aussi en UDP : vérifié par le bind). */
async function freeUdpPort() {
  const socket = dgram.createSocket('udp4')
  await new Promise((resolve) => socket.bind(0, '127.0.0.1', resolve))
  const { port } = socket.address()
  await new Promise((resolve) => socket.close(resolve))
  return port
}

describe('Paquets RADIUS', () => {
  // Exemple de la RFC 2865 § 7.1 : secret « xyzzy5461 », mot de passe « arctangent ».
  const REQUEST = Buffer.from(
    '010000380f403f9473978057bd83d5cb98f4227a01066e656d6f02120dbe708d93d413ce3196e43f782a0aee0406c0a801100506000000' +
      '03',
    'hex'
  )

  it('relit l’exemple de la RFC 2865 et calcule la même réponse', () => {
    const request = decodePacket(REQUEST)
    expect(request.code).toBe(CODE.accessRequest)
    expect(request.attributes.map((a) => [a.type, a.value])).toEqual([
      [1, 'nemo'],
      [2, '********'],
      [4, '192.168.1.16'],
      [5, 3]
    ])
    expect(revealPassword(request.attributes[1].data, 'xyzzy5461', request.authenticator)).toBe('arctangent')
    expect(hidePassword('arctangent', 'xyzzy5461', request.authenticator).toString('hex')).toBe(
      '0dbe708d93d413ce3196e43f782a0aee'
    )
    const accept = buildResponse(
      CODE.accessAccept,
      request,
      [
        encodeAttribute({ type: 6, value: 1 }),
        encodeAttribute({ type: 15, value: Buffer.from([0, 0, 0, 0]) }),
        encodeAttribute({ type: 14, value: Buffer.from([192, 168, 1, 3]) })
      ],
      'xyzzy5461'
    )
    expect(accept.toString('hex')).toBe('0200002686fe220e7624ba2a1005f6bf9b55e0b20606000000010f06000000000e06c0a80103')
    expect(checkResponse(accept, request.authenticator, 'xyzzy5461')).toBe(true)
  })

  it('masque les mots de passe longs et signe avec Message-Authenticator', () => {
    const authenticator = Buffer.alloc(16, 7)
    const long = 'a'.repeat(40)
    const hidden = hidePassword(long, 'secret', authenticator)
    expect(hidden.length).toBe(48)
    expect(revealPassword(hidden, 'secret', authenticator)).toBe(long)
    const packet = buildRequest(CODE.accessRequest, 1, [encodeAttribute({ type: 1, value: 'x' })], 'secret', {
      authenticator,
      messageAuthenticator: true
    })
    expect(checkMessageAuthenticator(packet, 'secret')).toBe(true)
    expect(checkMessageAuthenticator(packet, 'other')).toBe(false)
    const tampered = Buffer.from(packet)
    tampered[22] ^= 1
    expect(checkMessageAuthenticator(tampered, 'secret')).toBe(false)
    expect(checkMessageAuthenticator(buildRequest(CODE.accessRequest, 1, [], 'secret'), 'secret')).toBeNull()
  })

  it('lit les attributs saisis et signale les erreurs', () => {
    const { attributes, errors } = parseAttributes(`# commentaire
Service-Type = Administrative-User
Session-Timeout: 3600
Framed-IP-Address = 10.0.0.5
Cisco-AVPair = "shell:priv-lvl=15"
Vendor-Specific = 311:1:abc
Class = 0x0102
Session-Timeout = soon
Unknown-Thing = 1
User-Password = x`)
    expect(attributes.map((a) => [a.type, a.value])).toEqual([
      [6, 6],
      [27, 3600],
      [8, '10.0.0.5'],
      [26, { vendor: 9, vendorType: 1, value: 'shell:priv-lvl=15' }],
      [26, { vendor: 311, vendorType: 1, value: 'abc' }],
      [25, '0x0102']
    ])
    expect(errors).toEqual([
      { line: 8, message: 'invalid value for Session-Timeout: soon' },
      { line: 9, message: 'unknown attribute Unknown-Thing' },
      { line: 10, message: 'User-Password cannot be entered' }
    ])
    expect(formatAttribute({ type: 6, value: 6 })).toBe('Administrative-User (6)')
    const vsa = decodePacket(encodePacket(2, 0, Buffer.alloc(16), [encodeAttribute(attributes[3])]))
    expect(vsa.attributes[0].value).toEqual({ vendor: 9, vendorType: 1, value: 'shell:priv-lvl=15' })
  })

  it('reconnaît les adresses des clients', () => {
    expect(addressMatches('192.168.1.20', '192.168.1.0/24')).toBe(true)
    expect(addressMatches('::ffff:192.168.1.20', '192.168.1.0/24')).toBe(true)
    expect(addressMatches('192.168.2.20', '192.168.1.0/24')).toBe(false)
    expect(addressMatches('10.1.2.3', '0.0.0.0/0')).toBe(true)
    expect(addressMatches('10.1.2.3', '10.1.2.3')).toBe(true)
  })
})

describe('Serveur et client RADIUS', () => {
  let server, client, authPort, acctPort, logs

  const serverConfig = (extra = {}) => ({
    ...DEFAULT_RADIUS_SERVER_CONFIG,
    host: '127.0.0.1',
    authPort,
    acctPort,
    ...extra
  })
  const clientConfig = (extra = {}) => ({
    ...DEFAULT_RADIUS_CLIENT_CONFIG,
    authPort,
    acctPort,
    timeout: 300,
    retries: 0,
    attributes: '',
    ...extra
  })

  beforeEach(async () => {
    authPort = await freeUdpPort()
    acctPort = await freeUdpPort()
    logs = []
    server = new RadiusServer(() => buildDirectory(DEFAULT_LDIF), { onLog: (e) => logs.push(e) })
    client = new RadiusClient()
  })

  afterEach(async () => {
    await server.stop()
  })

  it('accepte un compte local en PAP et en CHAP avec ses attributs', async () => {
    await server.start(serverConfig())
    const pap = await client.authenticate(clientConfig({ username: 'admin', password: 'admin' }))
    expect(pap.code).toBe('Access-Accept')
    expect(pap.attributes).toEqual(
      expect.arrayContaining([
        { name: 'Service-Type', value: 'Administrative-User (6)' },
        { name: 'Cisco-AVPair', value: 'shell:priv-lvl=15' }
      ])
    )
    expect(pap.attributes.some((a) => a.name === 'Message-Authenticator')).toBe(true)
    const chap = await client.authenticate(clientConfig({ username: 'operator', password: 'operator', method: 'chap' }))
    expect(chap.code).toBe('Access-Accept')
    const wrong = await client.authenticate(clientConfig({ username: 'admin', password: 'nope', method: 'chap' }))
    expect(wrong.code).toBe('Access-Reject')
    expect(server.counters).toMatchObject({ requests: 3, accepts: 2, rejects: 1 })
    expect(logs.at(-1).message).toBe('Access-Reject admin CHAP: wrong password')
  })

  it('authentifie les comptes de l’annuaire LDAP', async () => {
    await server.start(serverConfig({ users: [] }))
    const ok = await client.authenticate(clientConfig({ username: 'engineer', password: 'engineer' }))
    expect(ok.code).toBe('Access-Accept')
    expect(ok.attributes).toContainEqual({ name: 'Service-Type', value: 'Login-User (1)' })
    expect(logs.at(-1).message).toContain('uid=engineer,ou=people,dc=sulfur,dc=local')
    expect((await client.authenticate(clientConfig({ username: 'nobody', password: 'x' }))).code).toBe('Access-Reject')
    server.update(serverConfig({ users: [], directory: { enabled: false } }))
    expect((await client.authenticate(clientConfig({ username: 'engineer', password: 'engineer' }))).code).toBe(
      'Access-Reject'
    )
  })

  it('ignore les clients non déclarés et les mauvais secrets', async () => {
    await server.start(serverConfig({ clients: [{ name: 'lab', address: '10.0.0.0/8', secret: 's' }] }))
    expect(await errorOf(client.authenticate(clientConfig({ password: 'operator' })))).toBe(
      `No response from 127.0.0.1:${authPort} after 1 attempt(s)`
    )
    expect(logs.at(-1).message).toBe('Request from an undeclared client: ignored')

    server.update(serverConfig({ clients: [{ name: 'local', address: '127.0.0.1', secret: 'right' }] }))
    expect(await errorOf(client.authenticate(clientConfig({ secret: 'wrong', password: 'operator' })))).toContain(
      'No response'
    )
    expect(logs.at(-1).message).toContain('Invalid Message-Authenticator (local)')
    expect(server.counters.dropped).toBe(2)
  })

  it('exige Message-Authenticator si demandé', async () => {
    await server.start(serverConfig({ requireMessageAuthenticator: true }))
    const config = clientConfig({ password: 'operator', messageAuthenticator: false })
    expect(await errorOf(client.authenticate(config))).toContain('No response')
    expect((await client.authenticate({ ...config, messageAuthenticator: true })).code).toBe('Access-Accept')
  })

  it('répond à Status-Server et tient les sessions d’accounting', async () => {
    await server.start(serverConfig())
    expect((await client.statusServer(clientConfig())).code).toBe('Access-Accept')
    const start = await client.accounting(clientConfig({ sessionId: 'S1' }), 'start')
    expect(start.code).toBe('Accounting-Response')
    expect(server.status().sessions).toMatchObject([{ sessionId: 'S1', user: 'operator', client: 'any' }])
    await client.accounting(clientConfig({ sessionId: 'S1' }), 'interim')
    const stop = await client.accounting(clientConfig({ sessionId: 'S1' }), 'stop')
    expect(stop.sessionTime).toBeGreaterThanOrEqual(0)
    expect(server.status().sessions).toEqual([])
    expect(server.counters.accounting).toBe(3)
    expect(logs.at(-1).message).toMatch(/^Accounting Stop · operator · session S1 · \d+ s$/)
  })

  it('renvoie la même réponse à une requête répétée et applique les défauts', async () => {
    await server.start(serverConfig())
    const socket = dgram.createSocket('udp4')
    const replies = []
    socket.on('message', (msg) => replies.push(msg))
    const authenticator = Buffer.alloc(16, 3)
    const packet = buildRequest(
      CODE.accessRequest,
      9,
      [
        encodeAttribute({ type: 1, value: 'operator' }),
        encodeAttribute({ type: 2, value: hidePassword('operator', 'testing123', authenticator) })
      ],
      'testing123',
      { authenticator, messageAuthenticator: true }
    )
    socket.send(packet, authPort, '127.0.0.1')
    await sleep(50)
    socket.send(packet, authPort, '127.0.0.1')
    await sleep(50)
    socket.close()
    expect(replies).toHaveLength(2)
    expect(replies[1]).toEqual(replies[0])
    expect(server.counters.requests).toBe(1)

    server.setFaults([{ type: 'exception', params: { code: 51 } }])
    expect((await client.authenticate(clientConfig({ password: 'operator' }))).code).toBe('Access-Reject')
    server.setFaults([{ type: 'noResponse' }])
    expect(await errorOf(client.authenticate(clientConfig({ password: 'operator' })))).toContain('No response')
  })

  it('refuse une configuration invalide', async () => {
    expect(await errorOf(server.start(serverConfig({ clients: [] })))).toBe('Declare at least one client (NAS)')
    expect(await errorOf(server.start(serverConfig({ acctPort: authPort })))).toBe(
      'Authentication and accounting cannot share the same port'
    )
    expect(
      await errorOf(server.start(serverConfig({ users: [{ username: 'x', password: 'x', attributes: 'Foo = 1' }] })))
    ).toBe('Reply attributes of x: Line 1: unknown attribute Foo')
    const tcpPort = await freePort()
    expect(await errorOf(server.start(serverConfig({ authPort: tcpPort, acctPort: tcpPort + 70000 })))).toBe(
      'Invalid port (1 to 65535)'
    )
  })

  it('publie les compteurs comme points de données', async () => {
    const api = createPointsApi({ server: { running: false, counters: {}, sessions: new Map() }, radiusServer: server })
    expect(api.read(['radius:accepts'])).toEqual({ 'radius:accepts': undefined })
    await server.start(serverConfig())
    await client.authenticate(clientConfig({ password: 'operator' }))
    expect(api.read(['radius:requests', 'radius:accepts', 'radius:sessions', 'server:binds'])).toEqual({
      'radius:requests': 1,
      'radius:accepts': 1,
      'radius:sessions': 0,
      'server:binds': undefined
    })
  })
})
