import { describe, expect, it, vi } from 'vitest'
import { BUNDLE_FORMAT, BUNDLE_VERSION, parseBundle } from '../src/main/config-bundle'
import * as opcua from '@modules/opcua/shared/constants'
import * as modbus from '@modules/modbus/shared/constants'
import * as s7 from '@modules/s7/shared/constants'
import * as mqtt from '@modules/mqtt/shared/constants'
import * as snmp from '@modules/snmp/shared/constants'
import * as http from '@modules/http/shared/constants'
import * as coap from '@modules/coap/shared/constants'
import * as dns from '@modules/dns/shared/constants'
import * as ftp from '@modules/ftp/shared/constants'
import * as sftp from '@modules/ftp/shared/sftp'
import * as ldap from '@modules/ldap/shared/constants'
import * as radius from '@modules/ldap/shared/radius'
import * as simulator from '@modules/simulator/shared/constants'
import * as proxy from '@modules/proxy/shared/constants'
import * as tftp from '@modules/tftp/shared/constants'
import { buildDirectory } from '@modules/ldap/main/server'

vi.mock('electron', () => ({ app: {}, BrowserWindow: {}, dialog: {} }))

/** Fichier joint aux releases GitHub (voir .github/workflows/ci.yml). */
const EXAMPLE_FILE = '../examples/sulfur-config-example.json'

/** Module à instances : liste des instances et section de chacune ([id, rôle, nom, section, config]). */
function withInstances(list) {
  return {
    instances: list.map(([id, role, name]) => ({ id, role, name })),
    ...Object.fromEntries(list.map(([id, , , section, config]) => [`${section}:${id}`, config]))
  }
}

/**
 * Configuration d'exemple : les données d'exemple de chaque module (variables, points, topics,
 * flux…), que les nouvelles installations n'ont plus. Les identifiants d'instance (`server`) sont
 * ceux que visent les flux d'exemple du simulateur (`opcua/server:var-5`, `modbus/server:pt-2`).
 */
export function exampleBundle() {
  const server = (config, section = 'server', id = 'server', name = 'Example server', role = section) => [
    id,
    role,
    name,
    section,
    config
  ]
  return {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    modules: {
      opcua: withInstances([server(opcua.EXAMPLE_SERVER_CONFIG)]),
      modbus: withInstances([server(modbus.EXAMPLE_SERVER_CONFIG)]),
      s7: withInstances([server(s7.EXAMPLE_SERVER_CONFIG)]),
      mqtt: withInstances([
        server(mqtt.EXAMPLE_SERVER_CONFIG),
        server(mqtt.EXAMPLE_CLIENT_CONFIG, 'client', 'client', 'Example client')
      ]),
      snmp: withInstances([
        server(snmp.EXAMPLE_AGENT_CONFIG, 'agent', 'server', 'Example agent'),
        server(snmp.EXAMPLE_MANAGER_CONFIG, 'manager', 'client', 'Example manager')
      ]),
      http: withInstances([server(http.EXAMPLE_SERVER_CONFIG)]),
      coap: withInstances([server(coap.EXAMPLE_SERVER_CONFIG)]),
      dns: withInstances([server(dns.EXAMPLE_SERVER_CONFIG)]),
      ftp: withInstances([
        server(ftp.EXAMPLE_SERVER_CONFIG, 'server', 'ftp', 'Example FTP server'),
        server(sftp.EXAMPLE_SERVER_CONFIG, 'sftpServer', 'sftp', 'Example SFTP server')
      ]),
      ldap: withInstances([
        server(ldap.EXAMPLE_SERVER_CONFIG),
        server(radius.EXAMPLE_RADIUS_SERVER_CONFIG, 'radiusServer', 'radius', 'Example RADIUS server')
      ]),
      simulator: { faults: simulator.EXAMPLE_FAULTS, flows: simulator.EXAMPLE_FLOWS },
      proxy: { rules: proxy.EXAMPLE_RULES }
    }
  }
}

describe('Première installation', () => {
  it('ne contient aucune donnée enregistrée', () => {
    expect(opcua.DEFAULT_SERVER_CONFIG).toMatchObject({ variables: [], methods: [], alarms: [] })
    expect(opcua.DEFAULT_SERVER_SECURITY.users).toEqual([])
    expect(modbus.DEFAULT_SERVER_CONFIG.units.flatMap((u) => u.points)).toEqual([])
    expect(s7.DEFAULT_SERVER_CONFIG).toMatchObject({ dbs: [], points: [] })
    expect(mqtt.DEFAULT_SERVER_CONFIG.topics).toEqual([])
    expect(mqtt.DEFAULT_CLIENT_CONFIG.subscriptions).toEqual([])
    expect(snmp.DEFAULT_AGENT_CONFIG).toMatchObject({ users: [], objects: [], traps: { objects: [], targets: [] } })
    expect(snmp.DEFAULT_MANAGER_CONFIG.monitors).toEqual([])
    expect(http.DEFAULT_SERVER_CONFIG).toMatchObject({ variables: [], routes: [] })
    expect(coap.DEFAULT_SERVER_CONFIG.resources).toEqual([])
    expect(dns.DEFAULT_SERVER_CONFIG.records).toEqual([])
    expect(ftp.DEFAULT_SERVER_CONFIG.users).toEqual([])
    expect(sftp.DEFAULT_SERVER_CONFIG.users).toEqual([])
    expect(ldap.DEFAULT_SERVER_CONFIG.ldif).toBe('')
    expect(buildDirectory(ldap.DEFAULT_SERVER_CONFIG.ldif).size).toBe(0)
    expect(radius.DEFAULT_RADIUS_SERVER_CONFIG).toMatchObject({ clients: [], users: [] })
    expect(simulator.DEFAULT_FAULTS).toEqual([])
    expect(simulator.DEFAULT_FLOWS).toEqual([])
    expect(proxy.DEFAULT_RULES).toEqual([])
  })

  it("crée des clients sans compte, topic, nom ni chemin d'exemple", () => {
    expect(mqtt.DEFAULT_CLIENT_CONFIG).toMatchObject({ will: { topic: '' }, publish: { topic: '', payload: '' } })
    expect(snmp.DEFAULT_USER).toMatchObject({ name: '', authKey: '', privKey: '' })
    expect(snmp.DEFAULT_MANAGER_CONFIG.user).toEqual(snmp.DEFAULT_USER)
    expect(snmp.DEFAULT_AGENT_CONFIG.system).toMatchObject({ contact: '', location: '' })
    expect(dns.DEFAULT_CLIENT_CONFIG.name).toBe('')
    expect(ldap.DEFAULT_CLIENT_CONFIG).toMatchObject({ bindDn: '', base: '' })
    expect(radius.DEFAULT_RADIUS_CLIENT_CONFIG).toMatchObject({ secret: '', username: '', attributes: '' })
    expect(ftp.DEFAULT_CLIENT_CONFIG.username).toBe('')
    expect(sftp.DEFAULT_CLIENT_CONFIG.username).toBe('')
    expect(tftp.DEFAULT_CLIENT_CONFIG.remoteFile).toBe('')
    expect(coap.DEFAULT_CLIENT_CONFIG.path).toBe('/.well-known/core')
    expect(coap.DEFAULT_DEVICE_CONFIG.objects).toEqual({ temperature: false, light: false })
    expect(http.DEFAULT_CLIENT_REQUEST.path).toBe('/')
  })
})

describe("Fichier de configuration d'exemple", () => {
  const bundle = exampleBundle()
  const text = `${JSON.stringify(bundle, null, 2)}\n`

  it('est à jour (régénéré par `npx vitest run -u`)', async () => {
    await expect(text).toMatchFileSnapshot(EXAMPLE_FILE)
  })

  it("s'importe sans section ignorée", () => {
    const ids = Object.keys(bundle.modules)
    const { modules, kept, ignored } = parseBundle(text, ids)
    expect(Object.keys(modules)).toEqual(ids)
    expect(kept).toEqual({})
    expect(ignored).toEqual([])
  })

  it('vise uniquement des points des serveurs de l’exemple', () => {
    const { opcua: o, modbus: m } = bundle.modules
    const pointIds = {
      opcua: o['server:server'].variables.map((v) => `server:${v.id}`),
      modbus: m['server:server'].units.flatMap((u) => u.points.map((p) => `server:${p.id}`))
    }
    const targets = bundle.modules.simulator.flows
      .flatMap((f) => f.nodes)
      .map((n) => n.config.point)
      .filter(Boolean)
    expect(targets.length).toBeGreaterThan(0)
    for (const key of targets) {
      const [moduleId, id] = key.split('/')
      expect(pointIds[moduleId]).toContain(id)
    }
  })
})
