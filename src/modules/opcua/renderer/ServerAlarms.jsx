import { useState } from 'react'
import { Plus, Send, Trash2 } from 'lucide-react'
import { Button, Card, CommitInput, Field, Input, Select } from '@renderer/components/ui'
import { ALARM_LIMITS, NUMERIC_TYPES } from '../shared/constants'
import { t } from '../shared/i18n'

const isLimit = (v) => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v))

/** Variable sur laquelle une alarme à seuils peut porter. */
export const canHaveAlarm = (v) => NUMERIC_TYPES.includes(v.dataType) && !(Number(v.arrayLength) > 0)

/**
 * État d'une alarme d'après la valeur courante de sa variable : 'inactive', 'normal' ou le seuil
 * franchi (le plus sévère).
 */
function alarmState(alarm, variable, value) {
  if (!variable || !canHaveAlarm(variable) || !ALARM_LIMITS.some((k) => isLimit(alarm[k]))) return 'inactive'
  if (typeof value !== 'number') return null
  const crossed = (key, above) => isLimit(alarm[key]) && (above ? value >= alarm[key] : value <= alarm[key])
  if (crossed('highHigh', true)) return 'highHigh'
  if (crossed('lowLow', false)) return 'lowLow'
  if (crossed('high', true)) return 'high'
  if (crossed('low', false)) return 'low'
  return 'normal'
}

const stateStyles = {
  highHigh: 'text-red-300',
  lowLow: 'text-red-300',
  high: 'text-amber-300',
  low: 'text-amber-300',
  normal: 'text-emerald-300',
  inactive: 'text-slate-500'
}

/** Alarmes à seuils et émission d'événements (modifiables à chaud). */
export default function ServerAlarms({
  alarms,
  variables,
  values,
  busy,
  running,
  duplicates,
  onAdd,
  onUpdate,
  onRemove,
  onRaise
}) {
  const [message, setMessage] = useState(() => t('opcua.alarms.defaultMessage'))
  const [severity, setSeverity] = useState(500)
  const candidates = variables.filter(canHaveAlarm)

  return (
    <Card
      id="opcua.server.alarms"
      title={t('opcua.alarms.title', { count: alarms.length })}
      className="shrink-0"
      actions={
        <>
          {running && <span className="text-xs text-slate-500">{t('ui.liveApplied')}</span>}
          <Button size="sm" disabled={busy} onClick={onAdd}>
            <Plus className="size-3.5" /> {t('ui.add')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {alarms.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="px-1.5 pb-2 font-medium">{t('ui.name')}</th>
                <th className="px-1.5 pb-2 font-medium">{t('opcua.alarms.variable')}</th>
                {ALARM_LIMITS.map((key) => (
                  <th key={key} className="px-1.5 pb-2 font-medium">
                    {t(`opcua.alarms.limits.${key}`)}
                  </th>
                ))}
                <th className="px-1.5 pb-2 font-medium">{t('opcua.alarms.state')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {alarms.map((a) => {
                const variable = variables.find((v) => v.id === a.variable)
                const state = alarmState(a, variable, values[a.variable])
                return (
                  <tr key={a.id}>
                    <td className="p-1.5">
                      <CommitInput
                        value={a.name}
                        disabled={busy}
                        className={duplicates.includes(a.name) || !a.name.trim() ? 'border-red-500/60' : ''}
                        onCommit={(name) => onUpdate(a.id, { name: name.trim() }, { immediate: true })}
                      />
                    </td>
                    <td className="p-1.5">
                      <Select
                        value={variable && canHaveAlarm(variable) ? a.variable : ''}
                        disabled={busy}
                        onChange={(e) => onUpdate(a.id, { variable: e.target.value }, { immediate: true })}
                      >
                        <option value="">—</option>
                        {candidates.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </Select>
                    </td>
                    {ALARM_LIMITS.map((key) => (
                      <td key={key} className="w-28 p-1.5">
                        <Input
                          type="number"
                          value={a[key] ?? ''}
                          disabled={busy}
                          onChange={(e) =>
                            onUpdate(a.id, { [key]: e.target.value === '' ? '' : Number(e.target.value) })
                          }
                        />
                      </td>
                    ))}
                    <td
                      className={`w-28 p-1.5 text-xs ${stateStyles[state] ?? 'text-slate-500'}`}
                      title={state === 'inactive' ? t('opcua.alarms.inactiveHint') : undefined}
                    >
                      {!state || (!running && state !== 'inactive')
                        ? '—'
                        : state === 'normal' || state === 'inactive'
                          ? t(`opcua.alarms.${state}`)
                          : t(`opcua.alarms.limits.${state}`)}
                    </td>
                    <td className="w-10 p-1.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={busy}
                        title={t('ui.remove')}
                        onClick={() => onRemove(a.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <p className="text-xs text-slate-500">{t('opcua.alarms.limitsHint')}</p>

        <div className="flex items-end gap-3 border-t border-ink-800 pt-3">
          <Field label={`${t('opcua.alarms.event')} · ${t('opcua.alarms.message')}`} className="flex-1">
            <Input value={message} onChange={(e) => setMessage(e.target.value)} />
          </Field>
          <Field label={`${t('opcua.alarms.severity')} (1-1000)`} className="w-36">
            <Input
              type="number"
              min={1}
              max={1000}
              value={severity}
              onChange={(e) => setSeverity(Number(e.target.value))}
            />
          </Field>
          <Button disabled={!running} onClick={() => onRaise({ message, severity })}>
            <Send className="size-4" /> {t('opcua.alarms.raise')}
          </Button>
        </div>
      </div>
    </Card>
  )
}
