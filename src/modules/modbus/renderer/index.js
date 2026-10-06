import { Cable } from 'lucide-react'
import { MODBUS_MODULE } from '../shared/constants'
import ModbusView from './ModbusView'

/** Partie "renderer" du module Modbus TCP. */
export default {
  manifest: MODBUS_MODULE,
  icon: Cable,
  Component: ModbusView
}
