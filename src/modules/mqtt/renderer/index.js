import { RadioTower } from 'lucide-react'
import { MQTT_MODULE } from '../shared/constants'
import MqttView from './MqttView'
import '../shared/locales'

/** Partie "renderer" du module MQTT. */
export default {
  manifest: MQTT_MODULE,
  icon: RadioTower,
  Component: MqttView
}
