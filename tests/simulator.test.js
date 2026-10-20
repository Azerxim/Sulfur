import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { SimulationServer } from '@modules/opcua/main/server'
import { SimulationClient } from '@modules/opcua/main/client'
import { PkiStore } from '@modules/opcua/main/pki'
import { createPointsApi as opcuaPoints } from '@modules/opcua/main/points'
import { DEFAULT_SERVER_CONFIG as OPCUA_CONFIG } from '@modules/opcua/shared/constants'
import { ModbusServer } from '@modules/modbus/main/server'
import { ModbusClient } from '@modules/modbus/main/client'
import { ModbusPki } from '@modules/modbus/main/pki'
import { createPointsApi as modbusPoints } from '@modules/modbus/main/points'
import { DEFAULT_SERVER_CONFIG as MODBUS_CONFIG } from '@modules/modbus/shared/constants'
import { SimulatorEngine } from '@modules/simulator/main/engine'
import { FlowRuntime } from '@modules/simulator/main/flows'
import { createNode, migrateSimulatorConfig, stepsToFlow } from '@modules/simulator/shared/flows'
import { TrendRecorder } from '@modules/trends/main/recorder'
import { t } from '@modules/simulator/shared/i18n'
import { errorOf, freePort, sleep, tempDir } from './helpers'

let tmp, opcua, modbus, engine, peers, statuses

const nodeId = (name) => `ns=1;s=Simulation.${name}`

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

beforeAll(async () => {
  tmp = await tempDir('simulator')
  const opcuaServer = new SimulationServer(
    new PkiStore(`${tmp.dir}/opcua-server`),
    () => {},
    () => {}
  )
  const opcuaClient = new SimulationClient(
    new PkiStore(`${tmp.dir}/opcua-client`),
    () => {},
    () => {}
  )
  const modbusPki = new ModbusPki(`${tmp.dir}/modbus`)
  const modbusServer = new ModbusServer(modbusPki, { onStatus() {}, onValues() {}, onLog() {} })
  const modbusClient = new ModbusClient(modbusPki, { onStatus() {}, onData() {} })
  opcua = { server: opcuaServer, client: opcuaClient, api: opcuaPoints({ server: opcuaServer, client: opcuaClient }) }
  modbus = {
    server: modbusServer,
    client: modbusClient,
    api: modbusPoints({ server: modbusServer, client: modbusClient })
  }
  peers = [
    { id: 'opcua', api: opcua.api },
    { id: 'modbus', api: modbus.api }
  ]
  statuses = []
  engine = new SimulatorEngine({ peers: () => peers, onStatus: (s) => statuses.push(s) })
})

afterEach(async () => {
  statuses = []
  await engine.dispose()
  await opcua.client.disconnect().catch(() => {})
  await modbus.client.disconnect().catch(() => {})
  await opcua.server.stop()
  await modbus.server.stop()
})

afterAll(() => tmp.cleanup())

async function startOpcua(variables = OPCUA_CONFIG.variables) {
  const status = await opcua.server.start({ ...OPCUA_CONFIG, port: await freePort(), variables, alarms: [] })
  await opcua.client.connect(status.endpointUrl)
  return status
}

async function startModbus() {
  const port = await freePort()
  await modbus.server.start({ ...MODBUS_CONFIG, port })
  await modbus.client.connect({ host: '127.0.0.1', port, unitId: 1, timeout: 800 })
  return port
}

const fault = (module, type, extra = {}) => ({
  id: `${module}-${type}`,
  module,
  type,
  params: {},
  points: [],
  duration: 0,
  ...extra
})

describe('Points publiés par les modules', () => {
  it('listent les points du serveur même arrêté, puis lisent et écrivent', async () => {
    const points = engine.targets()
    expect(points.map((p) => p.name)).toEqual(['OPC UA', 'Modbus'])
    expect(points[0].points.find((p) => p.id === 'server:var-1')).toMatchObject({ name: 'Temperature', numeric: true })
    expect(points[0].points.find((p) => p.id === 'server:var-6')).toMatchObject({
      dataType: 'Double[]',
      numeric: false
    })
    expect(points[1].points.find((p) => p.id === 'server:pt-1')).toMatchObject({ name: 'Temperature', numeric: true })
    expect(points[1].faultTypes.map((f) => f.type)).toContain('exception')

    await startOpcua()
    await startModbus()
    await engine.write('opcua/server:var-5', 'écrit')
    await engine.write('modbus/server:pt-2', 42)
    expect(engine.read(['opcua/server:var-5', 'modbus/server:pt-2'])).toEqual({
      'opcua/server:var-5': 'écrit',
      'modbus/server:pt-2': 42
    })

    // Valeurs surveillées par les clients.
    await opcua.client.subscribe(nodeId('Label'))
    await waitFor(() => engine.read(['opcua/client:' + nodeId('Label')])['opcua/client:' + nodeId('Label')] === 'écrit')
    await modbus.client.addWatch({ table: 'holdingRegisters', address: 10, dataType: 'Int16' })
    const watch = engine.targets()[1].points.find((p) => p.group === 'client')
    await waitFor(() => engine.read([`modbus/${watch.id}`])[`modbus/${watch.id}`] === 42)
    await engine.write(`modbus/${watch.id}`, 7)
    expect(modbus.server.values()['pt-2']).toBe(7)
  })
})

describe('Injection de défauts OPC UA', () => {
  it('retarde les réponses, force un code d’état et fige une variable', async () => {
    await startOpcua()
    let start = Date.now()
    await opcua.client.read(nodeId('Label'))
    const normal = Date.now() - start

    await engine.activateFault(fault('opcua', 'delay', { params: { ms: 400 } }))
    start = Date.now()
    await opcua.client.read(nodeId('Label'))
    expect(Date.now() - start).toBeGreaterThanOrEqual(380 + normal / 2)
    await engine.deactivateFault('opcua-delay')

    await engine.activateFault(
      fault('opcua', 'badStatus', { params: { code: 'BadSensorFailure' }, points: ['server:var-1'] })
    )
    expect((await opcua.client.read(nodeId('Temperature'))).statusCode).toBe('BadSensorFailure')
    expect((await opcua.client.read(nodeId('Pressure'))).statusCode).toBe('Good')
    await engine.deactivateFault('opcua-badStatus')
    expect((await opcua.client.read(nodeId('Temperature'))).statusCode).toBe('Good')

    await engine.activateFault(fault('opcua', 'freeze', { points: ['server:var-1'] }))
    const frozen = (await opcua.client.read(nodeId('Temperature'))).value
    await sleep(400)
    expect((await opcua.client.read(nodeId('Temperature'))).value).toBe(frozen)
    expect(engine.status().faults.map((f) => f.id)).toEqual(['opcua-freeze'])
  })

  it('coupe les connexions puis les rétablit, et arrête un défaut à la fin de sa durée', async () => {
    const status = await startOpcua()
    await engine.activateFault(fault('opcua', 'cut', { duration: 1.5 }))
    await waitFor(async () => (await errorOf(opcua.client.read(nodeId('Label')))) !== 'OK', 1400)
    await waitFor(() => engine.status().faults.length === 0, 3000)
    await opcua.client.disconnect().catch(() => {})
    await opcua.client.connect(status.endpointUrl)
    expect((await opcua.client.read(nodeId('Label'))).statusCode).toBe('Good')
  })

  it('refuse un défaut non pris en charge par le module', async () => {
    expect(await errorOf(engine.activateFault(fault('opcua', 'exception')))).toBe(
      t('simulator.errors.unsupportedFault', { module: 'OPC UA' })
    )
  })
})

describe('Injection de défauts Modbus', () => {
  it('force une exception, retarde, ne répond plus et coupe les connexions', async () => {
    const port = await startModbus()
    await engine.activateFault(fault('modbus', 'exception', { params: { code: 2, scope: 'write' } }))
    expect(await modbus.client.readValue('holdingRegisters', 2, 'Int16', 'ABCD')).toBeTypeOf('number')
    expect(await errorOf(modbus.client.writeValue('holdingRegisters', 2, 5, 'Int16', 'ABCD'))).toMatch(/02|address/i)
    await engine.deactivateFault('modbus-exception')

    await engine.activateFault(fault('modbus', 'delay', { params: { ms: 300 } }))
    const start = Date.now()
    await modbus.client.readValue('holdingRegisters', 2, 'Int16', 'ABCD')
    expect(Date.now() - start).toBeGreaterThanOrEqual(290)
    await engine.deactivateFault('modbus-delay')

    await engine.activateFault(fault('modbus', 'noResponse'))
    expect(await errorOf(modbus.client.readValue('holdingRegisters', 2, 'Int16', 'ABCD'))).toMatch(/800/)
    await engine.deactivateFault('modbus-noResponse')

    await engine.activateFault(fault('modbus', 'cut'))
    await waitFor(() => !modbus.client.status().connected)
    expect(await errorOf(modbus.client.connect({ host: '127.0.0.1', port, unitId: 1, timeout: 800 }))).not.toBe('OK')
    await engine.clearFaults()
    await modbus.client.connect({ host: '127.0.0.1', port, unitId: 1, timeout: 800 })
    expect(await modbus.client.readValue('holdingRegisters', 2, 'Int16', 'ABCD')).toBeTypeOf('number')
  })
})

describe('Flux', () => {
  const variables = OPCUA_CONFIG.variables.map((v) => ({ ...v, simulation: 'none' }))
  let runtime, debug, fake

  /** Module factice : points en mémoire, défaut « delay » accepté. */
  function fakePeer() {
    const values = { a: 0, b: 0, s: '' }
    const faults = []
    return {
      values,
      faults,
      peer: {
        id: 'fake',
        api: {
          name: 'Fake',
          points: () => Object.keys(values).map((id) => ({ id, group: 'server', name: id, writable: true })),
          read: (ids) => Object.fromEntries(ids.map((id) => [id, values[id]])),
          async write(id, value) {
            if (!(id in values)) throw new Error(`inconnu : ${id}`)
            values[id] = value
          },
          faultTypes: () => [{ type: 'delay' }],
          setFaults: (list) => faults.splice(0, faults.length, ...list)
        }
      }
    }
  }

  /** Flux à partir de nœuds { id, type, config } et de fils 'a>b' ou 'a:1>b' (sortie 1). */
  const flow = (nodes, wires, extra = {}) => ({
    id: 'f',
    name: 'test',
    nodes: nodes.map((n) => ({ ...createNode(n.type, 0, 0, n.config), id: n.id })),
    wires: wires.map((w) => {
      const [from, target] = w.split('>')
      const [source, port = '0'] = from.split(':')
      return { id: w, source, port: Number(port), target }
    }),
    ...extra
  })

  beforeEach(() => {
    fake = fakePeer()
    peers.push(fake.peer)
    debug = []
    runtime = new FlowRuntime({
      engine,
      faults: () => [fault('fake', 'delay', { id: 'd', params: { ms: 10 } })],
      onDebug: (messages) => debug.push(...messages)
    })
  })

  afterEach(async () => {
    await runtime.dispose()
    peers.splice(peers.indexOf(fake.peer), 1)
  })

  const values = () => debug.filter((m) => m.level === 'info').map((m) => m.value)

  it('fait circuler les messages : déclencheur, fonction, aiguillage, échelle, compteur et filtre', async () => {
    await runtime.deploy([
      flow(
        [
          { id: 'in', type: 'inject', config: { payloadType: 'number', payload: '30' } },
          { id: 'fn', type: 'function', config: { code: 'msg.payload = msg.payload * 2\nreturn msg' } },
          { id: 'sw', type: 'switch' }, // > 50 sur la sortie 0, sinon sortie 1
          { id: 'sc', type: 'scale', config: { inMin: 0, inMax: 100, outMin: 0, outMax: 10 } },
          { id: 'ct', type: 'counter' },
          { id: 'ft', type: 'filter' },
          { id: 'dbg', type: 'debug' }
        ],
        ['in>fn', 'fn>sw', 'sw:0>sc', 'sw:1>ct', 'sc>ft', 'ct>ft', 'ft>dbg']
      )
    ])
    runtime.inject('in') // 60 > 50 → échelle → 6
    await waitFor(() => values().length === 1)
    expect(values()).toEqual([6])

    await runtime.deploy([
      flow(
        [
          { id: 'in', type: 'inject', config: { payloadType: 'number', payload: '10' } },
          { id: 'sw', type: 'switch' },
          { id: 'ct', type: 'counter' },
          { id: 'ft', type: 'filter' },
          { id: 'dbg', type: 'debug' }
        ],
        ['in>sw', 'sw:1>ct', 'ct>ft', 'ft>dbg']
      )
    ])
    debug = []
    for (let i = 0; i < 3; i++) runtime.inject('in')
    await waitFor(() => values().length === 3)
    expect(values()).toEqual([1, 2, 3])
    expect(runtime.nodeStatuses().ct).toMatchObject({ text: '3' })
  })

  it('recopie un point dans un autre à chaque changement (passerelle)', async () => {
    await runtime.deploy([
      flow(
        [
          { id: 'w', type: 'watch', config: { point: 'fake/a', interval: 50 } },
          { id: 'sc', type: 'scale', config: { inMin: 0, inMax: 10, outMin: 0, outMax: 100, round: true } },
          { id: 'out', type: 'write', config: { point: 'fake/b' } }
        ],
        ['w>sc', 'sc>out']
      )
    ])
    fake.values.a = 4.2
    await waitFor(() => fake.values.b === 42)
    fake.values.a = 1
    await waitFor(() => fake.values.b === 10)
  })

  it('génère des valeurs en continu jusqu’au redéploiement, et met en pause sur un message faux', async () => {
    await runtime.deploy([
      flow(
        [
          { id: 'g', type: 'generator', config: { simulation: 'ramp', period: 1, min: 0, max: 100, interval: 50 } },
          { id: 'out', type: 'write', config: { point: 'fake/a' } },
          { id: 'off', type: 'inject', config: { payloadType: 'boolean', payload: 'false' } }
        ],
        ['g>out', 'off>g']
      )
    ])
    await waitFor(() => fake.values.a > 20)
    runtime.inject('off')
    await sleep(100)
    const paused = fake.values.a
    await sleep(200)
    expect(fake.values.a).toBe(paused)
    expect(runtime.nodeStatuses().g.text).toBe(t('simulator.status.paused'))

    await runtime.stop()
    expect(runtime.state()).toMatchObject({ running: false })
    expect(runtime.nodeStatuses()).toEqual({})
  })

  it('active un défaut, et l’arrête au redéploiement', async () => {
    await runtime.deploy([
      flow(
        [
          { id: 'in', type: 'inject' },
          { id: 'fl', type: 'fault', config: { fault: 'd', action: 'on' } }
        ],
        ['in>fl']
      )
    ])
    runtime.inject('in')
    await waitFor(() => fake.faults.length === 1)
    expect(engine.status().faults.map((f) => f.id)).toEqual(['d'])
    await runtime.deploy([])
    expect(fake.faults).toEqual([])
    expect(engine.status().faults).toEqual([])
  })

  it('signale les erreurs sur le nœud : code invalide, boucle infinie, point inconnu', async () => {
    await runtime.deploy([
      flow(
        [
          { id: 'bad', type: 'function', config: { code: 'return (' } },
          { id: 'in', type: 'inject' },
          { id: 'loop', type: 'function', config: { code: 'while (true) {}' } },
          { id: 'w', type: 'write', config: { point: 'fake/inconnu' } }
        ],
        ['in>loop', 'in>w']
      )
    ])
    expect(runtime.nodeStatuses().bad).toMatchObject({ fill: 'red' })
    runtime.inject('in')
    await waitFor(() => runtime.nodeStatuses().loop?.fill === 'red' && runtime.nodeStatuses().w?.fill === 'red')
    expect(runtime.nodeStatuses().loop.text).toMatch(/timed out/i)
    expect(runtime.nodeStatuses().w.text).toBe('inconnu : inconnu')
    await waitFor(() => debug.filter((m) => m.level === 'error').length >= 3)
    expect(await errorOf(() => runtime.inject('w'))).toBe(t('simulator.errors.notDeployed'))
  })

  it('ne lance pas un flux désactivé', async () => {
    await runtime.deploy([
      flow(
        [
          { id: 'g', type: 'generator', config: { interval: 50 } },
          { id: 'out', type: 'write', config: { point: 'fake/a' } }
        ],
        ['g>out'],
        {
          disabled: true
        }
      )
    ])
    await sleep(200)
    expect(fake.values.a).toBe(0)
    expect(runtime.state().flows).toHaveLength(1)
  })

  it('convertit un ancien scénario en flux et le rejoue sur le serveur OPC UA', async () => {
    await startOpcua(variables)
    const delay = fault('opcua', 'delay', { params: { ms: 50 } })
    runtime.faults = () => [delay]
    const scenario = {
      id: 'sc',
      name: 'Ancien',
      steps: [
        { type: 'set', point: 'opcua/server:var-5', value: 'A' },
        { type: 'fault', fault: delay.id, action: 'on' },
        { type: 'wait', duration: 0.1 },
        { type: 'ramp', point: 'opcua/server:var-3', from: 0, to: 10, duration: 0.3 },
        { type: 'set', point: 'opcua/server:var-5', value: 'B' }
      ]
    }
    const config = migrateSimulatorConfig({ faults: [delay], scenarios: [scenario] })
    expect(config.scenarios).toBeUndefined()
    expect(config.flows[0]).toMatchObject({ id: 'sc', name: 'Ancien' })
    expect(config.flows[0].nodes.map((n) => n.type)).toEqual(['inject', 'write', 'fault', 'delay', 'ramp', 'write'])
    expect(config.flows[0].wires).toHaveLength(5)
    expect(migrateSimulatorConfig(config)).toBe(config)

    await runtime.deploy(config.flows)
    runtime.inject(config.flows[0].nodes[0].id)
    await waitFor(() => engine.status().faults.length === 1)
    await waitFor(() => engine.read(['opcua/server:var-5'])['opcua/server:var-5'] === 'B')
    expect(engine.read(['opcua/server:var-3'])['opcua/server:var-3']).toBe(10)
    await runtime.stop()
    expect(engine.status().faults).toEqual([])
  })

  it('enregistre les évolutions de points dans un flux qui les rejoue', async () => {
    await startOpcua(variables)
    const key = 'opcua/server:var-5'
    opcua.server.setValue('var-5', 'un')
    engine.startRecording([key])
    await sleep(250)
    opcua.server.setValue('var-5', 'deux')
    await sleep(250)
    opcua.server.setValue('var-5', 'trois')
    await sleep(200)
    const steps = engine.stopRecording()
    expect(steps.filter((s) => s.type === 'set').map((s) => s.value)).toEqual(['un', 'deux', 'trois'])
    const waits = steps.filter((s) => s.type === 'wait').map((s) => s.duration)
    expect(waits[0]).toBeGreaterThan(0.15)
    expect(waits.reduce((a, b) => a + b, 0)).toBeGreaterThan(0.6)

    const recorded = stepsToFlow({ name: 'rec', steps })
    opcua.server.setValue('var-5', 'autre')
    await runtime.deploy([recorded])
    runtime.inject(recorded.nodes[0].id)
    await waitFor(() => engine.read([key])[key] === 'deux')
    await waitFor(() => engine.read([key])[key] === 'trois')
  })
})

describe('Enregistrement des courbes', () => {
  it('échantillonne les points des deux modules et exporte en CSV', async () => {
    await startOpcua()
    await startModbus()
    const batches = []
    const recorder = new TrendRecorder({ peers: () => peers, onSamples: (s) => batches.push(s), maxRows: 8 })
    const points = recorder.points()
    expect(points.some((p) => p.key === 'opcua/server:var-4')).toBe(true) // booléen → 0 / 1
    expect(points.some((p) => p.key === 'opcua/server:var-5')).toBe(false) // String
    expect(await errorOf(() => recorder.start({ series: [], interval: 100 }))).not.toBe('OK')

    const series = ['opcua/server:var-1', 'opcua/server:var-4', 'modbus/server:pt-1']
    recorder.start({ series, interval: 50 })
    await sleep(700)
    recorder.stop()
    expect(recorder.status()).toMatchObject({ recording: false, count: 8 })
    expect(batches.length).toBeGreaterThan(0)
    const last = recorder.data().at(-1)
    expect(Object.keys(last.values)).toEqual(series)
    expect(last.values['opcua/server:var-4']).toBeOneOf([0, 1])
    expect(last.values['opcua/server:var-1']).toBeTypeOf('number')

    const csv = recorder.csv({ labels: { 'opcua/server:var-1': 'OPC UA / Temperature' }, decimal: ',' }).split('\r\n')
    expect(csv[0]).toBe('Time;OPC UA / Temperature;opcua/server:var-4;modbus/server:pt-1')
    expect(csv).toHaveLength(10) // en-tête + 8 lignes + fin de fichier
    expect(csv[1]).toMatch(/^\d{4}-\d\d-\d\dT[\d:.]+Z;\d+,\d+;[01];/)
    recorder.clear()
    expect(recorder.data()).toEqual([])
  })
})
