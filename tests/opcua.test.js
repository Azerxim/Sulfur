import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { SimulationServer } from '@modules/opcua/main/server'
import { SimulationClient } from '@modules/opcua/main/client'
import { PkiStore } from '@modules/opcua/main/pki'
import { DEFAULT_SERVER_CONFIG, DEFAULT_SERVER_SECURITY } from '@modules/opcua/shared/constants'
import { t } from '@modules/opcua/shared/i18n'
import { errorOf, freePort, sleep, tempDir } from './helpers'

let tmp, serverPki, clientPki, server, client, url

const nodeId = (name) => `ns=1;s=Simulation.${name}`

async function start(security = {}) {
  const status = await server.start({
    ...DEFAULT_SERVER_CONFIG,
    port: await freePort(),
    security: { ...DEFAULT_SERVER_SECURITY, ...security }
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
    () => {}
  )
})

afterEach(async () => {
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
    expect(server.status().config.variables).toHaveLength(5)
  })
})
