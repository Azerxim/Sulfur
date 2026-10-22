import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button, Card, CommitInput, ErrorBanner, Field, Input, Select } from '@azerxim/sulfur-sdk/ui'
import { TABLES } from '../shared/constants'
import { decodeValue, pointSize } from '../shared/codec'
import { unitLabel } from '../shared/units'
import { modbusApi } from './api'
import { t } from '../shared/i18n'

/** Rafraîchissement de la mémoire affichée (ms). */
const REFRESH = 500
const COLUMNS = 10
const COUNTS = [50, 100, 200, 500]

/** Affichage et saisie d'un registre 16 bits selon le format choisi. */
const FORMATS = {
  UInt16: { show: (w) => String(w), parse: (s) => Number(s) },
  Int16: {
    show: (w) => String(w > 0x7fff ? w - 0x10000 : w),
    parse: (s) => (Number(s) < 0 ? Number(s) + 0x10000 : Number(s))
  },
  Hex: {
    show: (w) => w.toString(16).toUpperCase().padStart(4, '0'),
    parse: (s) => parseInt(String(s).replace(/^0x/i, ''), 16)
  },
  binary: {
    show: (w) => w.toString(2).padStart(16, '0'),
    parse: (s) => parseInt(String(s).replace(/^0b/i, '').replace(/\s/g, ''), 2)
  }
}

const formatNumber = (v) =>
  typeof v === 'number' && !Number.isInteger(v) ? Number(v.toPrecision(7)).toString() : String(v)

/**
 * Explorateur de la mémoire brute du serveur : une table d'un équipement, par pages, rafraîchie en
 * continu. Les adresses occupées par un point sont repérées ; chaque valeur est modifiable.
 */
export default function RegisterExplorer({ units, running, wordOrder }) {
  const [unitId, setUnitId] = useState(units[0]?.id)
  const [table, setTable] = useState('holdingRegisters')
  const [start, setStart] = useState(0)
  const [count, setCount] = useState(100)
  const [format, setFormat] = useState('UInt16')
  const [data, setData] = useState(null)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState(null)
  const unit = units.find((u) => u.id === unitId) ?? units[0]
  const bit = TABLES[table].bit

  useEffect(() => {
    if (!running || !unit) {
      setData(null)
      return
    }
    let stopped = false
    const load = () =>
      modbusApi.server.registers(unit.id, table, start, count).then(
        (values) => {
          if (stopped) return
          setData({ unitId: unit.id, table, start, values })
          setError(null)
        },
        (err) => !stopped && setError(err.message)
      )
    load()
    const timer = setInterval(load, REFRESH)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [running, unit, table, start, count])

  // Adresse → point qui l'occupe, pour la table affichée.
  const owners = useMemo(() => {
    const map = new Map()
    for (const p of unit?.points ?? []) {
      if (p.table !== table) continue
      for (let i = 0; i < pointSize(p.dataType); i++) map.set(Number(p.address) + i, { point: p, first: i === 0 })
    }
    return map
  }, [unit, table])

  const write = (address, value) =>
    modbusApi.server
      .writeRegister(unit.id, table, address, value)
      .then(() => setError(null))
      .catch((err) => setError(err.message))

  const values = data && data.unitId === unit?.id && data.table === table && data.start === start ? data.values : null

  /** Valeur décodée d'un point, d'après la mémoire affichée (si elle le contient en entier). */
  function pointValue(p) {
    const offset = Number(p.address) - start
    if (!values || offset < 0 || offset + pointSize(p.dataType) > values.length) return null
    if (bit) return String(values[offset])
    return formatNumber(decodeValue(values.slice(offset, offset + pointSize(p.dataType)), p.dataType, wordOrder))
  }

  const rows = []
  for (let row = 0; values && row * COLUMNS < values.length; row++) rows.push(row)

  return (
    <Card id="modbus.server.explorer" title={t('modbus.explorer.title')} className="shrink-0" defaultCollapsed>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-[2fr_2fr_1fr_1fr_1fr_auto] items-end gap-3">
          <Field label={t('modbus.explorer.unit')}>
            <Select value={unit?.id ?? ''} onChange={(e) => setUnitId(e.target.value)}>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {unitLabel(u)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('modbus.server.table')}>
            <Select value={table} onChange={(e) => setTable(e.target.value)}>
              {Object.entries(TABLES).map(([k, tb]) => (
                <option key={k} value={k}>
                  {tb.prefix} · {tb.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('modbus.explorer.start')}>
            <Input
              type="number"
              min={0}
              value={start}
              onChange={(e) => setStart(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
            />
          </Field>
          <Field label={t('modbus.explorer.count')}>
            <Select value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {COUNTS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('modbus.client.format')}>
            <Select value={bit ? 'bit' : format} disabled={bit} onChange={(e) => setFormat(e.target.value)}>
              {bit ? (
                <option value="bit">0 / 1</option>
              ) : (
                Object.keys(FORMATS).map((f) => (
                  <option key={f} value={f}>
                    {f === 'binary' ? t('modbus.client.binary') : f}
                  </option>
                ))
              )}
            </Select>
          </Field>
          <div className="flex gap-1">
            <Button
              size="icon"
              className="size-9!"
              title={t('modbus.explorer.previous')}
              disabled={start === 0}
              onClick={() => setStart(Math.max(0, start - count))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              size="icon"
              className="size-9!"
              title={t('modbus.explorer.next')}
              onClick={() => setStart(start + count)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
        <p className="text-xs text-slate-500">{t('modbus.explorer.hint')}</p>
        <ErrorBanner error={error} onClose={() => setError(null)} />

        {!running ? (
          <p className="text-sm text-slate-500">{t('modbus.explorer.notRunning')}</p>
        ) : (
          values && (
            <div className="max-h-[28rem] overflow-auto rounded-md border border-ink-800">
              <table className="w-full table-fixed font-mono text-[13px]">
                <thead className="sticky top-0 z-10 bg-ink-900 text-xs text-slate-500">
                  <tr>
                    <th className="w-20 px-2 py-1 text-left font-medium">{TABLES[table].prefix}</th>
                    {Array.from({ length: COLUMNS }, (_, i) => (
                      <th key={i} className="px-1 py-1 text-right font-medium">
                        +{i}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row} className="border-t border-ink-800">
                      <td className="px-2 py-0.5 text-slate-500 tabular-nums">{start + row * COLUMNS}</td>
                      {Array.from({ length: COLUMNS }, (_, col) => {
                        const index = row * COLUMNS + col
                        if (index >= values.length) return <td key={col} />
                        const address = start + index
                        const raw = values[index]
                        const owner = owners.get(address)
                        const title = owner
                          ? t('modbus.explorer.cellTitle', {
                              address,
                              name: owner.point.name,
                              type: owner.point.dataType,
                              value: pointValue(owner.point) ?? '…'
                            })
                          : String(address)
                        const tint = owner
                          ? `bg-sulfur-400/10 ${owner.first ? 'border-l-2 border-l-sulfur-400/70' : ''}`
                          : ''
                        if (bit) {
                          return (
                            <td key={col} className={`p-0 ${tint}`} title={title}>
                              <button
                                type="button"
                                onClick={() => write(address, !raw)}
                                className={`w-full px-1 py-0.5 text-right tabular-nums hover:bg-ink-800 ${raw ? 'text-emerald-300' : 'text-slate-500'}`}
                              >
                                {raw ? 1 : 0}
                              </button>
                            </td>
                          )
                        }
                        const shown = FORMATS[format].show(raw)
                        return (
                          <td key={col} className={`p-0 ${tint}`} title={title}>
                            {editing === address ? (
                              // Sortie du champ (validée ou non) : fin de l'édition.
                              <div onBlur={() => setEditing(null)}>
                                <CommitInput
                                  autoFocus
                                  className="h-6! px-1! text-right text-xs"
                                  value={shown}
                                  onCommit={(text) => write(address, FORMATS[format].parse(text))}
                                />
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEditing(address)}
                                className={`w-full truncate px-1 py-0.5 text-right tabular-nums hover:bg-ink-800 ${
                                  raw ? 'text-sulfur-300' : 'text-slate-600'
                                } ${format === 'binary' ? 'text-[10px]' : ''}`}
                              >
                                {shown}
                              </button>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </Card>
  )
}
