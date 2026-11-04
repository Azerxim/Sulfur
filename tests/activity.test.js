import { describe, expect, it } from 'vitest'
import { summarizeActivity } from '../src/renderer/src/activity'

describe('Activité des modules', () => {
  it('est inactive sans état ou tout à l’arrêt', () => {
    expect(summarizeActivity().active).toBe(false)
    expect(
      summarizeActivity({ 'opcua:server:status': { running: false }, 'opcua:client:status': { connected: false } })
    ).toEqual({
      active: false,
      server: false,
      client: false,
      servers: 0,
      clients: 0,
      endpoint: null,
      port: null,
      sessions: 0,
      instanced: false,
      instances: []
    })
  })

  it('résume un serveur en marche : point d’accès, port et sessions', () => {
    expect(
      summarizeActivity({
        'opcua:server:status': { running: true, endpointUrl: 'opc.tcp://pc:4840/UA/Sulfur', sessions: 3 },
        'opcua:client:status': { connected: false }
      })
    ).toMatchObject({
      active: true,
      server: true,
      client: false,
      servers: 1,
      clients: 0,
      endpoint: 'opc.tcp://pc:4840/UA/Sulfur',
      port: '4840',
      sessions: 3
    })
    const modbus = summarizeActivity({
      'modbus:server:status': { running: true, endpoint: '0.0.0.0:502', connections: [{}, {}] }
    })
    expect([modbus.port, modbus.sessions]).toEqual(['502', 2])
  })

  it('reconnaît un client connecté sans en prendre le point d’accès', () => {
    const a = summarizeActivity({ 'opcua:client:status': { connected: true, endpointUrl: 'opc.tcp://plc:4840' } })
    expect([a.active, a.server, a.client, a.endpoint]).toEqual([true, false, true, null])
  })

  it('reconnaît les outils actifs (enregistrement, défauts, port série ouvert)', () => {
    expect(summarizeActivity({ 'trends:status': { recording: true } }).active).toBe(true)
    expect(summarizeActivity({ 'simulator:status': { faults: [{ id: 'f1' }], recording: null } }).active).toBe(true)
    expect(summarizeActivity({ 'serial:status': { open: true } }).active).toBe(true)
    expect(summarizeActivity({ 'simulator:status': { faults: [], recording: null } }).active).toBe(false)
  })

  it('détaille les instances : serveurs et clients comptés un par un', () => {
    const a = summarizeActivity({
      'modbus:server:status': [
        { instance: 'server', name: 'Serveur 1', running: true, endpoint: '0.0.0.0:502', connections: [{}] },
        { instance: 'server-a1b2c3', name: 'Serveur 2', running: true, endpoint: '0.0.0.0:503' },
        { instance: 'server-d4e5f6', name: 'Serveur 3', running: false }
      ],
      'modbus:client:status': [{ instance: 'client', name: 'Client 1', connected: true, endpoint: 'plc:502' }]
    })
    expect([a.active, a.servers, a.clients, a.sessions, a.port, a.instanced]).toEqual([true, 2, 1, 1, '502', true])
    expect(a.instances.map((i) => [i.id, i.name, i.role, i.client, i.active, i.endpoint])).toEqual([
      ['server', 'Serveur 1', 'server', false, true, '0.0.0.0:502'],
      ['server-a1b2c3', 'Serveur 2', 'server', false, true, '0.0.0.0:503'],
      ['server-d4e5f6', 'Serveur 3', 'server', false, false, null],
      ['client', 'Client 1', 'client', true, true, 'plc:502']
    ])
  })

  it('reconnaît les rôles clients des modules à plusieurs protocoles', () => {
    const a = summarizeActivity({
      'ldap:radiusClient:status': [{ instance: 'radiusClient', name: 'Client RADIUS 1', connected: true }],
      'snmp:manager:status': [{ instance: 'client', name: 'Manager 1', polling: true }],
      'snmp:agent:status': []
    })
    expect([a.server, a.servers, a.clients, a.instanced]).toEqual([false, 0, 2, true])
  })
})
