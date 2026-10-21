import { DEFAULT_SERIAL } from '../shared/constants'
import { t } from '../shared/i18n'

/**
 * Liaisons série (Modbus RTU / ASCII) avec la bibliothèque `serialport`, chargée à la première
 * utilisation : un module natif absent ou incompatible n'empêche pas le reste du module de marcher.
 */
let library = null
async function serialport() {
  if (!library) {
    try {
      library = await import('serialport')
    } catch (err) {
      throw new Error(t('modbus.errors.serialUnavailable', { message: err.message }), { cause: err })
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

/** Paramètres de liaison validés : { path, baudRate, dataBits, parity, stopBits }. */
export function normalizeSerial(options) {
  const serial = { ...DEFAULT_SERIAL, ...options }
  const baudRate = Number(serial.baudRate)
  const dataBits = Number(serial.dataBits)
  const stopBits = Number(serial.stopBits)
  if (!String(serial.path ?? '').trim()) throw new Error(t('modbus.errors.missingSerialPort'))
  if (!Number.isInteger(baudRate) || baudRate < 50 || baudRate > 4_000_000) {
    throw new Error(t('modbus.errors.invalidBaudRate', { value: serial.baudRate }))
  }
  if (![7, 8].includes(dataBits)) throw new Error(t('modbus.errors.invalidDataBits'))
  if (![1, 2].includes(stopBits)) throw new Error(t('modbus.errors.invalidStopBits'))
  if (!['none', 'even', 'odd'].includes(serial.parity)) throw new Error(t('modbus.errors.invalidParity'))
  return { path: String(serial.path).trim(), baudRate, dataBits, parity: serial.parity, stopBits }
}

/** Notation courte d'une liaison : « 19200 8E1 ». */
export const serialLabel = (serial) =>
  `${serial.baudRate} ${serial.dataBits}${serial.parity[0].toUpperCase()}${serial.stopBits}`

/**
 * Ouvre un port série. Retourne un flux (`write`, événements `data`, `close`, `error`, `destroy()`).
 */
export async function openSerialPort(options) {
  const { SerialPort } = await serialport()
  const port = new SerialPort({ ...options, autoOpen: false })
  await new Promise((resolve, reject) =>
    port.open((err) => {
      if (!err) return resolve()
      const busy = /busy|access denied|lock/i.test(err.message)
      reject(
        new Error(
          busy
            ? t('modbus.errors.serialBusy', { path: options.path })
            : t('modbus.errors.serialOpen', { path: options.path, message: err.message }),
          { cause: err }
        )
      )
    })
  )
  return port
}
