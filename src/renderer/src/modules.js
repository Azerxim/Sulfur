import opcua from '@modules/opcua/renderer'
import modbus from '@modules/modbus/renderer'
import simulator from '@modules/simulator/renderer'
import trends from '@modules/trends/renderer'

/** Modules affichés dans l'interface. Ajouter les nouveaux modules ici. */
export const rendererModules = [opcua, modbus, simulator, trends]
