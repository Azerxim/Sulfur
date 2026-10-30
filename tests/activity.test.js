import { describe, expect, it } from 'vitest'
import { summarizeActivity } from '../src/renderer/src/activity'

describe('Activité des modules', () => {
  it('est inactive sans état ou tout à l’arrêt', () => {
    expect(summarizeActivity().active).toBe(false)
    expect(
      summarizeActivity({ 'opcua:server:status': { running: false }, 'opcua:client:status': { connected: false } })
    ).toEqual({ active: false, server: false, client: false, endpoint: null, port: null, sessions: 0 })
  })

  it('résume un serveur en marche : point d’accès, port et sessions', () => {
    expect(
      summarizeActivity({
        'opcua:server:status': { running: true, endpointUrl: 'opc.tcp://pc:4840/UA/Sulfur', sessions: 3 },
        'opcua:client:status': { connected: false }
      })
    ).toEqual({
      active: true,
      server: true,
      client: false,
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
})
