import opcua from '@modules/opcua/renderer'
import modbus from '@modules/modbus/renderer'
import http from '@modules/http/renderer'
import ntp from '@modules/ntp/renderer'
import s7 from '@modules/s7/renderer'
import plcsim from '@modules/plcsim/renderer'
import mqtt from '@modules/mqtt/renderer'
import snmp from '@modules/snmp/renderer'
import syslog from '@modules/syslog/renderer'
import dns from '@modules/dns/renderer'
import dhcp from '@modules/dhcp/renderer'
import ldap from '@modules/ldap/renderer'
import tftp from '@modules/tftp/renderer'
import ftp from '@modules/ftp/renderer'
import proxy from '@modules/proxy/renderer'
import coap from '@modules/coap/renderer'
import simulator from '@modules/simulator/renderer'
import trends from '@modules/trends/renderer'
import ca from '@modules/ca/renderer'
import explorer from '@modules/explorer/renderer'
import serial from '@modules/serial/renderer'

/**
 * Modules affichés dans l'interface, par groupe (libellés : app.groups.*), dans l'ordre de la barre
 * latérale : les protocoles d'abord, les outils transverses en dernier. Ajouter les nouveaux modules
 * intégrés ici ; les modules externes sont ajoutés au démarrage, avant le premier rendu (addModule).
 */
export const moduleGroups = [
  { id: 'automation', modules: [opcua, modbus, s7, plcsim] },
  { id: 'it', modules: [http, ntp, mqtt, snmp, syslog, dns, dhcp, ldap, ftp, tftp, coap, proxy] },
  { id: 'tools', modules: [simulator, trends, ca, explorer, serial] }
]

export const rendererModules = moduleGroups.flatMap((group) => group.modules)

/** Ajoute un module (externe) à la fin de son groupe. */
export function addModule(groupId, mod) {
  moduleGroups.find((group) => group.id === groupId).modules.push(mod)
  rendererModules.push(mod)
}
