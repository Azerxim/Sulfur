import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
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
    expect(points.map((p) => p.name)).toEqual(['OPC UA', 'Modbus TCP'])
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

describe('Scénarios', () => {
  const variables = OPCUA_CONFIG.variables.map((v) => ({ ...v, simulation: 'none' }))

  it('enchaîne écritures, attente, rampe et défaut, puis arrête ses défauts', async () => {
    await startOpcua(variables)
    const delay = fault('opcua', 'delay', { params: { ms: 50 } })
    const scenario = {
      id: 'sc',
      steps: [
        { type: 'set', point: 'opcua/server:var-5', value: 'A' },
        { type: 'fault', fault: delay.id, action: 'on' },
        { type: 'wait', duration: 0.1 },
        { type: 'ramp', point: 'opcua/server:var-3', from: 0, to: 10, duration: 0.3 },
        { type: 'set', point: 'opcua/server:var-5', value: 'B' }
      ]
    }
    engine.play(scenario, [delay])
    expect(engine.status().scenario).toMatchObject({ id: 'sc', count: 5 })
    await waitFor(() => engine.status().faults.length === 1)
    await waitFor(() => !engine.status().scenario)
    expect(engine.status().error).toBeNull()
    expect(engine.read(['opcua/server:var-5', 'opcua/server:var-3'])).toEqual({
      'opcua/server:var-5': 'B',
      'opcua/server:var-3': 10
    })
    expect(engine.status().faults).toEqual([])
    // Valeurs intermédiaires de la rampe vues par l'historique d'avancement.
    expect(statuses.some((s) => s.scenario?.step === 4)).toBe(true)
  })

  it('boucle jusqu’à l’arrêt et signale une étape en échec', async () => {
    await startOpcua(variables)
    engine.play({ id: 'loop', loop: true, steps: [{ type: 'wait', duration: 0.05 }] })
    await waitFor(() => engine.status().scenario?.iteration >= 3)
    await engine.stop()
    expect(engine.status().scenario).toBeNull()

    engine.play({ id: 'bad', steps: [{ type: 'set', point: 'opcua/server:var-1', value: 'abc' }] })
    await waitFor(() => !engine.status().scenario)
    expect(engine.status().error).toMatch(/^Step 1|^Étape 1/)
    expect(await errorOf(() => engine.play({ id: 'empty', steps: [] }))).toBe(t('simulator.errors.emptyScenario'))
  })

  it('enregistre les évolutions de points et les rejoue', async () => {
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

    opcua.server.setValue('var-5', 'autre')
    engine.play({ id: 'rec', steps })
    await waitFor(() => engine.read([key])[key] === 'deux')
    await waitFor(() => !engine.status().scenario)
    expect(engine.read([key])[key]).toBe('trois')
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
