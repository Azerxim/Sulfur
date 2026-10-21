import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button, Field, Input, Select } from '@azerxim/sulfur-sdk/ui'
import { BAUD_RATES, DEFAULT_SERIAL } from '../shared/constants'
import { modbusApi } from './api'
import { t } from '../shared/i18n'

export const isSerial = (transport) => transport === 'rtu' || transport === 'ascii'

/**
 * Transport choisi dans une liste unique (Modbus TCP, Modbus/TCP Security, RTU over TCP, RTU, ASCII).
 * `withTls` : Modbus/TCP Security proposé ici (client) plutôt que dans la carte Sécurité (serveur).
 */
export function TransportSelect({ config, onChange, disabled, withTls = false }) {
  const value = withTls && config.transport === 'tcp' && config.security?.mode === 'tls' ? 'tls' : config.transport
  const select = (next) => {
    const transport = next === 'tls' ? 'tcp' : next
    const patch = { transport }
    if (withTls) patch.security = { ...config.security, mode: next === 'tls' ? 'tls' : 'tcp' }
    // ASCII : 7 bits de données le plus souvent, RTU : 8 bits.
    if (isSerial(transport) && transport !== config.transport) {
      patch.serial = { ...DEFAULT_SERIAL, ...config.serial, dataBits: transport === 'ascii' ? 7 : 8 }
    }
    onChange(patch)
  }
  return (
    <Select value={value} disabled={disabled} onChange={(e) => select(e.target.value)}>
      <option value="tcp">{t('modbus.transports.tcp')}</option>
      {withTls && <option value="tls">{t('modbus.transport.tls')}</option>}
      <option value="rtuOverTcp">{t('modbus.transports.rtuOverTcp')}</option>
      <option value="rtu">{t('modbus.transports.rtu')}</option>
      <option value="ascii">{t('modbus.transports.ascii')}</option>
    </Select>
  )
}

/** Port série : saisie libre, avec la liste des ports détectés (actualisable). */
export function SerialPortField({ value, onChange, disabled }) {
  const [ports, setPorts] = useState([])
  const [error, setError] = useState(null)
  const refresh = () =>
    modbusApi
      .serialPorts()
      .then((list) => {
        setPorts(list)
        setError(null)
      })
      .catch((err) => setError(err.message))
  useEffect(() => {
    refresh()
  }, [])

  return (
    <Field label={t('modbus.serial.port')}>
      <div className="flex gap-1">
        <Input
          className="font-mono"
          list="modbus-serial-ports"
          placeholder={ports.length ? ports[0].path : t('modbus.serial.portPlaceholder')}
          title={error ?? (ports.length ? undefined : t('modbus.serial.noPorts'))}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
        <Button variant="ghost" className="shrink-0 px-2" title={t('modbus.serial.refresh')} onClick={refresh}>
          <RefreshCw className="size-3.5" />
        </Button>
      </div>
      <datalist id="modbus-serial-ports">
        {ports.map((p) => (
          <option key={p.path} value={p.path}>
            {[p.manufacturer, p.serialNumber].filter(Boolean).join(' · ')}
          </option>
        ))}
      </datalist>
    </Field>
  )
}

export function BaudRateField({ value, onChange, disabled }) {
  return (
    <Field label={t('modbus.serial.baudRate')}>
      <Input
        type="number"
        list="modbus-baud-rates"
        min={50}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <datalist id="modbus-baud-rates">
        {BAUD_RATES.map((rate) => (
          <option key={rate} value={rate} />
        ))}
      </datalist>
    </Field>
  )
}

/** Bits de données, parité et bits de stop (trois champs, à placer dans une grille). */
export function SerialFormatFields({ serial, onChange, disabled }) {
  const set = (patch) => onChange({ ...serial, ...patch })
  return (
    <>
      <Field label={t('modbus.serial.dataBits')}>
        <Select value={serial.dataBits} disabled={disabled} onChange={(e) => set({ dataBits: Number(e.target.value) })}>
          <option value={8}>8</option>
          <option value={7}>7</option>
        </Select>
      </Field>
      <Field label={t('modbus.serial.parity')}>
        <Select value={serial.parity} disabled={disabled} onChange={(e) => set({ parity: e.target.value })}>
          {['none', 'even', 'odd'].map((p) => (
            <option key={p} value={p}>
              {t(`modbus.serial.parities.${p}`)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t('modbus.serial.stopBits')}>
        <Select value={serial.stopBits} disabled={disabled} onChange={(e) => set({ stopBits: Number(e.target.value) })}>
          <option value={1}>1</option>
          <option value={2}>2</option>
        </Select>
      </Field>
    </>
  )
}
