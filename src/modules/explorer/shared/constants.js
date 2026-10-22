import { builtinManifest } from '@modules/builtin'
export const EXPLORER_MODULE = builtinManifest({
  id: 'explorer',
  name: 'Explorateur réseau',
  description: 'Recherche et identification des équipements industriels et informatiques du réseau'
})

/**
 * Services recherchés. `transport` : 'tcp' (connexion puis identification) ou 'udp' (requête dont
 * la réponse vaut détection). `module` : module de Sulfur qui sait dialoguer avec l'équipement
 * (bouton « Ouvrir dans… »). `tls` : ports chiffrés par défaut.
 */
export const SERVICES = [
  { id: 'modbus', label: 'Modbus TCP', transport: 'tcp', ports: [502], module: 'modbus', group: 'automation' },
  { id: 's7', label: 'Siemens S7', transport: 'tcp', ports: [102], module: 's7', group: 'automation' },
  { id: 'opcua', label: 'OPC UA', transport: 'tcp', ports: [4840], module: 'opcua', group: 'automation' },
  { id: 'enip', label: 'EtherNet/IP', transport: 'tcp', ports: [44818], group: 'automation' },
  { id: 'bacnet', label: 'BACnet/IP', transport: 'udp', ports: [47808], group: 'automation' },
  { id: 'iec104', label: 'IEC 60870-5-104', transport: 'tcp', ports: [2404], group: 'automation' },
  { id: 'dnp3', label: 'DNP3', transport: 'tcp', ports: [20000], group: 'automation' },
  { id: 'mqtt', label: 'MQTT', transport: 'tcp', ports: [1883, 8883], tls: [8883], module: 'mqtt', group: 'it' },
  {
    id: 'http',
    label: 'HTTP / HTTPS',
    transport: 'tcp',
    ports: [80, 443, 8080, 8443],
    tls: [443, 8443],
    module: 'http',
    group: 'it'
  },
  { id: 'snmp', label: 'SNMP', transport: 'udp', ports: [161], module: 'snmp', group: 'it' },
  { id: 'ntp', label: 'NTP', transport: 'udp', ports: [123], module: 'ntp', group: 'it' },
  { id: 'ssh', label: 'SSH', transport: 'tcp', ports: [22], group: 'remote' },
  { id: 'telnet', label: 'Telnet', transport: 'tcp', ports: [23], group: 'remote' },
  { id: 'ftp', label: 'FTP', transport: 'tcp', ports: [21], group: 'remote' },
  { id: 'vnc', label: 'VNC', transport: 'tcp', ports: [5900], group: 'remote' },
  { id: 'rdp', label: 'RDP', transport: 'tcp', ports: [3389], group: 'remote' }
]

/** Groupes de services (libellés : explorer.groups.*). */
export const SERVICE_GROUPS = ['automation', 'it', 'remote']

/** Nombre maximal d'adresses analysées en une fois (un /20). */
export const MAX_HOSTS = 4096

/** Adresses affichées lors de la vérification des cibles. */
export const MAX_PREVIEW = 256

export const DEFAULT_SCAN = {
  targets: '192.168.1.0/24',
  /** Par service : activé et ports (texte libre, séparés par des virgules). */
  services: Object.fromEntries(
    SERVICES.map((s) => [s.id, { enabled: s.group !== 'remote', ports: s.ports.join(', ') }])
  ),
  /** Délai d'attente d'une connexion ou d'une réponse (ms). */
  timeout: 1000,
  /** Connexions simultanées pendant la recherche des ports ouverts. */
  concurrency: 128,
  /** Identification : Unit ID essayés (Modbus), emplacements de CPU (S7), communautés (SNMP). */
  modbusUnitIds: '1, 255, 0',
  s7Slots: '0, 1, 2',
  snmpCommunities: 'public',
  /** Résolution des noms (DNS inverse) des équipements trouvés. */
  resolveNames: true
}
