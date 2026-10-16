import opcua from '@modules/opcua/renderer'
import modbus from '@modules/modbus/renderer'
import http from '@modules/http/renderer'
import ntp from '@modules/ntp/renderer'
import s7 from '@modules/s7/renderer'
import plcsim from '@modules/plcsim/renderer'
import simulator from '@modules/simulator/renderer'
import trends from '@modules/trends/renderer'

/** Modules affichés dans l'interface. Ajouter les nouveaux modules ici. */
export const rendererModules = [opcua, modbus, http, ntp, s7, plcsim, simulator, trends]
