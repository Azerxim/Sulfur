import fs from 'fs'
import path from 'path'
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterEach, describe, expect, it } from 'vitest'
import { PlcsimBridge } from '@modules/plcsim/main/bridge'
import { PlcsimManager, detectApiPath, resolveApiPath } from '@modules/plcsim/main/manager'
import { createPointsApi } from '@modules/plcsim/main/points'
import { API_DLL } from '@modules/plcsim/shared/constants'
import { errorOf, sleep, tempDir } from './helpers'

describe('Chemin de l’API Simulation Runtime', () => {
  it('choisit la version la plus récente qui contient la DLL', async () => {
    const { dir, cleanup } = await tempDir('plcsim-api')
    try {
      for (const version of ['3.0', '8.0', '10.0']) fs.mkdirSync(path.join(dir, version))
      fs.writeFileSync(path.join(dir, '3.0', API_DLL.x64), '')
      fs.writeFileSync(path.join(dir, '8.0', API_DLL.x64), '')
      expect(detectApiPath(dir)).toBe(path.join(dir, '8.0'))
      expect(resolveApiPath(dir)).toBe(path.join(dir, '8.0'))
      expect(resolveApiPath(path.join(dir, '3.0'))).toBe(path.join(dir, '3.0'))
      expect(resolveApiPath(path.join(dir, '3.0', API_DLL.x64))).toBe(path.join(dir, '3.0', API_DLL.x64))
      expect(await errorOf(() => resolveApiPath(path.join(dir, '10.0')))).toMatch(/10\.0/)
      expect(await errorOf(() => resolveApiPath(path.join(dir, 'absent')))).toMatch(/absent/)
    } finally {
      await cleanup()
    }
  })
})

/** Processus simulé : répond aux requêtes du pont avec `handler(method, params)`. */
function fakeSpawn(handler, { ready = { apiVersion: '8.0' } } = {}) {
  return () => {
    const child = new EventEmitter()
    child.stdin = new PassThrough()
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.kill = () => child.emit('exit', 1)
    let buffer = ''
    child.stdin.on('data', (chunk) => {
      buffer += chunk
      let index
      while ((index = buffer.indexOf('\n')) >= 0) {
        const { id, method, params } = JSON.parse(buffer.slice(0, index))
        buffer = buffer.slice(index + 1)
        if (method === 'exit') {
          child.stdout.write(`${JSON.stringify({ id, ok: true, result: null })}\n`)
          setTimeout(() => child.emit('exit', 0), 5)
          continue
        }
        try {
          child.stdout.write(`${JSON.stringify({ id, ok: true, result: handler(method, params) ?? null })}\n`)
        } catch (err) {
          child.stdout.write(`${JSON.stringify({ id, ok: false, error: err.message, code: err.code ?? null })}\n`)
        }
      }
    })
    setTimeout(() => child.stdout.write(`texte parasite\n${JSON.stringify({ event: 'ready', data: ready })}\n`), 5)
    return child
  }
}

describe('Pont PowerShell (protocole)', () => {
  it('démarre, appelle des méthodes et traduit les codes d’erreur de l’API', async () => {
    const bridge = new PlcsimBridge({
      scriptPath: 'bridge.ps1',
      apiPath: 'api',
      spawn: fakeSpawn((method) => {
        if (method === 'instances') return [{ id: 0, name: 'PLC_1' }]
        throw Object.assign(new Error('Error Code: -52, IsEmpty'), { code: 'IsEmpty' })
      })
    })
    expect(await bridge.start()).toEqual({ apiVersion: '8.0' })
    expect(await bridge.call('instances')).toEqual([{ id: 0, name: 'PLC_1' }])
    expect(await errorOf(bridge.call('run'))).toMatch(/TIA Portal/)
    await bridge.stop()
    expect(await errorOf(bridge.call('instances'))).toMatch(/Not connected/)
  })

  it('signale un échec de chargement de l’API', async () => {
    const spawn = () => {
      const child = new EventEmitter()
      Object.assign(child, { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough() })
      setTimeout(() => child.stdout.write(`${JSON.stringify({ event: 'fatal', error: 'DLL not found' })}\n`), 5)
      return child
    }
    const bridge = new PlcsimBridge({ scriptPath: 's', apiPath: 'a', spawn })
    expect(await errorOf(bridge.start())).toMatch(/DLL not found/)
  })
})

/** API PLCSim factice : instances, zones I / Q / M et variables nommées. */
function fakeRuntime() {
  const state = {
    instances: [{ id: 3, name: 'PLC_1', cpuType: 'CPU1516', state: 'Run', ip: ['192.168.0.1'] }],
    areas: { I: new Array(16).fill(0), Q: new Array(16).fill(0), M: new Array(64).fill(0) },
    tags: { 'Motor.Speed': 12.5, 'Motor.On': true },
    calls: []
  }
  const handler = (method, params) => {
    state.calls.push({ method, params })
    switch (method) {
      case 'instances':
        return state.instances
      case 'create':
        state.instances.push({ id: 7, name: params.name, cpuType: params.cpuType, state: 'Off', ip: [] })
        return 7
      case 'powerOn':
        state.instances.find((i) => i.id === params.id).state = 'Stop'
        return 'OK'
      case 'tags':
        return [{ name: 'Motor.Speed', area: 'DataBlock', dataType: 'Real', primitive: 'Float', offset: 0, bit: 0 }]
      case 'read':
        return params.items.map((item) =>
          item.kind === 'area'
            ? { value: state.areas[item.area].slice(item.offset, item.offset + item.length) }
            : item.name in state.tags
              ? { value: state.tags[item.name] }
              : { error: 'Error Code: -4, DoesNotExist', code: 'DoesNotExist' }
        )
      case 'write':
        state.tags[params.name] = params.value
        return null
      case 'writeArea':
        params.bytes.forEach((b, i) => (state.areas[params.area][params.offset + i] = b))
        return null
      case 'writeBit': {
        const area = state.areas[params.area]
        area[params.offset] = params.value
          ? area[params.offset] | (1 << params.bit)
          : area[params.offset] & ~(1 << params.bit)
        return null
      }
      default:
        return null
    }
  }
  return { state, handler }
}

describe('Gestionnaire PLCSim Advanced', () => {
  let manager
  let dir

  afterEach(async () => {
    await manager?.disconnect()
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
    manager = null
    dir = null
  })

  async function connected(runtime = fakeRuntime(), extra = {}) {
    ;({ dir } = await tempDir('plcsim'))
    fs.writeFileSync(path.join(dir, API_DLL.x64), '')
    const events = { data: [], watches: [] }
    manager = new PlcsimManager({
      dataDir: dir,
      scriptSource: '# script',
      platform: 'win32',
      createBridge: (options) => {
        events.bridgeOptions = options
        return new PlcsimBridge({ ...options, spawn: fakeSpawn(runtime.handler) })
      },
      onData: (d) => events.data.push(d),
      onWatches: (w) => events.watches.push(w),
      ...extra
    })
    await manager.connect({ apiPath: dir })
    return { runtime, events }
  }

  it('n’est disponible que sous Windows', async () => {
    manager = new PlcsimManager({ dataDir: '.', scriptSource: '', platform: 'linux' })
    expect(manager.status().supported).toBe(false)
    expect(await errorOf(manager.connect())).toMatch(/Windows/)
  })

  it('écrit le script du pont avec un BOM et liste les instances', async () => {
    const { events } = await connected()
    expect(fs.readFileSync(events.bridgeOptions.scriptPath, 'utf8')).toBe('﻿# script')
    expect(events.bridgeOptions.apiPath).toBe(dir)
    expect(manager.status()).toMatchObject({ connected: true, info: { apiVersion: '8.0' } })
    expect(manager.status().instances.map((i) => i.name)).toEqual(['PLC_1'])
  })

  it('crée et met sous tension une instance', async () => {
    const { runtime } = await connected()
    expect(await errorOf(manager.createInstance({ name: 'PLC_1' }))).toMatch(/already exists/)
    await manager.createInstance({ name: ' Line_2 ', cpuType: 'CPU1518' })
    expect(runtime.state.calls.find((c) => c.method === 'create').params).toEqual({
      name: 'Line_2',
      cpuType: 'CPU1518'
    })
    const result = await manager.operate('Line_2', 'powerOn')
    expect(result.warning).toBeNull()
    const call = runtime.state.calls.find((c) => c.method === 'powerOn')
    expect(call.params).toEqual({ id: 7, timeout: 60_000 })
    expect(manager.instance('Line_2').state).toBe('Stop')
    expect(await errorOf(manager.operate('Line_2', 'format'))).not.toBe('OK')
    expect(await errorOf(manager.setIp('PLC_1', { ip: '300.1.1.1', mask: '255.255.255.0' }))).toMatch(/IP address/)
  })

  it('surveille et écrit des adresses et des variables', async () => {
    const { runtime, events } = await connected()
    manager.addWatch({ instance: 'PLC_1', kind: 'address', address: 'MD4', dataType: 'Real', label: 'Débit' })
    manager.addWatch({ instance: 'PLC_1', kind: 'address', address: 'I0.3', dataType: 'Bool' })
    const [tag] = await manager.tags('PLC_1')
    expect(tag.type).toBe('Float')
    manager.addWatch({ instance: 'PLC_1', kind: 'tag', name: tag.name, type: tag.type, dataType: tag.dataType })
    manager.addWatch({ instance: 'PLC_1', kind: 'tag', name: 'Missing', type: 'Bool' })
    manager.addWatch({ instance: 'PLC_9', kind: 'address', address: 'MB0', dataType: 'Byte' })
    expect(
      await errorOf(() =>
        manager.addWatch({ instance: 'PLC_1', kind: 'address', address: 'DB1.DBW0', dataType: 'Int' })
      )
    ).toMatch(/inputs/)
    expect(events.watches.at(-1)).toHaveLength(5)

    const [md4, i03, speed, missing, unknown] = manager.status().watches
    await manager.writeWatch(md4.id, '2.5')
    expect(runtime.state.areas.M.slice(4, 8)).toEqual([0x40, 0x20, 0, 0])
    await manager.writeWatch(i03.id, true)
    expect(runtime.state.areas.I[0]).toBe(8)
    await manager.writeWatch(speed.id, '40')
    expect(runtime.state.tags['Motor.Speed']).toBe(40)

    await manager.poll()
    const values = createPointsApi({ manager }).read([md4.id, i03.id, speed.id, missing.id])
    expect(values).toEqual({ [md4.id]: 2.5, [i03.id]: true, [speed.id]: 40, [missing.id]: undefined })
    expect(manager.last.get(missing.id).error).toMatch(/does not exist/)
    expect(manager.last.get(unknown.id).error).toMatch(/PLC_9/)

    const points = createPointsApi({ manager }).points()
    expect(points[0]).toMatchObject({ group: 'plc', name: 'PLC_1 · Débit', numeric: true, writable: true })
    await createPointsApi({ manager }).write(md4.id, 1)
    expect(runtime.state.areas.M.slice(4, 8)).toEqual([0x3f, 0x80, 0, 0])
  })

  it('restaure les surveillances valides et signale l’arrêt du pont', async () => {
    const { runtime } = await connected()
    manager.restoreWatches([
      { id: 'a', instance: 'PLC_1', kind: 'address', address: 'QW2', dataType: 'Int' },
      { id: 'b', instance: 'PLC_1', kind: 'address', address: 'DB1.DBW0', dataType: 'Int' },
      { id: 'c', instance: 'PLC_1', kind: 'tag', name: 'Motor.On', type: 'Bool' },
      { id: 'd', instance: 'PLC_1', kind: 'tag' }
    ])
    expect([...manager.watches.keys()]).toEqual(['a', 'c'])
    expect(runtime.state.calls.some((c) => c.method === 'instances')).toBe(true)
    manager.bridge.child.emit('exit', 3)
    await sleep(10)
    expect(manager.status()).toMatchObject({ connected: false })
    expect(manager.status().error).toMatch(/code 3/)
  })
})

// Essai réel (Windows, S7-PLCSIM Advanced installé) : SULFUR_PLCSIM_LIVE=1 npm test
describe.skipIf(process.platform !== 'win32' || !process.env.SULFUR_PLCSIM_LIVE)('API réelle', () => {
  it('crée une instance, lit et écrit sa mémoire, puis la supprime', async () => {
    const { dir: dataDir, cleanup } = await tempDir('plcsim-live')
    const live = new PlcsimManager({
      dataDir,
      scriptSource: fs.readFileSync(path.resolve('src/modules/plcsim/main/bridge.ps1'), 'utf8')
    })
    const name = `SulfurTest_${process.pid}`
    try {
      const status = await live.connect()
      expect(status.info.runtimeAvailable).toBe(true)
      await live.createInstance({ name, cpuType: 'CPU1516' })
      await live.operate(name, 'powerOn')
      expect(live.instance(name).state).toBe('Stop')
      live.addWatch({ instance: name, kind: 'address', address: 'MD10', dataType: 'Real' })
      live.addWatch({ instance: name, kind: 'address', address: 'I1.2', dataType: 'Bool' })
      const [md10, i12] = live.status().watches
      await live.writeWatch(md10.id, 21.5)
      await live.writeWatch(i12.id, true)
      await live.poll()
      expect(live.last.get(md10.id).value).toBe(21.5)
      expect(live.last.get(i12.id).value).toBe(true)
      expect(await errorOf(live.operate(name, 'run'))).toMatch(/TIA Portal/)
      expect(await live.tags(name)).toEqual([])
    } finally {
      await live.operate(name, 'powerOff').catch(() => {})
      await live.operate(name, 'unregister').catch(() => {})
      await live.disconnect()
      await cleanup()
    }
  }, 180_000)
})
