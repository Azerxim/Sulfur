import { DEFAULT_SEND_CONFIG } from '../shared/constants'
import { escapedText } from '../shared/codec'
import { t } from '../shared/i18n'

const PORT_POINTS = [
  { id: 'port:open', name: 'port open', dataType: 'Boolean', numeric: true, writable: false },
  { id: 'port:rxBytes', name: 'bytes received', dataType: 'Int32', numeric: true, writable: false },
  { id: 'port:txBytes', name: 'bytes sent', dataType: 'Int32', numeric: true, writable: false },
  { id: 'port:rxFrames', name: 'frames received', dataType: 'Int32', numeric: true, writable: false },
  { id: 'port:txFrames', name: 'frames sent', dataType: 'Int32', numeric: true, writable: false },
  { id: 'port:lastReceived', name: 'last frame received (text)', dataType: 'String', numeric: false, writable: false },
  {
    id: 'port:lastReceivedHex',
    name: 'last frame received (hex)',
    dataType: 'String',
    numeric: false,
    writable: false
  },
  { id: 'port:send', name: 'send text', dataType: 'String', numeric: false, writable: true },
  { id: 'port:sendHex', name: 'send hex', dataType: 'String', numeric: false, writable: true },
  { id: 'port:dtr', name: 'DTR', dataType: 'Boolean', numeric: true, writable: true },
  { id: 'port:rts', name: 'RTS', dataType: 'Boolean', numeric: true, writable: true },
  { id: 'port:cts', name: 'CTS', dataType: 'Boolean', numeric: true, writable: false },
  { id: 'port:dsr', name: 'DSR', dataType: 'Boolean', numeric: true, writable: false },
  { id: 'port:dcd', name: 'DCD', dataType: 'Boolean', numeric: true, writable: false }
]

const GATEWAY_POINTS = [
  { id: 'gateway:clients', name: 'gateway clients', dataType: 'Int32', numeric: true, writable: false }
]

const toBoolean = (value) => value === true || value === 1 || /^(true|1|on)$/i.test(String(value ?? '').trim())

/**
 * Points de données du module Terminal série (contrat : `@shared/points`). Écrire `port:send`
 * envoie ce texte (séquences \r, \n, \xNN reconnues) suivi de la fin de ligne choisie dans
 * l'interface, `port:sendHex` envoie des octets en hexadécimal : un flux du simulateur peut ainsi
 * piloter un équipement série.
 */
export function createPointsApi({ terminal, gateway, savedConfig = () => ({}) }) {
  return {
    name: 'Serial',

    points() {
      return [
        ...PORT_POINTS.map((p) => ({ ...p, group: 'client' })),
        ...GATEWAY_POINTS.map((p) => ({ ...p, group: 'server' }))
      ]
    },

    read(ids) {
      const open = terminal.isOpen
      const last = terminal.lastReceived
      const { counters, outputs, signals } = terminal
      const values = {
        'port:open': open,
        'port:rxBytes': counters.rxBytes,
        'port:txBytes': counters.txBytes,
        'port:rxFrames': counters.rxFrames,
        'port:txFrames': counters.txFrames,
        'port:lastReceived': last ? escapedText(last) : undefined,
        'port:lastReceivedHex': last ? last.toString('hex') : undefined,
        'port:dtr': open ? outputs.dtr : undefined,
        'port:rts': open ? outputs.rts : undefined,
        'port:cts': signals?.cts,
        'port:dsr': signals?.dsr,
        'port:dcd': signals?.dcd,
        'gateway:clients': gateway.running ? gateway.clients.size : undefined
      }
      return Object.fromEntries(ids.map((id) => [id, values[id]]))
    },

    async write(id, value) {
      if (id === 'port:send') {
        const { lineEnding } = { ...DEFAULT_SEND_CONFIG, ...savedConfig().send }
        return terminal.send({ mode: 'text', text: String(value ?? ''), lineEnding }, t('serial.log.fromPoint'))
      }
      if (id === 'port:sendHex') {
        return terminal.send({ mode: 'hex', text: String(value ?? '') }, t('serial.log.fromPoint'))
      }
      if (id === 'port:dtr' || id === 'port:rts') return terminal.setOutputs({ [id.slice(5)]: toBoolean(value) })
      throw new Error(t('serial.errors.readOnlyPoint', { id }))
    },

    faultTypes() {
      return []
    },

    setFaults() {}
  }
}
