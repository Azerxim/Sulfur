import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { HttpServer } from '@modules/http/main/server'
import { HttpClient } from '@modules/http/main/client'
import { ensureCertificate } from '@modules/http/main/certificate'
import { httpRequest } from '@modules/http/main/request'
import { createPointsApi } from '@modules/http/main/points'
import { DEFAULT_SERVER_CONFIG } from '@modules/http/shared/constants'
import { coerce, matchPath, renderTemplate } from '@modules/http/shared/template'
import { errorOf, freePort, sleep, tempDir } from './helpers'

let tmp, server, client, port, logs
const base = () => `http://127.0.0.1:${port}`
const json = async (path, options) => {
  const res = await httpRequest(`${base()}${path}`, options)
  return { ...res, data: res.body ? JSON.parse(res.body) : null }
}

/** Attend qu'une condition soit remplie. */
async function waitFor(check, timeout = 5000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const result = await check()
    if (result) return result
    await sleep(50)
  }
  throw new Error('délai dépassé')
}

async function start(extra = {}) {
  port = await freePort()
  return server.start({ ...DEFAULT_SERVER_CONFIG, port, ...extra })
}

beforeAll(async () => {
  tmp = await tempDir('http')
  logs = []
  server = new HttpServer(() => ensureCertificate(`${tmp.dir}/pki`, 'HTTP@Sulfur'), { onLog: (e) => logs.push(e) })
  client = new HttpClient()
})

afterEach(async () => {
  server.setFaults([])
  client.dispose()
  for (const w of client.status().watches) client.removeWatch(w.id)
  await server.stop()
  logs.length = 0
})

afterAll(() => tmp.cleanup())

describe('Gabarits et chemins', () => {
  it('reconnaît les paramètres de chemin et le joker final', () => {
    expect(matchPath('/api/devices/:id', '/api/devices/42')).toEqual({ id: '42' })
    expect(matchPath('/api/devices/:id', '/api/devices/42/x')).toBeNull()
    expect(matchPath('/files/*', '/files/a/b.txt')).toEqual({ '*': 'a/b.txt' })
    expect(matchPath('/a', '/b')).toBeNull()
  })

  it('remplit un gabarit avec variables, paramètres, requête et corps', () => {
    const out = renderTemplate('{{var.t}}|{{params.id}}|{{query.q}}|{{body.a.b}}|{{body}}|{{var.o}}|{{absent}}', {
      variables: { t: 21.5, o: { x: 1 } },
      params: { id: '7' },
      query: { q: 'z' },
      body: '{"a":{"b":3}}',
      json: { a: { b: 3 } }
    })
    expect(out).toBe('21.5|7|z|3|{"a":{"b":3}}|{"x":1}|')
  })

  it('convertit les valeurs reçues dans le type des variables', () => {
    expect(coerce('12.7', 'Integer')).toBe(13)
    expect(coerce('on', 'Boolean')).toBe(true)
    expect(coerce('{"a":1}', 'JSON')).toEqual({ a: 1 })
    expect(() => coerce('abc', 'Number')).toThrow()
  })
})

describe('Serveur HTTP', () => {
  it('expose les variables par l’API intégrée et respecte la lecture seule', async () => {
    await start()
    const list = await json('/api/variables')
    expect(list.status).toBe(200)
    expect(list.data.map((v) => v.name)).toEqual(['temperature', 'setpoint', 'running', 'status'])
    const temperature = list.data[0].value
    expect(temperature).toBeGreaterThanOrEqual(15)
    expect(temperature).toBeLessThanOrEqual(25)

    const put = await json('/api/variables/setpoint', { method: 'PUT', body: '{"value": 72.4}' })
    expect(put.data).toMatchObject({ name: 'setpoint', value: 72, dataType: 'Integer' })
    expect(server.values()['var-2']).toBe(72)
    expect((await json('/api/variables/temperature', { method: 'PUT', body: '5' })).status).toBe(403)
    expect((await json('/api/variables/inconnue')).status).toBe(404)
    expect((await json('/api/variables/setpoint', { method: 'PUT', body: '"abc"' })).status).toBe(400)
  })

  it('sert les routes personnalisées : paramètres, gabarit, affectation de variable, 404', async () => {
    await start()
    const device = await json('/api/devices/A12')
    expect(device.data).toMatchObject({ id: 'A12', running: true })
    expect(typeof device.data.temperature).toBe('number')
    const set = await json('/api/setpoint', { method: 'POST', body: '{"value": 33}' })
    expect(set.data).toEqual({ setpoint: 33 })
    expect((await json('/api/setpoint', { method: 'POST', body: '{}' })).status).toBe(400)
    expect((await json('/nulle-part')).status).toBe(404)
    const health = await httpRequest(`${base()}/health`)
    expect(health.headers['access-control-allow-origin']).toBe('*')
    expect(logs.at(-1)).toMatchObject({ direction: 'in', method: 'GET', path: '/health', status: 200 })
  })

  it('authentifie en Basic (mot de passe haché), Bearer et clé d’API', async () => {
    await start({ auth: { type: 'basic', users: [{ username: 'alice', password: 'secret' }] } })
    expect(server.status().config.auth.users[0]).toEqual({
      username: 'alice',
      passwordHash: expect.stringMatching(/^scrypt\$/)
    })
    expect((await json('/api/variables')).status).toBe(401)
    client.configure({ baseUrl: base(), auth: { type: 'basic', username: 'alice', password: 'secret' } })
    expect((await client.send({ path: '/api/variables' })).status).toBe(200)
    client.configure({ baseUrl: base(), auth: { type: 'basic', username: 'alice', password: 'faux' } })
    expect((await client.send({ path: '/api/variables' })).status).toBe(401)
    await server.stop()

    await start({ auth: { type: 'bearer', token: 'jeton' } })
    client.configure({ baseUrl: base(), auth: { type: 'bearer', token: 'jeton' } })
    expect((await client.send({ path: '/health' })).status).toBe(200)
    await server.stop()

    await start({ auth: { type: 'apiKey', headerName: 'X-Key', apiKey: 'k1' } })
    client.configure({ baseUrl: base(), auth: { type: 'apiKey', headerName: 'X-Key', apiKey: 'k1' } })
    expect((await client.send({ path: '/health' })).status).toBe(200)
    expect((await json('/health')).status).toBe(401)
    expect(await errorOf(start)).not.toBe('OK') // déjà démarré
  })

  it('sert en HTTPS avec un certificat auto-signé', async () => {
    await start({ https: true })
    expect(server.status().url).toMatch(/^https:/)
    expect(server.status().certificate.commonName).toBe('HTTP@Sulfur')
    expect(await errorOf(httpRequest(`https://127.0.0.1:${port}/health`))).not.toBe('OK')
    const res = await httpRequest(`https://127.0.0.1:${port}/health`, { allowInsecure: true })
    expect(res.status).toBe(200)
  })

  it('applique les défauts : délai, code forcé sur une variable, absence de réponse, coupure, valeurs figées', async () => {
    await start()
    const points = createPointsApi({ server, client })
    points.setFaults([{ id: 'd', type: 'delay', params: { ms: 300 }, points: [] }])
    let started = Date.now()
    await json('/health')
    expect(Date.now() - started).toBeGreaterThanOrEqual(290)

    points.setFaults([{ id: 'b', type: 'badStatus', params: { code: 503 }, points: ['server:var-2'] }])
    expect((await json('/api/variables/setpoint')).status).toBe(503)
    expect((await json('/api/variables/temperature')).status).toBe(200)
    expect((await json('/api/setpoint', { method: 'POST', body: '{"value":1}' })).status).toBe(503)

    points.setFaults([{ id: 'n', type: 'noResponse', params: {}, points: [] }])
    expect(await errorOf(httpRequest(`${base()}/health`, { timeout: 400 }))).toMatch(/400/)

    points.setFaults([{ id: 'c', type: 'cut', params: {}, points: [] }])
    expect(await errorOf(httpRequest(`${base()}/health`, { timeout: 1000 }))).not.toBe('OK')

    points.setFaults([{ id: 'f', type: 'freeze', params: {}, points: [] }])
    const frozen = server.values()['var-1']
    await sleep(300)
    expect(server.values()['var-1']).toBe(frozen)
    points.setFaults([])
    expect((await json('/health')).status).toBe(200)
  })

  it('appelle les webhooks sur changement et périodiquement', async () => {
    // Serveur de réception : un second serveur Sulfur dont une route enregistre l’appel.
    const receiver = new HttpServer(null, {})
    const receiverPort = await freePort()
    await receiver.start({
      ...DEFAULT_SERVER_CONFIG,
      port: receiverPort,
      variables: [
        { id: 'r', name: 'received', dataType: 'JSON', initialValue: 'null', simulation: 'none', writable: true }
      ],
      routes: [{ id: 'hook', method: 'POST', path: '/hook', status: 204, body: '', setVariable: 'r', source: 'body' }]
    })
    try {
      await start({
        webhooks: [
          { id: 'w', url: `http://127.0.0.1:${receiverPort}/hook`, mode: 'change', interval: 0, variables: ['var-2'] }
        ]
      })
      server.setValue('var-2', 81)
      const payload = await waitFor(() => receiver.values().r)
      expect(payload).toMatchObject({ event: 'change', changes: [{ variable: 'setpoint', value: 81, previous: 50 }] })
      await waitFor(() => logs.some((l) => l.direction === 'out' && l.status === 204))

      server.setWebhooks([{ id: 'w2', url: `http://127.0.0.1:${receiverPort}/hook`, mode: 'interval', interval: 1 }])
      await waitFor(() => receiver.values().r?.event === 'interval', 3000)
      expect(Object.keys(receiver.values().r.values)).toContain('temperature')
    } finally {
      await receiver.stop()
    }
  })
})

describe('Client HTTP', () => {
  it('envoie des requêtes et surveille une valeur JSON publiée comme point', async () => {
    await start()
    client.configure({ baseUrl: base(), pollInterval: 100 })
    const res = await client.send({ method: 'PUT', path: '/api/variables/setpoint', body: '{"value": 12}' })
    expect(res).toMatchObject({ status: 200, method: 'PUT', url: `${base()}/api/variables/setpoint` })

    client.addWatch({ label: 'Consigne', path: '/api/variables/setpoint', jsonPath: 'value', writeMethod: 'PUT' })
    const points = createPointsApi({ server, client })
    const watch = points.points().find((p) => p.group === 'client')
    expect(watch).toMatchObject({ name: 'Consigne', writable: true })
    await waitFor(() => points.read([watch.id])[watch.id] === 12)
    await points.write(watch.id, 44)
    expect(server.values()['var-2']).toBe(44)
    await waitFor(() => points.read([watch.id])[watch.id] === 44)

    client.addWatch({ path: '/api/variables/setpoint', jsonPath: 'absent' })
    await waitFor(() => client.status().watches.length === 2 && [...client.last.values()].some((d) => d.error))
    expect(await errorOf(client.send({ method: 'TRACE', path: '/' }))).not.toBe('OK')
    expect(await errorOf(httpRequest('ftp://x/'))).not.toBe('OK')
  })
})
