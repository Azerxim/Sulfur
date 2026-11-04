import { describe, expect, it } from 'vitest'
import { instancePointId, instancesOf, migrateToInstances, nextInstanceName, t } from '@azerxim/sulfur-sdk'
import { defineInstances } from '@azerxim/sulfur-sdk/main'
import { createPointsApi } from '@modules/modbus/main/points'
import { migrateModbusConfig } from '@modules/modbus/shared/units'
import { DEFAULT_SERVER_CONFIG } from '@modules/modbus/shared/constants'
import { summarizeActivity } from '../src/renderer/src/activity'

/** Contexte de module minimal : configuration en mémoire, canaux et événements relevés. */
function fakeContext(initial = {}) {
  let config = initial
  const handlers = {}
  const events = []
  return {
    handlers,
    events,
    replace: (next) => (config = next),
    config: () => config,
    setConfig(section, value) {
      config = { ...config, [section]: value }
      if (value === undefined) delete config[section]
    },
    handle: (action, fn) => (handlers[action] = fn),
    emit: (event, payload) => events.push([event, payload])
  }
}

/** Objet d'instance factice : démarrable, avec un état. */
const fakeObject = (instance) => ({
  instance,
  running: false,
  disposed: false,
  status() {
    return { running: this.running }
  },
  start() {
    this.running = true
  }
})

function setup(initial) {
  const ctx = fakeContext(initial)
  const instances = defineInstances(ctx, {
    server: {
      label: () => 'Serveur',
      create: (instance) => fakeObject(instance),
      busy: (o) => o.running,
      dispose: (o) => (o.disposed = true)
    },
    client: { label: () => 'Client', create: (instance) => fakeObject(instance), busy: () => false }
  })
  instances.handle('server', 'start', (o) => o.start())
  return { ctx, instances, call: (action, ...args) => ctx.handlers[action](...args) }
}

describe('Instances : migration', () => {
  it('ne crée aucune instance pour une configuration neuve', () => {
    expect(migrateToInstances({}, { server: { sections: ['server'], name: 'S1' } })).toEqual({})
    expect(migrateModbusConfig({})).toEqual({})
  })

  it('convertit le serveur et le client uniques en instances, sans changer les identifiants des points', () => {
    const legacy = { server: { ...DEFAULT_SERVER_CONFIG, port: 5021 }, clientRequest: { table: 'coils' }, other: 1 }
    const migrated = migrateModbusConfig(legacy)
    expect(migrated.instances).toEqual([
      { id: 'server', role: 'server', name: `${t('ui.server')} 1` },
      { id: 'client', role: 'client', name: `${t('ui.client')} 1` }
    ])
    expect(migrated['server:server'].port).toBe(5021)
    expect(migrated['clientRequest:client']).toEqual({ table: 'coils' })
    expect(migrated).not.toHaveProperty('server')
    expect(migrated.other).toBe(1)
    // Les anciennes clés de points (`server:<id>`) désignent toujours les mêmes points.
    expect(instancePointId('server', 'pt-1')).toBe('server:pt-1')
    expect(migrateModbusConfig(migrated)).toBe(migrated)
  })

  it('nomme les nouvelles instances par le premier numéro libre', () => {
    expect(nextInstanceName('Serveur', [{ name: 'Serveur 1' }, { name: 'Serveur 3' }])).toBe('Serveur 2')
  })
})

describe('Instances : registre du process principal', () => {
  it('crée, renomme et supprime des instances, en nombre libre', async () => {
    const { ctx, call } = setup()
    expect(call('instances:list')).toEqual([])
    const a = call('instances:create', 'server')
    const b = call('instances:create', 'server')
    const c = call('instances:create', 'client', '  Automate  ')
    expect([a.name, b.name, c.name]).toEqual(['Serveur 1', 'Serveur 2', 'Automate'])
    expect(new Set([a.id, b.id, c.id]).size).toBe(3)
    expect(instancesOf(ctx.config()).map((i) => i.id)).toEqual([a.id, b.id, c.id])

    expect(call('instances:rename', a.id, 'Atelier')).toBe('Atelier')
    expect(() => call('instances:rename', a.id, '  ')).toThrow(t('errors.emptyName'))

    ctx.setConfig(`server:${b.id}`, { port: 1 })
    await call('instances:remove', b.id)
    expect(call('instances:list').map((i) => i.name)).toEqual(['Atelier', 'Automate'])
    expect(ctx.config()).not.toHaveProperty(`server:${b.id}`)
    expect(ctx.events.some(([event]) => event === 'instances')).toBe(true)
  })

  it('adresse chaque instance et refuse de supprimer une instance en marche', async () => {
    const { instances, call } = setup()
    const a = call('instances:create', 'server')
    const b = call('instances:create', 'server')
    call('server:start', a.id)
    expect(call('server:status', a.id)).toEqual({ running: true })
    expect(call('server:status', b.id)).toEqual({ running: false })
    expect(call('server:status').map((s) => [s.instance, s.running])).toEqual([
      [a.id, true],
      [b.id, false]
    ])
    expect(instances.busy()).toBe(true)
    await expect(call('instances:remove', a.id)).rejects.toThrow(t('errors.instanceBusy', { name: a.name }))
    expect(() => call('server:start', 'inconnue')).toThrow(t('errors.unknownInstance', { id: 'inconnue' }))
    const client = call('instances:create', 'client')
    expect(() => call('server:start', client.id)).toThrow(t('errors.unknownInstance', { id: client.id }))
    expect(() => call('instances:create', 'agent')).toThrow(t('errors.unknownRole', { role: 'agent' }))
  })

  it('accepte un état émis pendant la création d’une instance', () => {
    const ctx = fakeContext()
    defineInstances(ctx, {
      client: {
        label: () => 'Client',
        create(instance, { emit }) {
          const object = { status: () => ({ connected: false }) }
          emit('status', object.status()) // comme HttpClient.configure
          return object
        }
      }
    })
    const created = ctx.handlers['instances:create']('client')
    expect(ctx.handlers['client:status']()).toEqual([{ connected: false, instance: created.id, name: 'Client 1' }])
  })

  it('suit la configuration importée ou réinitialisée', () => {
    const { ctx, instances, call } = setup()
    const a = call('instances:create', 'server')
    const first = instances.get(a.id, 'server')
    ctx.replace({ instances: [{ id: 'server', role: 'server', name: 'Importé' }] })
    expect(call('instances:list')).toEqual([{ id: 'server', role: 'server', name: 'Importé' }])
    expect(first.disposed).toBe(true)
    ctx.replace({})
    expect(call('instances:list')).toEqual([])
  })
})

describe('Instances : points Modbus', () => {
  /** Serveur factice : valeurs et défauts relevés. */
  const fakeServer = (values) => ({
    faults: null,
    status: () => ({ running: false }),
    values: () => values,
    setValue(id, value) {
      values[id] = value
    },
    setFaults(faults) {
      this.faults = faults
    }
  })

  it('publie les points de chaque serveur sous leur instance et ne leur transmet que leurs défauts', async () => {
    const a = fakeServer({ 'pt-1': 1 })
    const b = fakeServer({ 'pt-1': 2 })
    const entries = [
      { instance: { id: 'srv-a', role: 'server', name: 'A' }, object: a },
      { instance: { id: 'srv-b', role: 'server', name: 'B' }, object: b }
    ]
    const api = createPointsApi({
      instances: { all: (role) => entries.filter((e) => !role || e.instance.role === role) },
      savedConfig: () => ({})
    })
    const points = api.points()
    expect(points.filter((p) => p.id.endsWith(':pt-1')).map((p) => [p.id, p.groupName])).toEqual([
      ['srv-a:pt-1', 'A'],
      ['srv-b:pt-1', 'B']
    ])
    expect(api.read(['srv-a:pt-1', 'srv-b:pt-1', 'srv-x:pt-1'])).toEqual({
      'srv-a:pt-1': 1,
      'srv-b:pt-1': 2,
      'srv-x:pt-1': undefined
    })
    await api.write('srv-b:pt-1', 9)
    expect(b.values()['pt-1']).toBe(9)

    api.setFaults([
      { id: 'f1', type: 'delay', params: { ms: 10 } },
      { id: 'f2', type: 'freeze', params: {}, points: ['srv-b:pt-1'] }
    ])
    expect(a.faults.map((f) => f.id)).toEqual(['f1'])
    expect(b.faults).toEqual([
      { id: 'f1', type: 'delay', params: { ms: 10 }, points: [] },
      { id: 'f2', type: 'freeze', params: {}, points: ['pt-1'] }
    ])
  })
})

describe('Instances : activité', () => {
  it('compte chaque instance d’un rôle', () => {
    const activity = summarizeActivity({
      'modbus:server:status': [
        { instance: 'a', running: false },
        { instance: 'b', running: true, connections: [{}, {}] }
      ],
      'modbus:client:status': [{ instance: 'c', connected: true }]
    })
    expect(activity).toMatchObject({ active: true, server: true, client: true, sessions: 2 })
    expect(summarizeActivity({ 'modbus:server:status': [] }).active).toBe(false)
  })
})
