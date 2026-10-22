import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button, Card, Field, Input, Select } from '@azerxim/sulfur-sdk/ui'
import { resolveAddress } from '../shared/address'
import { s7Api } from './api'
import { formatValue, hex } from './format'
import { t } from '../shared/i18n'

const PAGE = 256
const COLUMNS = 16
const REFRESH = 500

/** Zones affichables : I, Q, M et chaque DB configuré (clé 'DB<n>'). */
const zoneOf = (key) => (key.startsWith('DB') ? { area: 'DB', db: Number(key.slice(2)) } : { area: key, db: 0 })

/** Mémoire brute de l'automate simulé, rafraîchie en continu ; un clic sur un octet le modifie. */
export default function MemoryExplorer({ running, config, values }) {
  const [zone, setZone] = useState('DB1')
  const [start, setStart] = useState(0)
  const [memory, setMemory] = useState(null)
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState(null)
  const zones = ['I', 'Q', 'M', ...(config.dbs ?? []).map((db) => `DB${db.number}`)]
  const current = zones.includes(zone) ? zone : zones[0]
  const { area, db } = zoneOf(current)

  useEffect(() => {
    if (!running) {
      setMemory(null)
      return
    }
    let cancelled = false
    const load = () =>
      s7Api.server
        .memory(area, db, start, PAGE)
        .then((m) => !cancelled && (setMemory(m), setError(null)))
        .catch((err) => !cancelled && setError(err.message))
    load()
    const timer = setInterval(load, REFRESH)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [running, area, db, start])

  /** Octets occupés par les points de la zone affichée : offset -> point. */
  const owners = useMemo(() => {
    const map = new Map()
    for (const p of config.points ?? []) {
      try {
        const a = resolveAddress(p.address, p.dataType, p.length)
        if (a.area !== area || (area === 'DB' && a.db !== db)) continue
        for (let i = 0; i < a.size; i++) map.set(a.offset + i, p)
      } catch {
        // point invalide : ignoré
      }
    }
    return map
  }, [config.points, area, db])

  const commit = (offset) => {
    setEditing(null)
    const text = draft.trim()
    if (!text) return
    const value = /^(0x|\$)/i.test(text) ? parseInt(text.replace(/^(0x|\$)/i, ''), 16) : Number(text)
    s7Api.server.writeMemory(area, db, offset, value).catch((err) => setError(err.message))
  }

  const size = memory?.size ?? 0
  const rows = []
  if (memory) for (let i = 0; i < memory.bytes.length; i += COLUMNS) rows.push(memory.start + i)

  return (
    <Card id="s7.server.explorer" title={t('s7.explorer.title')} className="shrink-0" defaultCollapsed>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t('s7.explorer.zone')} className="w-48">
            <Select
              value={current}
              onChange={(e) => {
                setZone(e.target.value)
                setStart(0)
              }}
            >
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.startsWith('DB') ? z : t(`s7.areas.${z}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('s7.explorer.start')} className="w-32">
            <Input
              type="number"
              min={0}
              step={COLUMNS}
              value={start}
              onChange={(e) => setStart(Math.max(0, Number(e.target.value) || 0))}
            />
          </Field>
          <div className="flex gap-1">
            <Button
              size="icon"
              title={t('s7.explorer.previous')}
              onClick={() => setStart((s) => Math.max(0, s - PAGE))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              size="icon"
              title={t('s7.explorer.next')}
              disabled={!!size && start + PAGE >= size}
              onClick={() => setStart((s) => s + PAGE)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          {memory && <span className="mb-2 text-xs text-slate-500">{t('s7.explorer.size', { size })}</span>}
        </div>
        <p className="text-xs text-slate-500">{t('s7.explorer.hint')}</p>
        {error && <p className="text-xs text-red-300">{error}</p>}
        {!running ? (
          <p className="text-sm text-slate-500">{t('s7.explorer.notRunning')}</p>
        ) : (
          memory && (
            <div className="overflow-x-auto">
              <table className="font-mono text-xs">
                <thead className="text-slate-500">
                  <tr>
                    <th className="pr-3 text-left font-normal" />
                    {Array.from({ length: COLUMNS }, (_, i) => (
                      <th key={i} className="w-8 text-center font-normal">
                        +{hex(i)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((rowStart) => (
                    <tr key={rowStart}>
                      <td className="pr-3 text-slate-500">{rowStart}</td>
                      {Array.from({ length: COLUMNS }, (_, i) => {
                        const offset = rowStart + i
                        if (offset >= memory.start + memory.bytes.length) return <td key={i} />
                        const byte = memory.bytes[offset - memory.start]
                        const owner = owners.get(offset)
                        const title = owner
                          ? t('s7.explorer.cellTitle', {
                              offset,
                              name: owner.name,
                              type: owner.dataType,
                              value: formatValue(values?.[owner.id])
                            })
                          : `${offset} = ${byte}`
                        return (
                          <td key={i} className="p-0.5 text-center">
                            {editing === offset ? (
                              <input
                                autoFocus
                                className="h-6 w-9 rounded border border-sulfur-500 bg-ink-950 text-center text-slate-100 focus:outline-none"
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onBlur={() => commit(offset)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') e.currentTarget.blur()
                                  if (e.key === 'Escape') setEditing(null)
                                }}
                              />
                            ) : (
                              <button
                                title={title}
                                onClick={() => {
                                  setEditing(offset)
                                  setDraft(`0x${hex(byte)}`)
                                }}
                                className={`h-6 w-9 rounded ${
                                  owner
                                    ? 'bg-sulfur-400/10 text-sulfur-300 hover:bg-sulfur-400/20'
                                    : byte
                                      ? 'text-slate-200 hover:bg-ink-800'
                                      : 'text-slate-600 hover:bg-ink-800'
                                }`}
                              >
                                {hex(byte)}
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
