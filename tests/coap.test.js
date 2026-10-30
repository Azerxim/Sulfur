import { afterEach, describe, expect, it } from 'vitest'
import {
  CODES,
  OPTIONS,
  TYPES,
  codeName,
  decode,
  encode,
  formatLinks,
  messagePath,
  messageQuery,
  option,
  optionValue,
  parseCode,
  parseLinks,
  uriOptions
} from '@modules/coap/shared/codec'
import {
  decodeContent,
  decodeTlv,
  encodeSenml,
  encodeTlv,
  encodeTlvValue,
  parsePath,
  pathLabel
} from '@modules/coap/shared/lwm2m'
import { DEFAULT_SERVER_CONFIG } from '@modules/coap/shared/constants'
import { CoapServer } from '@modules/coap/main/server'
import { CoapClient } from '@modules/coap/main/client'
import { Lwm2mServer } from '@modules/coap/main/lwm2m-server'
import { Lwm2mDevice } from '@modules/coap/main/lwm2m-client'
import { createPointsApi } from '@modules/coap/main/points'
import { errorOf, freePort, sleep } from './helpers'

/** Attend qu'une condition soit vraie (au plus `timeout` ms). */
async function until(predicate, timeout = 3000) {
  const end = Date.now() + timeout
  while (!predicate() && Date.now() < end) await sleep(10)
  return predicate()
}

describe('Codec CoAP', () => {
  it('encode et décode un message avec ses options et son contenu', () => {
    const msg = {
      type: TYPES.CON,
      code: CODES.PUT,
      mid: 0xbeef,
      token: Buffer.from('a1b2c3d4', 'hex'),
      options: [
        ...uriOptions('/3/0/5850', 'ep=dev&lt=60'),
        option(OPTIONS.CONTENT_FORMAT, 0),
        option(OPTIONS.SIZE1, 300),
        // Valeur de plus de 268 octets : longueur sur deux octets supplémentaires.
        option(OPTIONS.PROXY_URI, 'x'.repeat(300))
      ],
      payload: Buffer.from('1')
    }
    const decoded = decode(encode(msg))
    expect(decoded).toMatchObject({ type: TYPES.CON, code: CODES.PUT, mid: 0xbeef })
    expect(decoded.token.toString('hex')).toBe('a1b2c3d4')
    // Segments numériques gardés en texte (et non en entiers).
    expect(messagePath(decoded)).toBe('/3/0/5850')
    expect(messageQuery(decoded)).toEqual({ ep: 'dev', lt: '60' })
    expect(optionValue(decoded, OPTIONS.CONTENT_FORMAT)).toBe(0)
    expect(optionValue(decoded, OPTIONS.SIZE1)).toBe(300)
    expect(optionValue(decoded, OPTIONS.PROXY_URI)).toHaveLength(300)
    expect(decoded.payload.toString()).toBe('1')
  })

  it('refuse les messages mal formés', async () => {
    expect(await errorOf(() => decode(Buffer.from([0x40, 0x01])))).toBe('CoAP message too short')
    expect(await errorOf(() => decode(Buffer.from([0x80, 0x01, 0, 1])))).toBe('Unsupported CoAP version 2')
    expect(await errorOf(() => decode(Buffer.from([0x40, 0x45, 0, 1, 0xff])))).toBe(
      'CoAP payload marker without payload'
    )
  })

  it('nomme et lit les codes', () => {
    expect(codeName(CODES.CONTENT)).toBe('2.05')
    expect(codeName(CODES.UNSUPPORTED_FORMAT)).toBe('4.15')
    expect(parseCode('5.03')).toBe(CODES.SERVICE_UNAVAILABLE)
    expect(parseCode('9.99')).toBe(null)
  })

  it('lit et écrit les liens CoRE', () => {
    const text = '</>;rt="oma.lwm2m";ct=11542,</3/0>,</sensors/temp>;title="Temp, °C";obs'
    const links = parseLinks(text)
    expect(links).toEqual([
      { href: '/', attrs: { rt: 'oma.lwm2m', ct: '11542' } },
      { href: '/3/0', attrs: {} },
      { href: '/sensors/temp', attrs: { title: 'Temp, °C', obs: true } }
    ])
    expect(formatLinks([{ href: '/a', attrs: { ct: 0, obs: true, title: 'A' } }])).toBe('</a>;ct=0;obs;title="A"')
  })
})

describe('Formats LwM2M', () => {
  it('encode et décode le TLV (identifiants et longueurs étendus)', () => {
    const nodes = [
      {
        type: 'instance',
        id: 0,
        children: [
          { type: 'resource', id: 5700, value: encodeTlvValue('float', 21.5) },
          { type: 'resource', id: 5701, value: encodeTlvValue('string', 'Cel') },
          { type: 'resource', id: 9, value: encodeTlvValue('string', 'z'.repeat(300)) }
        ]
      }
    ]
    const decoded = decodeTlv(encodeTlv(nodes))
    expect(decoded[0].children.map((n) => n.id)).toEqual([5700, 5701, 9])
    expect(decodeContent(11542, encodeTlv(nodes), '/3303')).toEqual([
      { path: '/3303/0/5700', value: 21.5 },
      { path: '/3303/0/5701', value: 'Cel' },
      { path: '/3303/0/9', value: 'z'.repeat(300) }
    ])
    // Ressource seule, et instance lue sans enveloppe d'instance.
    const single = encodeTlv([{ type: 'resource', id: 9, value: encodeTlvValue('integer', 87) }])
    expect(decodeContent(11542, single, '/3/0/9')).toEqual([{ path: '/3/0/9', value: 87 }])
    expect(decodeContent(11542, encodeTlv(nodes[0].children), '/3303/0')[1]).toEqual({
      path: '/3303/0/5701',
      value: 'Cel'
    })
  })

  it('encode et décode le SenML JSON', () => {
    const json = encodeSenml([
      { path: '/3311/0/5850', value: true, type: 'boolean' },
      { path: '/3311/0/5851', value: 40, type: 'integer' },
      { path: '/3311/0/5706', value: 'red', type: 'string' }
    ])
    expect(JSON.parse(json)).toEqual([
      { bn: '/3311/0/', n: '5850', vb: true },
      { n: '5851', v: 40 },
      { n: '5706', vs: 'red' }
    ])
    expect(decodeContent(110, Buffer.from(json), '/3311/0').map((v) => v.value)).toEqual([true, 40, 'red'])
  })

  it('analyse et nomme les chemins', () => {
    expect(parsePath('/3303/0/5700')).toMatchObject({ object: 3303, instance: 0, resource: 5700, depth: 3 })
    expect(parsePath('/3/x')).toBe(null)
    expect(pathLabel('/3303/0/5700')).toBe('Temperature / 0 / Sensor Value')
    expect(pathLabel('/9999/1')).toBe('Object 9999 / 1')
  })
})

describe('Serveur et client CoAP', () => {
  let server, client, port

  afterEach(async () => {
    await client?.dispose()
    await server?.stop()
    server = client = null
  })

  async function start(resources = DEFAULT_SERVER_CONFIG.resources) {
    port = await freePort()
    server = new CoapServer()
    await server.start({ host: '127.0.0.1', port, resources })
    client = new CoapClient()
  }

  const req = (patch) => ({
    host: '127.0.0.1',
    port,
    method: 'GET',
    path: '/sensors/temperature',
    timeout: 2,
    ...patch
  })

  it('sert, modifie et refuse les ressources', async () => {
    await start()
    const read = await client.request(req())
    expect(read).toMatchObject({ code: CODES.CONTENT, codeName: '2.05 Content', format: 'text/plain' })
    expect(Number(read.payload)).toBeGreaterThanOrEqual(15)

    const json = await client.request(req({ path: '/sensors/humidity', confirmable: false }))
    expect(JSON.parse(json.payload)).toHaveProperty('value')

    expect((await client.request(req({ path: '/nothing' }))).codeName).toBe('4.04 Not Found')
    expect((await client.request(req({ method: 'PUT', payload: '3' }))).codeName).toBe('4.05 Method Not Allowed')
    expect((await client.request(req({ path: 'actuators/relay', method: 'PUT', payload: 'true' }))).code).toBe(
      CODES.CHANGED
    )
    expect(server.currentValues().relay).toBe(true)
    expect((await client.request(req({ path: 'actuators/relay', method: 'PUT', payload: 'maybe' }))).codeName).toBe(
      '4.00 Bad Request'
    )
    expect((await client.request(req({ accept: 50 }))).codeName).toBe('4.06 Not Acceptable')
    expect(server.log.filter((e) => e.method).map((e) => e.path)).toContain('/actuators/relay')
  })

  it('annonce ses ressources par /.well-known/core', async () => {
    await start()
    const { links } = await client.discover(req())
    expect(links.map((l) => l.href)).toEqual(['/sensors/temperature', '/sensors/humidity', '/actuators/relay'])
    expect(links[0].attrs).toMatchObject({ title: 'Temperature', ct: '0', obs: true })
  })

  it('notifie les observateurs, puis les oublie quand ils refusent les notifications', async () => {
    await start()
    const first = await client.observe(req({ path: '/actuators/relay' }))
    expect(first.observe).toBe(1)
    expect(server.status().sessions).toBe(1)
    const [observation] = client.status().observations
    server.setValue('relay', true)
    expect(await until(() => client.observations.get(observation.token)?.count === 1)).toBe(true)
    expect(client.history.at(-1)).toMatchObject({ notification: true, payload: 'true' })

    client.cancel(observation.token)
    server.setValue('relay', false)
    // Notification refusée par un RST : l'observateur est retiré du serveur.
    expect(await until(() => server.status().sessions === 0)).toBe(true)
  })

  it('subit les défauts du simulateur', async () => {
    await start()
    server.setFaults([{ id: 'f', type: 'exception', params: { code: CODES.SERVICE_UNAVAILABLE } }])
    expect((await client.request(req())).codeName).toBe('5.03 Service Unavailable')
    server.setFaults([{ id: 'f', type: 'noResponse', params: {} }])
    expect(await errorOf(() => client.request(req({ timeout: 1 })))).toMatch(
      /^No response from coap:\/\/127\.0\.0\.1:\d+\/sensors\/temperature within 1 s$/
    )
    server.setFaults([{ id: 'f', type: 'delay', params: { ms: 150 } }])
    expect((await client.request(req())).rtt).toBeGreaterThanOrEqual(145)
  })

  it('vérifie les ressources et publie leurs valeurs comme points', async () => {
    port = await freePort()
    server = new CoapServer()
    const bad = { ...DEFAULT_SERVER_CONFIG.resources[0], path: '.well-known/x' }
    expect(await errorOf(() => server.start({ port, resources: [bad] }))).toBe(
      'The /.well-known path is reserved for discovery'
    )
    await start()
    const api = createPointsApi({ server, lwm2mServer: { running: false }, device: { running: false } })
    expect(api.points().map((p) => p.id)).toContain('server:relay')
    await api.write('server:relay', 'on')
    expect(api.read(['server:relay'])).toEqual({ 'server:relay': true })
  })
})

describe('LwM2M : serveur et appareil simulé', () => {
  let server, device, port

  afterEach(async () => {
    await device?.stop()
    await server?.stop()
    server = device = null
  })

  async function register(objects = { temperature: true, light: true }) {
    port = await freePort()
    server = new Lwm2mServer()
    await server.start({ host: '127.0.0.1', port })
    device = new Lwm2mDevice()
    await device.start({ endpoint: 'test-device', serverHost: '127.0.0.1', serverPort: port, lifetime: 60, objects })
    expect(device.status().state).toBe('registered')
    return [...server.registrations.values()][0]
  }

  it('enregistre l’appareil avec ses objets, puis le désenregistre', async () => {
    const reg = await register()
    expect(reg).toMatchObject({ endpoint: 'test-device', lifetime: 60, binding: 'U', version: '1.1' })
    expect(reg.objects).toEqual(['/3/0', '/3303/0', '/3311/0'])
    expect(device.status().location).toBe(`/rd/${reg.id}`)
    await device.update()
    expect(server.log.some((e) => e.text === 'test-device: registration updated')).toBe(true)
    await device.stop()
    expect(server.registrations.size).toBe(0)
  })

  it('lit les objets en texte, TLV et SenML JSON', async () => {
    const { id } = await register()
    const text = await server.read(id, '/3303/0/5701', 0)
    expect(text).toMatchObject({ ok: true, format: 'text/plain', values: [{ path: '/3303/0/5701', value: 'Cel' }] })
    const tlv = await server.read(id, '/3/0', 11542)
    expect(tlv.format).toBe('application/vnd.oma.lwm2m+tlv')
    expect(tlv.values.find((v) => v.path === '/3/0/0')).toMatchObject({
      label: 'Device / 0 / Manufacturer',
      value: 'Sulfur'
    })
    const senml = await server.read(id, '/3311/0', 110)
    expect(senml.values.map((v) => v.path)).toEqual(['/3311/0/5850', '/3311/0/5851', '/3311/0/5706', '/3311/0/5852'])
    expect((await server.read(id, '/3311/0/5850', 11542)).values).toEqual([
      { path: '/3311/0/5850', label: 'Light Control / 0 / On/Off', value: 'false' }
    ])
    expect((await server.read(id, '/9/0', 11542)).code).toBe('4.04 Not Found')
  })

  it('écrit, exécute et découvre', async () => {
    const { id } = await register()
    expect((await server.write(id, '/3311/0/5850', '1')).code).toBe('2.04 Changed')
    expect(device.values.get('/3311/0/5850')).toBe(true)
    expect((await server.write(id, '/3/0/0', 'Other')).code).toBe('4.05 Method Not Allowed')
    expect(await errorOf(() => server.write(id, '/3311/0/5851', 'bright'))).toBe(
      'Invalid value for this resource: bright'
    )
    expect((await server.execute(id, '/3303/0/5605')).code).toBe('2.04 Changed')
    expect((await server.execute(id, '/3303/0/5700')).code).toBe('4.05 Method Not Allowed')
    const discover = await server.discover(id, '/3311/0')
    expect(discover.links.map((l) => l.href)).toContain('/3311/0/5851')
  })

  it('observe une ressource et reçoit ses changements', async () => {
    const { id } = await register()
    const first = await server.observe(id, '/3311/0/5851', 0)
    expect(first.values[0].value).toBe('100')
    const [observation] = server.status().observations
    await sleep(1000)
    device.setValue('/3311/0/5851', 42)
    expect(await until(() => server.observations.get(observation.token)?.count >= 1)).toBe(true)
    expect(server.observations.get(observation.token).values[0].value).toBe('42')
    server.cancelObservation(observation.token)
    expect(server.status().observations).toHaveLength(0)
  })

  it('n’annonce que les objets activés et vérifie ses réglages', async () => {
    const reg = await register({ temperature: false, light: false })
    expect(reg.objects).toEqual(['/3/0'])
    expect((await server.read(reg.id, '/3303/0/5700', 0)).code).toBe('4.04 Not Found')
    const other = new Lwm2mDevice()
    expect(await errorOf(() => other.start({ endpoint: 'a b', serverHost: 'x', serverPort: 1 }))).toBe(
      'Invalid device name (no space, &, ? or /)'
    )
  })
})
