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
import simulator from '@modules/simulator/renderer'
import trends from '@modules/trends/renderer'
import ca from '@modules/ca/renderer'
import explorer from '@modules/explorer/renderer'
import serial from '@modules/serial/renderer'

/**
 * Modules affichés dans l'interface, par groupe (libellés : app.groups.*), dans l'ordre de la barre
 * latérale. Ajouter les nouveaux modules ici.
 */
export const moduleGroups = [
  { id: 'tools', modules: [simulator, trends, ca, explorer, serial] },
  { id: 'automation', modules: [opcua, modbus, s7, plcsim] },
  { id: 'it', modules: [http, ntp, mqtt, snmp, syslog, dns, dhcp, ldap, ftp, tftp] }
]

export const rendererModules = moduleGroups.flatMap((group) => group.modules)
