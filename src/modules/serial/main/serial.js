import { DATA_BITS, DEFAULT_PORT_CONFIG, FLOW_CONTROLS, PARITIES, STOP_BITS } from '../shared/constants'
import { t } from '../shared/i18n'

/**
 * Ports série avec la bibliothèque `serialport`, chargée à la première utilisation : un module natif
 * absent ou incompatible n'empêche pas le reste du module de marcher.
 */
let library = null
async function serialport() {
  if (!library) {
    try {
      library = await import('serialport')
    } catch (err) {
      throw new Error(t('serial.errors.unavailable', { message: err.message }), { cause: err })
    }
  }
  return library
}

/** Ports série de la machine : [{ path, manufacturer, serialNumber, vendorId, productId }]. */
export async function listSerialPorts() {
  const { SerialPort } = await serialport()
  const ports = await SerialPort.list()
  return ports
    .map((p) => ({
      path: p.path,
      manufacturer: p.manufacturer ?? null,
      serialNumber: p.serialNumber ?? null,
      vendorId: p.vendorId ?? null,
      productId: p.productId ?? null
    }))
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))
}

/** Paramètres de liaison validés : { path, baudRate, dataBits, parity, stopBits, flowControl, dtr, rts }. */
export function normalizePort(options) {
  const port = { ...DEFAULT_PORT_CONFIG, ...options }
  const baudRate = Number(port.baudRate)
  const dataBits = Number(port.dataBits)
  const stopBits = Number(port.stopBits)
  if (!String(port.path ?? '').trim()) throw new Error(t('serial.errors.missingPort'))
  if (!Number.isInteger(baudRate) || baudRate < 50 || baudRate > 4_000_000) {
    throw new Error(t('serial.errors.invalidBaudRate', { value: port.baudRate }))
  }
  if (!DATA_BITS.includes(dataBits)) throw new Error(t('serial.errors.invalidDataBits'))
  if (!STOP_BITS.includes(stopBits)) throw new Error(t('serial.errors.invalidStopBits'))
  if (!PARITIES.includes(port.parity)) throw new Error(t('serial.errors.invalidParity'))
  if (!FLOW_CONTROLS.includes(port.flowControl)) throw new Error(t('serial.errors.invalidFlowControl'))
  return {
    path: String(port.path).trim(),
    baudRate,
    dataBits,
    parity: port.parity,
    stopBits,
    flowControl: port.flowControl,
    dtr: !!port.dtr,
    rts: !!port.rts
  }
}

/** Notation courte d'une liaison : « 9600 8N1 », « 115200 7E2 RTS/CTS ». */
export function portLabel(port) {
  const flow = { rtscts: ' RTS/CTS', xonxoff: ' XON/XOFF' }[port.flowControl] ?? ''
  return `${port.baudRate} ${port.dataBits}${port.parity[0].toUpperCase()}${port.stopBits}${flow}`
}

/**
 * Ouvre un port série (paramètres de `normalizePort`). Retourne le port `serialport` (`write`,
 * `set`, `get`, événements `data`, `close`, `error`).
 */
export async function openSerialPort(options) {
  const { SerialPort } = await serialport()
  const port = new SerialPort({
    path: options.path,
    baudRate: options.baudRate,
    dataBits: options.dataBits,
    parity: options.parity,
    stopBits: options.stopBits,
    rtscts: options.flowControl === 'rtscts',
    xon: options.flowControl === 'xonxoff',
    xoff: options.flowControl === 'xonxoff',
    autoOpen: false
  })
  await new Promise((resolve, reject) =>
    port.open((err) => {
      if (!err) return resolve()
      const busy = /busy|access denied|lock/i.test(err.message)
      reject(
        new Error(
          busy
            ? t('serial.errors.busy', { path: options.path })
            : t('serial.errors.open', { path: options.path, message: err.message }),
          { cause: err }
        )
      )
    })
  )
  return port
}
