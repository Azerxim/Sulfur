import { opcuaMainModule } from '@modules/opcua/main'
import { modbusMainModule } from '@modules/modbus/main'
import { httpMainModule } from '@modules/http/main'
import { ntpMainModule } from '@modules/ntp/main'
import { s7MainModule } from '@modules/s7/main'
import { plcsimMainModule } from '@modules/plcsim/main'
import { simulatorMainModule } from '@modules/simulator/main'
import { trendsMainModule } from '@modules/trends/main'

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
  simulatorMainModule,
  trendsMainModule
]
