import { opcuaMainModule } from '@modules/opcua/main'
import { modbusMainModule } from '@modules/modbus/main'
import { httpMainModule } from '@modules/http/main'
import { ntpMainModule } from '@modules/ntp/main'
import { s7MainModule } from '@modules/s7/main'
import { plcsimMainModule } from '@modules/plcsim/main'
import { mqttMainModule } from '@modules/mqtt/main'
import { snmpMainModule } from '@modules/snmp/main'
import { syslogMainModule } from '@modules/syslog/main'
import { dnsMainModule } from '@modules/dns/main'
import { dhcpMainModule } from '@modules/dhcp/main'
import { ldapMainModule } from '@modules/ldap/main'
import { tftpMainModule } from '@modules/tftp/main'
import { ftpMainModule } from '@modules/ftp/main'
import { proxyMainModule } from '@modules/proxy/main'
import { coapMainModule } from '@modules/coap/main'
import { simulatorMainModule } from '@modules/simulator/main'
import { trendsMainModule } from '@modules/trends/main'
import { caMainModule } from '@modules/ca/main'
import { explorerMainModule } from '@modules/explorer/main'
import { serialMainModule } from '@modules/serial/main'

/**
 * Modules chargés côté process principal. Ajouter les nouveaux modules ici.
 * Les modules transverses (simulateur, courbes) viennent après les modules de protocole dont ils
 * utilisent les points : ils sont ainsi arrêtés avant eux.
 */
export const mainModules = [
  opcuaMainModule,
  modbusMainModule,
  httpMainModule,
  ntpMainModule,
  s7MainModule,
  plcsimMainModule,
  mqttMainModule,
  snmpMainModule,
  syslogMainModule,
  dnsMainModule,
  dhcpMainModule,
  ldapMainModule,
  tftpMainModule,
  ftpMainModule,
  proxyMainModule,
  coapMainModule,
  simulatorMainModule,
  trendsMainModule,
  caMainModule,
  explorerMainModule,
  serialMainModule
]
