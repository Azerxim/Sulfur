import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { SimulationServer } from '@modules/opcua/main/server'
import { SimulationClient } from '@modules/opcua/main/client'
import { PkiStore } from '@modules/opcua/main/pki'
import { describeNodeset } from '@modules/opcua/main/nodesets'
import { DEFAULT_SERVER_CONFIG, DEFAULT_SERVER_SECURITY } from '@modules/opcua/shared/constants'
import { t } from '@modules/opcua/shared/i18n'
import { errorOf, freePort, sleep, tempDir } from './helpers'

let tmp, serverPki, clientPki, server, client, url
let events = []

const nodeId = (name) => `ns=1;s=Simulation.${name}`

async function start(security = {}, config = {}) {
  const status = await server.start({
    ...DEFAULT_SERVER_CONFIG,
    port: await freePort(),
    security: { ...DEFAULT_SERVER_SECURITY, ...security },
    ...config
  })
  url = status.endpointUrl
  return status
}

/** Connexion + lecture + déconnexion : 'OK' ou le message d'erreur. */
const tryConnect = (security) =>
  errorOf(async () => {
    await client.connect(url, security)
    await client.read(nodeId('Label'))
    await client.disconnect()
  })

/** Début d'un message traduit dont la fin contient le détail technique. */
const prefix = (key) => t(key, { details: '' }).trim()

beforeAll(async () => {
  tmp = await tempDir('opcua')
  serverPki = new PkiStore(`${tmp.dir}/server`)
  clientPki = new PkiStore(`${tmp.dir}/client`)
  server = new SimulationServer(
    serverPki,
    () => {},
    () => {}
  )
  client = new SimulationClient(
    clientPki,
    () => {},
    () => {},
    (event) => events.push(event)
  )
})

afterEach(async () => {
  events = []
  await client.disconnect().catch(() => {})
  await server.stop()
})

afterAll(() => tmp.cleanup())

describe('Serveur OPC UA : certificat et mots de passe', () => {
  it('génère le certificat OPCUA@Sulfur et le conserve entre deux démarrages', async () => {
    await start()
    const own = (await serverPki.list()).own
    expect(own).toHaveLength(1)
    expect(own[0].commonName).toBe('OPCUA@Sulfur')
    await server.stop()
    await start()
    expect((await serverPki.list()).own[0].thumbprint).toBe(own[0].thumbprint)
  })

  it("ne conserve que l'empreinte scrypt des mots de passe", async () => {
    await start({ users: [{ username: 'bob', password: 'secret' }] })
    const status = JSON.stringify(server.status())
    expect(server.status().config.security.users[0].passwordHash).toMatch(/^scrypt\$/)
    expect(status).not.toContain('secret')
    expect(status).not.toContain('"password"')
  })

  it('refuse un utilisateur sans mot de passe et une configuration sans mode', async () => {
    expect(await errorOf(start({ users: [{ username: 'x', passwordHash: null }] }))).toBe(
      t('opcua.errors.userNoPassword', { name: 'x' })
    )
    expect(await errorOf(start({ modes: [] }))).toBe(t('opcua.errors.noMode'))
  })
})

describe('Sécurité OPC UA', () => {
  it('découvre les endpoints proposés', async () => {
    await start()
    const endpoints = await client.discover(url)
    expect(endpoints.some((e) => e.mode === 'None')).toBe(true)
    expect(endpoints.some((e) => e.mode === 'SignAndEncrypt' && e.policy === 'Aes256_Sha256_RsaPss')).toBe(true)
  })

  it.each([
    ['None', { mode: 'None' }],
    ['Sign / Basic256Sha256', { mode: 'Sign', policy: 'Basic256Sha256' }],
    ['SignAndEncrypt / Aes256_Sha256_RsaPss', { mode: 'SignAndEncrypt', policy: 'Aes256_Sha256_RsaPss' }]
  ])('se connecte en %s', async (_, security) => {
    await start()
    expect(await tryConnect(security)).toBe('OK')
  })

  it('authentifie par identifiant / mot de passe', async () => {
    await start({ users: [{ username: 'bob', password: 'secret' }] })
    const user = { auth: 'username', username: 'bob' }
    expect(await tryConnect({ mode: 'SignAndEncrypt', policy: 'Basic256Sha256', ...user, password: 'secret' })).toBe(
      'OK'
    )
    expect(await tryConnect({ mode: 'None', ...user, password: 'secret' })).toBe('OK')
    const wrong = await tryConnect({ mode: 'None', ...user, password: 'Secret' })
    expect(wrong.startsWith(prefix('opcua.errors.authRefused'))).toBe(true)
  })

  it('applique les restrictions : accès anonyme interdit, mode None absent', async () => {
    await start({ allowAnonymous: false, modes: ['SignAndEncrypt'] })
    expect(await tryConnect({ mode: 'SignAndEncrypt', policy: 'Basic256Sha256' })).toBe(t('opcua.errors.noAnonymous'))
    expect(await tryConnect({ mode: 'None' })).toBe(t('opcua.errors.noEndpoint'))
    const admin = { auth: 'username', username: 'admin', password: 'admin' }
    expect(await tryConnect({ mode: 'SignAndEncrypt', policy: 'Basic256Sha256', ...admin })).toBe('OK')
  })

  it("refuse un certificat client inconnu puis l'accepte après approbation", async () => {
    for (const cert of (await serverPki.list()).trusted) await serverPki.remove(cert.thumbprint)
    await start({ autoAcceptCertificates: false })
    const refused = await tryConnect({ mode: 'Sign', policy: 'Basic256Sha256' })
    expect(refused.startsWith(prefix('opcua.errors.certRefused'))).toBe(true)
    const rejected = (await serverPki.list()).rejected
    expect(rejected).toHaveLength(1)
    await serverPki.trust(rejected[0].thumbprint)
    await sleep(1500) // le gestionnaire de certificats relit le dossier
    expect(await tryConnect({ mode: 'Sign', policy: 'Basic256Sha256' })).toBe('OK')
    expect(await tryConnect({ mode: 'None' })).toBe('OK')
  })
})

describe('Modification à chaud des variables', () => {
  it('applique valeurs, droits, simulation, ajout, renommage et suppression', async () => {
    const status = await start()
    await client.connect(url)
    const label = status.config.variables.find((v) => v.name === 'Label')
    const temperature = status.config.variables.find((v) => v.name === 'Temperature')

    server.setValue(label.id, 'direct')
    expect((await client.read(nodeId('Label'))).value).toBe('direct')

    server.upsertVariable({ ...label, writable: false })
    expect((await client.read(nodeId('Label'))).writable).toBe(false)
    expect(await errorOf(client.write(nodeId('Label'), 'x'))).not.toBe('OK')

    server.upsertVariable({ ...temperature, simulation: 'none' })
    const frozen = (await client.read(nodeId('Temperature'))).value
    await sleep(400)
    expect((await client.read(nodeId('Temperature'))).value).toBe(frozen)

    const added = {
      id: 'new',
      name: 'Flow',
      dataType: 'Int32',
      initialValue: 7,
      simulation: 'none',
      period: 1000,
      min: 0,
      max: 1,
      writable: true
    }
    server.upsertVariable(added)
    expect((await client.read(nodeId('Flow'))).value).toBe(7)

    server.upsertVariable({ ...added, name: 'Flow2', dataType: 'Double', initialValue: 1.5 })
    const folder = (await client.browse('i=85')).find((o) => o.displayName === 'Simulation')
    const names = (await client.browse(folder.nodeId)).map((v) => v.displayName)
    expect(names).toContain('Flow2')
    expect(names).not.toContain('Flow')
    expect((await client.read(nodeId('Flow2'))).dataType).toBe('Double')

    expect(await errorOf(() => server.upsertVariable({ ...label, id: 'x', name: 'Counter' }))).toBe(
      t('opcua.errors.exists', { name: 'Counter' })
    )

    server.removeVariable('new')
    expect((await client.read(nodeId('Flow2'))).statusCode).not.toBe('Good')

    server.setUpdateRate(50)
    expect(server.status().config.updateRate).toBe(50)
    expect(server.status().config.variables).toHaveLength(DEFAULT_SERVER_CONFIG.variables.length)
  })
})

const variable = (name, extra = {}) => ({
  id: name,
  name,
  dataType: 'Double',
  initialValue: 0,
  simulation: 'none',
  period: 1000,
  min: 0,
  max: 1,
  writable: true,
  ...extra
})

/** Attend qu'une condition soit remplie (événements reçus de façon asynchrone). */
async function waitFor(check, timeout = 5000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const result = check()
    if (result) return result
    await sleep(50)
  }
  throw new Error('délai dépassé')
}

describe('Tableaux et types structurés', () => {
  it('expose, lit et écrit des tableaux et des structures', async () => {
    await start(
      {},
      {
        structures: [
          {
            id: 's1',
            name: 'Point',
            fields: [
              { name: 'X', dataType: 'Double', array: false },
              { name: 'Label', dataType: 'String', array: false },
              { name: 'Tags', dataType: 'String', array: true }
            ]
          }
        ],
        variables: [
          variable('Position', { dataType: 'Point', initialValue: '{"X": 1.5, "Label": "a"}' }),
          variable('Table', { dataType: 'Int32', arrayLength: 3, initialValue: '1, 2' }),
          variable('Wave', { arrayLength: 4, simulation: 'sine', period: 1000, min: 0, max: 10 })
        ],
        methods: [],
        alarms: []
      }
    )
    await client.connect(url)

    const position = await client.read(nodeId('Position'))
    expect(position.dataType).toBe('Point')
    expect(position.value).toEqual({ x: 1.5, label: 'a', tags: [] })
    await client.write(nodeId('Position'), '{"x": 3, "label": "b", "tags": ["u", "v"]}')
    expect(server.values().Position).toEqual({ x: 3, label: 'b', tags: ['u', 'v'] })
    server.setValue('Position', { X: 4 })
    expect((await client.read(nodeId('Position'))).value).toEqual({ x: 4, label: '', tags: [] })

    const table = await client.read(nodeId('Table'))
    expect(table.dataType).toBe('Int32[]')
    expect(table.value).toEqual([1, 2, 0])
    await client.write(nodeId('Table'), '7; 8; 9')
    expect(server.values().Table).toEqual([7, 8, 9])
    expect(await errorOf(client.write(nodeId('Table'), '1.5, 2'))).toBe(t('errors.invalidInteger', { value: '1.5' }))

    const wave = (await client.read(nodeId('Wave'))).value
    expect(wave).toHaveLength(4)
    expect(new Set(wave).size).toBeGreaterThan(1) // éléments déphasés
  })

  it('refuse un type structuré invalide', async () => {
    const structures = [{ id: 's', name: 'Bad Name', fields: [{ name: 'X', dataType: 'Double' }] }]
    expect(await errorOf(start({}, { structures }))).toBe(t('opcua.errors.invalidName', { name: 'Bad Name' }))
  })

  it('simule une variable String avec un générateur numérique', async () => {
    await start({}, { variables: [variable('Text', { dataType: 'String', simulation: 'ramp', max: 100 })], alarms: [] })
    await sleep(300)
    expect(server.values().Text).toMatch(/^\d+(\.\d+)?$/)
  })
})

describe('Méthodes', () => {
  it('appelle des méthodes (variables, écho, échec) et les modifie à chaud', async () => {
    const status = await start()
    await client.connect(url)
    const method = nodeId('SetLabel')

    const info = await client.methodInfo(method)
    expect(info.objectId).toBe('ns=1;s=Simulation')
    expect(info.inputs.map((a) => [a.name, a.builtIn, a.type])).toEqual([['Label', 'String', 'String']])
    const counter = status.config.variables.find((v) => v.name === 'Counter')
    server.upsertVariable({ ...counter, simulation: 'none' })
    server.setValue(counter.id, 12)
    const result = await client.call(method, ['hello'])
    expect(result).toEqual({ statusCode: 'Good', outputs: [{ name: 'Counter', value: 12 }] })
    expect((await client.read(nodeId('Label'))).value).toBe('hello')

    const echo = {
      id: 'echo',
      name: 'Echo',
      inputs: [
        { name: 'A', dataType: 'Double', array: false },
        { name: 'B', dataType: 'String', array: true }
      ],
      outputs: [
        { name: 'A', dataType: 'Double', array: false },
        { name: 'B', dataType: 'String', array: true }
      ],
      behavior: 'echo'
    }
    server.upsertMethod(echo)
    expect((await client.call(nodeId('Echo'), ['1.5', 'x, y'])).outputs.map((o) => o.value)).toEqual([1.5, ['x', 'y']])

    server.upsertMethod({ ...echo, behavior: 'fail', statusCode: 'BadInvalidState' })
    expect((await client.call(nodeId('Echo'), ['1', ''])).statusCode).toBe('BadInvalidState')

    expect(await errorOf(() => server.upsertMethod({ ...echo, id: 'other', name: 'Label' }))).toBe(
      t('opcua.errors.exists', { name: 'Label' })
    )
    server.removeMethod('echo')
    expect(await errorOf(client.call(nodeId('Echo'), []))).not.toBe('OK')
  })
})

describe('Alarmes et événements', () => {
  it('signale, acquitte et lève une alarme à seuils, et transmet les événements', async () => {
    const status = await start()
    const temperature = status.config.variables.find((v) => v.name === 'Temperature')
    server.upsertVariable({ ...temperature, simulation: 'none' })
    server.setValue(temperature.id, 20)
    await client.connect(url)
    await client.subscribeEvents()
    expect(client.status().events).toBe(true)

    server.setValue(temperature.id, 25)
    const alarm = await waitFor(() => events.find((e) => e.conditionName === 'TemperatureAlarm' && e.active))
    expect(alarm.acked).toBe(false)
    expect(alarm.severity).toBeGreaterThan(0)
    expect(await client.acknowledge(alarm.conditionId, alarm.eventId)).toBe('Good')
    await waitFor(() => events.find((e) => e.conditionId === alarm.conditionId && e.active && e.acked))

    // Seuil relevé à chaud : l'alarme repasse à l'état normal.
    const def = status.config.alarms[0]
    server.upsertAlarm({ ...def, highHigh: 50, high: 40 })
    await waitFor(() => events.find((e) => e.conditionId === alarm.conditionId && e.active === false))

    server.raiseEvent({ message: 'Bonjour', severity: 700 })
    const event = await waitFor(() => events.find((e) => e.message === 'Bonjour'))
    expect(event).toMatchObject({ eventType: 'BaseEventType', severity: 700, sourceName: 'Simulation' })

    server.setValue(temperature.id, 60)
    await waitFor(() => events.filter((e) => e.conditionId === alarm.conditionId && e.active).length > 2)
    server.removeAlarm(def.id)
    expect(server.status().config.alarms).toHaveLength(0)
    await waitFor(() => events.find((e) => e.conditionId === alarm.conditionId && e.disabled))
    await client.unsubscribeEvents()
    expect(client.status().events).toBe(false)
  })
})

describe('Historique', () => {
  it('conserve et relit les valeurs des variables historisées', async () => {
    const status = await start()
    const temperature = status.config.variables.find((v) => v.name === 'Temperature')
    const from = Date.now() - 1000
    server.upsertVariable({ ...temperature, simulation: 'none' })
    for (const value of [1, 2, 3]) {
      server.setValue(temperature.id, value)
      await sleep(20)
    }
    await client.connect(url)
    expect((await client.read(nodeId('Temperature'))).historizing).toBe(true)
    expect((await client.read(nodeId('Label'))).historizing).toBe(false)
    const values = (await client.history(nodeId('Temperature'), from)).map((d) => d.value)
    expect(values.slice(-3)).toEqual([1, 2, 3])
    expect(await errorOf(client.history(nodeId('Label'), from))).not.toBe('OK')
  })
})

const NODESET = (requires = 'http://opcfoundation.org/UA/DI/') => `<?xml version="1.0" encoding="utf-8"?>
<UANodeSet xmlns="http://opcfoundation.org/UA/2011/03/UANodeSet.xsd">
  <NamespaceUris><Uri>urn:test:pump</Uri></NamespaceUris>
  <Models>
    <Model ModelUri="urn:test:pump" Version="1.0.0" PublicationDate="2026-01-01T00:00:00Z">
      <RequiredModel ModelUri="http://opcfoundation.org/UA/" Version="1.04.0" PublicationDate="2020-01-01T00:00:00Z"/>
      <RequiredModel ModelUri="${requires}" Version="1.00" PublicationDate="2020-01-01T00:00:00Z"/>
    </Model>
  </Models>
  <Aliases>
    <Alias Alias="Double">i=11</Alias>
    <Alias Alias="Organizes">i=35</Alias>
    <Alias Alias="HasComponent">i=47</Alias>
    <Alias Alias="HasTypeDefinition">i=40</Alias>
  </Aliases>
  <UAObject NodeId="ns=1;s=Pump" BrowseName="1:Pump">
    <DisplayName>Pump</DisplayName>
    <References>
      <Reference ReferenceType="Organizes" IsForward="false">i=85</Reference>
      <Reference ReferenceType="HasTypeDefinition">i=58</Reference>
    </References>
  </UAObject>
  <UAVariable NodeId="ns=1;s=Pump.Speed" BrowseName="1:Speed" DataType="Double" AccessLevel="3" UserAccessLevel="3">
    <DisplayName>Speed</DisplayName>
    <References>
      <Reference ReferenceType="HasComponent" IsForward="false">ns=1;s=Pump</Reference>
      <Reference ReferenceType="HasTypeDefinition">i=63</Reference>
    </References>
    <Value><Double xmlns="http://opcfoundation.org/UA/2008/02/Types.xsd">42.5</Double></Value>
  </UAVariable>
</UANodeSet>`

describe('Import NodeSet2', () => {
  it('décrit un fichier NodeSet2', () => {
    expect(describeNodeset(NODESET())).toEqual({
      namespaces: ['urn:test:pump'],
      models: ['urn:test:pump'],
      requires: ['http://opcfoundation.org/UA/', 'http://opcfoundation.org/UA/DI/']
    })
    expect(() => describeNodeset('<html/>')).toThrow(t('opcua.errors.notNodeset'))
  })

  it('charge le modèle importé et ses dépendances fournies avec node-opcua', async () => {
    const xml = NODESET()
    const status = await start({}, { nodesets: [{ id: 'n', name: 'pump.xml', xml, ...describeNodeset(xml) }] })
    expect(status.nodesets).toEqual(['pump.xml'])
    expect(status.config.nodesets).toBeUndefined()
    await client.connect(url)
    const pump = (await client.browse('i=85')).find((n) => n.displayName === 'Pump')
    const speed = (await client.browse(pump.nodeId)).find((n) => n.displayName === 'Speed')
    expect((await client.read(speed.nodeId)).value).toBe(42.5)
    expect((await client.browse('i=85')).some((n) => n.displayName === 'DeviceSet')).toBe(true) // modèle DI
    // Les variables simulées restent dans l'espace de noms 1.
    expect((await client.read(nodeId('Label'))).value).toBe('Sulfur')
  })

  it('signale un modèle requis introuvable', async () => {
    const xml = NODESET('urn:unknown')
    expect(await errorOf(start({}, { nodesets: [{ name: 'pump.xml', xml, ...describeNodeset(xml) }] }))).toBe(
      t('opcua.errors.missingModel', { uri: 'urn:unknown', name: 'pump.xml' })
    )
  })
})
