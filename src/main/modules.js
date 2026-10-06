import { opcuaMainModule } from '@modules/opcua/main'
import { modbusMainModule } from '@modules/modbus/main'

/** Modules chargés côté process principal. Ajouter les nouveaux modules ici. */
export const mainModules = [opcuaMainModule, modbusMainModule]
